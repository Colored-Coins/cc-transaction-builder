var bitcoinjs = require('bitcoinjs-lib')
var BigNumber = require('bignumber.js')
var _ = require('lodash')
var encodeAssetId = require('cc-assetid-encoder')
var cc = require('cc-transaction')

var CC_TX_VERSION = 0x02

var ColoredCoinsBuilder = function (properties) {
  properties = properties || {}

  if (typeof properties.network !== 'undefined' && properties.network !== 'testnet' && properties.network !== 'mainnet') {
    throw new Error('"network" must be either "testnet" or "mainnet"')
  }
  this.network = properties.network || 'mainnet' // 'testnet' or 'mainnet'

  if (properties.defaultFee && properties.defaultFeePerKb) {
    throw new Error('Can have at most one of "defaultFee" and "defaultFeePerKb"')
  }
  this.defaultFee = properties.defaultFee
  this.defaultFeePerKb = properties.defaultFeePerKb

  this.mindustvalue = properties.mindustvalue || 600
  this.mindustvaluemultisig = properties.mindustvaluemultisig || 700
}

ColoredCoinsBuilder.prototype.buildIssueTransaction = function (args, callback) {
  var self = this
  if (!args.utxos) {
    throw new Error('Must have "utxos"')
  }
  if (!args.fee && !self.defaultFee && !self.defaultFeePerKb) {
    throw new Error('Must have "fee"')
  }
  if (!args.issueAddress) {
    throw new Error('Must have "issueAddress"')
  }
  if (!args.amount) {
    throw new Error('Must have "amount"')
  }
  args.divisibility = args.divisibility || 0
  args.aggregationPolicy = args.aggregationPolicy || 'aggregatable'

  var txb = new bitcoinjs.TransactionBuilder(self.network === 'testnet' ? bitcoinjs.networks.testnet : bitcoinjs.networks.bitcoin)
  // find inputs to cover the issuance
  var ccArgs = self._addInputsForIssueTransaction(txb, args)
  if (!ccArgs.success) {
    throw new Error('Not enough funds to cover issuance')
  }
  _.assign(ccArgs, args)
  var res = self._encodeColorScheme(ccArgs)
  res.assetId = ccArgs.assetId
  return res
}

ColoredCoinsBuilder.prototype._addInputsForIssueTransaction = function (txb, args) {
  var self = this
  var utxos = args.utxos
  var assetId = ''
  var current
  var cost

  // simple mode
  if (args.financeOutput) {
    current = new BigNumber(args.financeOutput.value)
    cost = new BigNumber(self._getIssuanceCost(args))

    txb.addInput(args.financeOutputTxid, args.financeOutput.n)
    if (args.flags && args.flags.injectPreviousOutput) {
      var chunks = bitcoinjs.script.decompile(new Buffer(args.financeOutput.scriptPubKey.hex, 'hex'))
      txb.tx.ins[txb.tx.ins.length - 1].script = bitcoinjs.script.compile(chunks)
    }

    assetId = self._encodeAssetId(
      args.reissueable,
      args.financeOutputTxid,
      args.financeOutput.n,
      args.financeOutput.scriptPubKey.hex,
      args.divisibility,
      args.aggregationPolicy)

    return {txb: txb, args: args, change: current - cost, assetId: assetId, totalInputs: {amount: current}}
  }

  // add to transaction enough inputs so we can cover the cost
  // send change if any back to us
  current = new BigNumber(0)
  cost = new BigNumber(self._getIssuanceCost(args))
  var change = new BigNumber(0)
  var hasEnoughEquity = utxos.some(function (utxo) {
    if (!isInputInTx(txb.tx, utxo.txid, utxo.index) && !(utxo.assets && utxo.assets.length)) {
      console.log('current amount ' + utxo.value + ' needed ' + cost)
      console.log('utxo.txid', utxo.txid)
      console.log('utxo.index', utxo.index)
      txb.addInput(utxo.txid, utxo.index)
      if (txb.tx.ins.length === 1) { // encode asset
        console.log(txb.tx.ins[0].script)
        assetId = self._encodeAssetId(
          args.reissueable,
          utxo.txid,
          utxo.index,
          utxo.scriptPubKey.hex,
          args.divisibility,
          args.aggregationPolicy)
      }
      console.log('math: ' + current.toNumber() + ' ' + utxo.value)
      current = current.add(utxo.value)
      if (args.flags && args.flags.injectPreviousOutput) {
        var chunks = bitcoinjs.script.decompile(new Buffer(utxo.scriptPubKey.hex, 'hex'))
        txb.tx.ins[txb.tx.ins.length - 1].script = bitcoinjs.script.compile(chunks)
      }
      console.log('current amount: ' + current + ' projected cost: ' + cost + ' are were there yet: ' + (current.comparedTo(cost) >= 0))
    } else {
      console.log('skipping utxo for input, asset found in utxo: ' + utxo.txid + ':' + utxo.index)
    }
    return current.comparedTo(cost) >= 0
  })
  console.log('hasEnoughEquity: ' + hasEnoughEquity)
  if (!hasEnoughEquity) {
    return {success: false}
  }

  change = current - cost
  console.log('finished adding inputs to tx')
  console.log('change ' + change)
  return {success: true, txb: txb, change: change, assetId: assetId, totalInputs: { amount: current }}
}

ColoredCoinsBuilder.prototype._getIssuanceCost = function (args) {
  var self = this
  var fee = args.fee || self.defaultFee
  var totalCost = fee
  console.log('_getTotalIssuenceCost: fee =', fee)
  if (args.transfer && args.transfer.length) {
    args.transfer.forEach(function (to) {
      totalCost += self.mindustvalue
    })
  }

  // TODO: calculate multisig only if actually needed
  if (args.rules || args.metadata) {
    totalCost += self.writemultisig ? self.mindustvaluemultisig : 0
  }

  // change
  totalCost += self.mindustvalue

  console.log('_getTotalIssuenceCost: totalCost =', totalCost)
  return totalCost
}

ColoredCoinsBuilder.prototype._encodeAssetId = function (reissueable, txid, nvout, hex, divisibility, aggregationPolicy) {
  var opts = {
    ccdata: [{
      type: 'issuance',
      lockStatus: !reissueable,
      divisibility: divisibility,
      aggregationPolicy: aggregationPolicy
    }],
    vin: [{
      txid: txid,
      vout: nvout,
      previousOutput: {
        hex: hex
      }
    }]
  }

  if (!reissueable) {
    console.log('sending assetIdEncoder locked, first input = ' + txid + ':' + nvout)
  } else {
    console.log('sending assetIdEncoder unlocked, first input previousOutput = ', opts.vin[0].previousOutput)
  }

  console.log('encoding asset is locked: ' + !reissueable)
  console.log(opts)
  var assetId = encodeAssetId(opts)
  console.log('assetId: ' + assetId)
  return assetId
}

ColoredCoinsBuilder.prototype._encodeColorScheme = function (args) {
  var self = this
  var addMultisig = false
  var encoder = cc.newTransaction(0x4343, CC_TX_VERSION)
  var reedemScripts = []
  var coloredOutputIndexes = []
  var txb = args.txb
  var coloredAmount = args.amount
  var fee = args.fee || self.defaultFee
  var lockStatus
  if (typeof args.lockStatus !== 'undefined') {
    lockStatus = args.lockStatus
  } else if (typeof args.reissueable !== 'undefined') {
    lockStatus = !args.reissueable
  } else if (typeof args.reissuable !== 'undefined') {
    lockStatus = !args.reissuable
  }
  if (typeof lockStatus === 'undefined') {
    // default
    lockStatus = true
  }
  encoder.setLockStatus(lockStatus)
  encoder.setAmount(args.amount, args.divisibility)
  encoder.setAggregationPolicy(args.aggregationPolicy)
  if (args.torrentHash) {
    encoder.setHash(args.torrentHash, args.sha2)
  }

  if (args.transfer) {
    args.transfer.forEach(function (transferobj, i) {
      console.log('payment ' + transferobj.amount + ' ' + txb.tx.outs.length)
      encoder.addPayment(0, transferobj.amount, txb.tx.outs.length)
      coloredAmount -= transferobj.amount
      // check multisig
      if (transferobj.pubKeys && transferobj.m) {
        var multisig = self._generateMultisigAddress(transferobj.pubKeys, transferobj.m)
        reedemScripts.push({index: txb.tx.outs.length, reedemScript: multisig.reedemScript, address: multisig.address})
        txb.addOutput(multisig.address, self.mindustvalue)
      } else {
        txb.addOutput(transferobj.address, self.mindustvalue)
      }
    })
  }

  if (coloredAmount < 0) {
    throw new Error('transferring more than issued')
  }

  // add OP_RETURN
  console.log('before encode done')
  var buffer = encoder.encode()

  console.log('encoding done, buffer: ', buffer)
  if (buffer.leftover && buffer.leftover.length > 0) {
    encoder.shiftOutputs()
    buffer = encoder.encode()
    addMultisig = true
    reedemScripts.forEach(function (item) { item.index += 1 })
  }
  var ret = bitcoinjs.script.compile([
    bitcoinjs.opcodes.OP_RETURN,
    buffer.codeBuffer
  ])

  txb.addOutput(ret, 0)

  // add array of colored ouput indexes
  encoder.payments.forEach(function (payment) {
    coloredOutputIndexes.push(payment.output)
  })

  // need to encode hashes in first tx
  if (addMultisig) {
    if (buffer.leftover && buffer.leftover.length === 1) {
      self._addHashesOutput(txb.tx, args.pubKeyReturnMultisigDust, buffer.leftover[0])
    } else if (buffer.leftover && buffer.leftover.length === 2) {
      self._addHashesOutput(txb.tx, args.pubKeyReturnMultisigDust, buffer.leftover[1], buffer.leftover[0])
    } else {
      throw new Error('enough room for hashes: we offsetted inputs for nothing')
    }
  }

  // add change
  var allOutputValues = _.sumBy(txb.tx.outs, function (output) { return output.value })
  console.log('all inputs: ' + args.totalInputs.amount + ' all outputs: ' + allOutputValues)
  var lastOutputValue = args.totalInputs.amount - (allOutputValues + fee)
  if (lastOutputValue < self.mindustvalue) {
    var totalCost = self.mindustvalue + args.totalInputs.amount.toNumber()
    throw new Error('Not enough funds for issuance. fee: ' + fee + ', totalCost: ', totalCost, ', missing: ', self.mindustvalue - lastOutputValue)
  }

  if (args.flags && args.flags.splitChange && lastOutputValue >= 2 * self.mindustvalue && coloredAmount > 0) {
    var bitcoinChange = lastOutputValue - self.mindustvalue
    lastOutputValue = self.mindustvalue
    console.log('adding bitcoin change output with: ' + bitcoinChange)
    txb.addOutput(args.issueAddress, bitcoinChange)
  }

  if (coloredAmount > 0) {
    // there's a colored change output
    coloredOutputIndexes.push(txb.tx.outs.length)
  }

  console.log('adding change output with: ' + lastOutputValue)
  console.log('total inputs: ' + args.totalInputs.amount)
  console.log('total fee: ' + fee)
  console.log('total output without fee: ' + allOutputValues)
  txb.addOutput(args.issueAddress, lastOutputValue || args.change)
  console.log('txHex ', txb.tx.toHex())

  return { txHex: txb.tx.toHex(), multisigOutputs: reedemScripts, coloredOutputIndexes: _.uniq(coloredOutputIndexes) }
}

ColoredCoinsBuilder.prototype._generateMultisigAddress = function (pubKeys, m) {
  var self = this
  var ecpubkeys = []
  pubKeys.forEach(function (key) {
    ecpubkeys.push(bitcoinjs.ECPubKey.fromHex(key))
  })
  var script = bitcoinjs.scripts.multisigOutput(m, ecpubkeys)
  var hash = bitcoinjs.crypto.hash160(script.toBuffer())
  var multisigAdress = new bitcoinjs.Address(hash, (self.network === 'testnet') ? 0xc4 : 0x05)
  var sendto = multisigAdress.toBase58Check()
  return { address: sendto, reedemScript: script.toHex() }
}

ColoredCoinsBuilder.prototype._addHashesOutput = function (tx, address, sha2, sha1) {
  var self = this
  var chunks = []
  chunks.push(bitcoinjs.opcodes.OP_1)
  chunks.push(address ? new Buffer(address, 'hex') : new Buffer('03ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex'))
  chunks.push(Buffer.concat([new Buffer('03', 'hex'), sha2], 33))
  if (sha1) {
    chunks.push(Buffer.concat([new Buffer('030000000000000000000000', 'hex'), sha1], 33))
    chunks.push(bitcoinjs.opcodes.OP_3)
  } else {
    chunks.push(bitcoinjs.opcodes.OP_2)
  }
  chunks.push(bitcoinjs.opcodes.OP_CHECKMULTISIG)

  console.log('chunks', chunks)

  var script = bitcoinjs.script.compile(chunks)

  // try compute value to pass mindust
  // TODO: actually comput it with the fee from the api request, this assumes static fee per kb
  tx.outs.unshift({ script: script, value: self._getNoneMinDustByScript(script) })
}

ColoredCoinsBuilder.prototype._getNoneMinDustByScript = function (script) {
  var self = this
  // add 9 to aacount for bitcoind SER_DISK serilaztion before the multiplication
  return (((self.defaultFeePerKb * (script.toBuffer().length + 148 + 9)) / 1000) * 3)
}

function isInputInTx (tx, txid, index) {
  return tx.ins.some(function (input) {
    var id = bitcoinjs.bufferutils.reverse(input.hash)
    return (id.toString('hex') === txid && input.index === index)
  })
}

ColoredCoinsBuilder.prototype.buildSendTransaction = function (args, callback) {

}

ColoredCoinsBuilder.prototype.buildBurnTransaction = function (args, callback) {

}

module.exports = ColoredCoinsBuilder