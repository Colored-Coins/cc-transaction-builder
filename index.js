var bitcoinjs = require('bitcoinjs-lib')
var BigNumber = require('bignumber.js')
var _ = require('lodash')
var encodeAssetId = require('cc-assetid-encoder')
var cc = require('cc-transaction')
var findBestMatchByNeededAssets = require('./modules/findBestMatchByNeededAssets')
var Buffer = require('safe-buffer').Buffer
var debug = require('debug')('cc-transaction-builder')
var errors = require('cc-errors')
var bufferReverse = require('buffer-reverse')

var CC_TX_VERSION = 0x02

var ColoredCoinsBuilder = function (properties) {
  properties = properties || {}

  if (typeof properties.network !== 'undefined' &&
      properties.network !== 'testnet' &&
      properties.network !== 'mainnet' &&
      properties.network !== 'litecoin') {
    throw new Error('"network" must be "testnet", "mainnet" or "litecoin"')
  }
  this.network = properties.network || 'mainnet' // 'testnet' or 'mainnet'

  if (properties.defaultFee) {
    this.defaultFee = parseInt(properties.defaultFee)
  }
  this.defaultFeePerKb = parseInt(properties.defaultFeePerKb) || 25000

  this.returnBuilder = properties.returnBuilder
  this.mindustvalue = parseInt(properties.mindustvalue) || 600
  this.mindustvaluemultisig = parseInt(properties.mindustvaluemultisig) || 700
  this.writemultisig = properties.writemultisig || true
}

ColoredCoinsBuilder.prototype._getNetwork = function() {
  switch (this.network){
    case 'testnet':
      return bitcoinjs.networks.testnet
      break
    case 'litecoin':
      return bitcoinjs.networks.litecoin
      break
    default:
      return bitcoinjs.networks.bitcoin
  }
};

ColoredCoinsBuilder.prototype.buildIssueTransaction = function (args) {
  var self = this
  if (!args.utxos) {
    throw new Error('Must have "utxos"')
  }
  if (!args.fee && !self.defaultFee) {
    throw new Error('Must have "fee"')
  }
  if (!args.issueAddress) {
    throw new Error('Must have "issueAddress"')
  }
  if (!args.amount) {
    throw new Error('Must have "amount"')
  }

  if (args.fee) {
    args.fee = parseInt(args.fee)
  }

  args.divisibility = args.divisibility || 0
  args.aggregationPolicy = args.aggregationPolicy || 'aggregatable'
  var txb = new bitcoinjs.TransactionBuilder(this._getNetwork())
  // find inputs to cover the issuance
  var ccArgs = self._addInputsForIssueTransaction(txb, args)
  if (!ccArgs.success) {
    throw new errors.NotEnoughFundsError({ type: 'issue' })
  }
  _.assign(ccArgs, args)
  var res = self._encodeColorScheme(ccArgs)
  res.assetId = ccArgs.assetId
  if (this.returnBuilder) res.txb = txb
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
      debug('current amount ' + utxo.value + ' needed ' + cost)
      debug('utxo.txid', utxo.txid)
      debug('utxo.index', utxo.index)
      txb.addInput(utxo.txid, utxo.index)
      if (txb.tx.ins.length === 1) { // encode asset
        debug(txb.tx.ins[0].script)
        assetId = self._encodeAssetId(
          args.reissueable,
          utxo.txid,
          utxo.index,
          utxo.scriptPubKey.hex,
          args.divisibility,
          args.aggregationPolicy)
      }
      debug('math: ' + current.toNumber() + ' ' + utxo.value)
      current = current.add(utxo.value)
      if (args.flags && args.flags.injectPreviousOutput) {
        var chunks = bitcoinjs.script.decompile(new Buffer(utxo.scriptPubKey.hex, 'hex'))
        txb.tx.ins[txb.tx.ins.length - 1].script = bitcoinjs.script.compile(chunks)
      }
      debug('current amount: ' + current + ' projected cost: ' + cost + ' are were there yet: ' + (current.comparedTo(cost) >= 0))
    } else {
      debug('skipping utxo for input, asset found in utxo: ' + utxo.txid + ':' + utxo.index)
    }
    return current.comparedTo(cost) >= 0
  })
  debug('hasEnoughEquity: ' + hasEnoughEquity)
  if (!hasEnoughEquity) {
    return {success: false}
  }

  change = current - cost
  debug('finished adding inputs to tx')
  debug('change ' + change)
  return {success: true, txb: txb, change: change, assetId: assetId, totalInputs: { amount: current }}
}

ColoredCoinsBuilder.prototype._getIssuanceCost = function (args) {
  var self = this
  var fee = args.fee || self.defaultFee
  var totalCost = fee
  debug('_getTotalIssuenceCost: fee =', fee)
  if (args.transfer && args.transfer.length) {
    args.transfer.forEach(function (to) {
      totalCost += self.mindustvalue
    })
  }

  // TODO: calculate multisig only if actually needed
  if (args.metadata) {
    totalCost += self.writemultisig ? self.mindustvaluemultisig : 0
  }

  // change
  totalCost += self.mindustvalue

  debug('_getTotalIssuenceCost: totalCost =', totalCost)
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
    debug('sending assetIdEncoder locked, first input = ' + txid + ':' + nvout)
  } else {
    debug('sending assetIdEncoder unlocked, first input previousOutput = ', opts.vin[0].previousOutput)
  }

  debug('encoding asset is locked: ' + !reissueable)
  debug(opts)
  var assetId = encodeAssetId(opts)
  debug('assetId: ' + assetId)
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
      debug('payment ' + transferobj.amount + ' ' + txb.tx.outs.length)
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
    throw new errors.CCTransactionConstructionError({ explanation: 'transferring more than issued' })
  }

  // add OP_RETURN
  debug('before encode done')
  var buffer = encoder.encode()

  debug('encoding done, buffer: ', buffer)
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
  debug('all inputs: ' + args.totalInputs.amount + ' all outputs: ' + allOutputValues)
  var lastOutputValue = args.totalInputs.amount - (allOutputValues + fee)
  if (lastOutputValue < self.mindustvalue) {
    var totalCost = self.mindustvalue + args.totalInputs.amount.toNumber()
    throw new errors.NotEnoughFundsError({
      type: 'issuance',
      fee: fee,
      totalCost: totalCost,
      missing: self.mindustvalue - lastOutputValue
    })
  }

  var splitChange = !(args.financeChangeAddress == false)
  var changeAddress = args.financeChangeAddress || args.issueAddress

  if (splitChange && lastOutputValue >= 2 * self.mindustvalue && coloredAmount > 0) {
    var bitcoinChange = lastOutputValue - self.mindustvalue
    lastOutputValue = self.mindustvalue
    debug('adding bitcoin change output with: ' + bitcoinChange)
    txb.addOutput(changeAddress, bitcoinChange)
  }

  if (coloredAmount > 0) {
    // there's a colored change output
    coloredOutputIndexes.push(txb.tx.outs.length)
  }

  debug('adding change output with: ' + lastOutputValue)
  debug('total inputs: ' + args.totalInputs.amount)
  debug('total fee: ' + fee)
  debug('total output without fee: ' + allOutputValues)
  txb.addOutput(args.issueAddress, lastOutputValue || args.change)
  debug('txHex ', txb.tx.toHex())

  return { txHex: txb.tx.toHex(), multisigOutputs: reedemScripts, coloredOutputIndexes: _.uniq(coloredOutputIndexes) }
}

ColoredCoinsBuilder.prototype._generateMultisigAddress = function (pubKeys, m) {
  var self = this
  var ecpubkeys = []
  pubKeys.forEach(function (key) {
    ecpubkeys.push(bitcoinjs.ECPubKey.fromHex(key))
  })
  var script = bitcoinjs.scripts.multisigOutput(m, ecpubkeys)
  var hash = bitcoinjs.crypto.hash160(script)
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

  debug('chunks', chunks)

  var script = bitcoinjs.script.compile(chunks)

  // try compute value to pass mindust
  // TODO: actually comput it with the fee from the api request, this assumes static fee per kb
  tx.outs.unshift({ script: script, value: self._getNoneMinDustByScript(script) })
}

ColoredCoinsBuilder.prototype._getNoneMinDustByScript = function (script) {
  var self = this
  // add 9 to aacount for bitcoind SER_DISK serilaztion before the multiplication
  return (((self.defaultFeePerKb * (script.length + 148 + 9)) / 1000) * 3)
}

function isInputInTx (tx, txid, index) {
  return tx.ins.some(function (input) {
    var id = bufferReverse(input.hash)
    return (id.toString('hex') === txid && input.index === index)
  })
}

ColoredCoinsBuilder.prototype._insertSatoshiToTransaction = function (utxos, txb, missing, inputsValue, metadata) {
  debug('missing: ' + missing)
  var paymentDone = false
  var missingbn = new BigNumber(missing)
  var financeValue = new BigNumber(0)
  var currentAmount = new BigNumber(0)
  if (metadata.financeOutput && metadata.financeOutputTxid) {
    if (isInputInTx(txb.tx, metadata.financeOutputTxid, metadata.financeOutput.n)) { return false }
    financeValue = new BigNumber(metadata.financeOutput.value)
    debug('finance sent through api with value ' + financeValue.toNumber())
    if (financeValue.minus(missingbn) >= 0) {
      // TODO: check there is no asset here
      debug('funding tx ' + metadata.financeOutputTxid)
      txb.tx.addInput(metadata.financeOutputTxid, metadata.financeOutput.n)
      inputsValue.amount += financeValue.toNumber()
      if (metadata.flags && metadata.flags.injectPreviousOutput) {
        var chunks = bitcoinjs.script.decompile(new Buffer(metadata.financeOutput.scriptPubKey.hex, 'hex'))
        txb.tx.ins[txb.ins.length - 1].script = bitcoinjs.script.compile(chunks)
      }
      paymentDone = true
      return paymentDone
    } else {
      debug('finance output not added to transaction finace value: ' + financeValue.toNumber() + ' still needed: ' + missingbn.toNumber())
    }
  } else {
    debug('no financeOutput was given')
  }

  var hasEnoughEquity = utxos.some(function (utxo) {
    utxo.value = Math.round(utxo.value)
    if (!isInputInTx(txb.tx, utxo.txid, utxo.index) && !(utxo.assets && utxo.assets.length)) {
      debug('current amount ' + utxo.value + ' needed ' + missing)
      txb.addInput(utxo.txid, utxo.index)
      inputsValue.amount += utxo.value
      currentAmount = currentAmount.add(utxo.value)
      if (metadata.flags && metadata.flags.injectPreviousOutput) {
        var chunks = bitcoinjs.script.decompile(new Buffer(utxo.scriptPubKey.hex, 'hex'))
        txb.tx.ins[txb.tx.ins.length - 1].script = bitcoinjs.script.compile(chunks)
      }
    }
    return currentAmount.comparedTo(missingbn) >= 0
  })

  debug('hasEnoughEquity: ' + hasEnoughEquity)

  return hasEnoughEquity
}

ColoredCoinsBuilder.prototype._tryAddingInputsForFee = function (txb, utxos, totalInputs, metadata, satoshiCost) {
  var self = this
  debug('tryAddingInputsForFee: current transaction value: ' + totalInputs.amount + ' projected cost: ' + satoshiCost)
  if (satoshiCost > totalInputs.amount) {
    if (!self._insertSatoshiToTransaction(utxos, txb, (satoshiCost - totalInputs.amount), totalInputs, metadata)) {
      debug('not enough satoshi in account for fees')
      return false
    }
  } else { debug('No need for additional finance') }
  return true
}

ColoredCoinsBuilder.prototype.buildSendTransaction = function (args) {
  var self = this
  if (!args.utxos) {
    throw new Error('Must have "utxos"')
  }
  if (!args.to) {
    throw new Error('Must have "to"')
  }
  if (!args.fee && !self.defaultFee) {
    throw new Error('Must have "fee"')
  }

  if (args.fee) {
    args.fee = parseInt(args.fee)
  }

  var txb = new bitcoinjs.TransactionBuilder(self._getNetwork())
  var res = self._addInputsForSendTransaction(txb, args)
  if (this.returnBuilder) res.txb = txb
  return res
}

ColoredCoinsBuilder.prototype._computeCost = function (withfee, args) {
  var self = this
  var fee = withfee ? (args.fee || args.minfee) : 0

  if (args.to && args.to.length) {
    args.to.forEach(function (to) {
      fee += self.mindustvalue
    })
  }
  if (args.rules || args.metadata) { fee += self.writemultisig ? self.mindustvaluemultisig : 0 }

  fee += self.mindustvalue

  debug('comupteCost: ' + fee)
  return fee
}

ColoredCoinsBuilder.prototype._getInputAmountNeededForTx = function (tx, fee) {
  var self = this
  var total = fee
  tx.outs.forEach(function (output) {
    total += self._getNoneMinDustByScript(output.script, fee)
  })
  return total
}

ColoredCoinsBuilder.prototype._getChangeAmount = function (tx, fee, totalInputValue) {
  var allOutputValues = _.sumBy(tx.outs, function (output) { return output.value })
  debug('getChangeAmount: all inputs: ' + totalInputValue.amount + ' all outputs: ' + allOutputValues)
  return (totalInputValue.amount - (allOutputValues + fee))
}

ColoredCoinsBuilder.prototype._addInputsForSendTransaction = function (txb, args) {
  var self = this
  var satoshiCost = self._computeCost(true, args)
  var totalInputs = { amount: 0 }
  var reedemScripts = []
  var coloredOutputIndexes = []

  debug('addInputsForSendTransaction')

  if (args.from) {
    debug('got unspents for address: ' + args.from)
  } else {
    debug('got unspents from parmameter: ' + args.utxos)
    if (args.utxos[0] && args.utxos[0].scriptPubKey && args.utxos[0].scriptPubKey.addresses && args.utxos[0].scriptPubKey.addresses[0]) {
      args.from = args.utxos[0].scriptPubKey.addresses[0]
    }
  }
  var assetList = {}
  args.to.forEach(function (to) {
    debug(to.assetId)
    if (!assetList[to.assetId]) {
      assetList[to.assetId] = { amount: 0, addresses: [], done: false, change: 0, encodeAmount: 0, inputs: [] }
    }
    assetList[to.assetId].amount += to.amount
    if (to.burn) {
      assetList[to.assetId].addresses.push({ address: 'burn', amount: to.amount })
    } else if (!to.address && to.pubKeys && to.m) { // generate a multisig address, remember to return the redeem scripts
      var multisig = self._generateMultisigAddress(to.pubKeys, to.m)
      assetList[to.assetId].addresses.push({ address: multisig.address, amount: to.amount, reedemScript: multisig.reedemScript })
    } else {
      assetList[to.assetId].addresses.push({ address: to.address, amount: to.amount })
    }
  })

  debug('finished creating per asset list')
  for (var asset in assetList) {
    debug('working on asset: ' + asset)
    debug(args.utxos)
    var assetUtxos = args.utxos.filter(function (element, index, array) {
      if (!element.assets) { return false }
      return element.assets.some(function (a) {
        debug('checking ' + a.assetId + ' and ' + asset)
        return (a.assetId === asset)
      })
    })
    if (assetUtxos && assetUtxos.length > 0) {
      debug('have utxo list')
      var key = asset
      assetUtxos.forEach(function (utxo) {
        if (utxo.used) {
          debug('utxo', utxo)
          throw new Error('Output ' + utxo.txid + ':' + utxo.index + ' is already spent!')
        }
      })
      if (!findBestMatchByNeededAssets(assetUtxos, assetList, key, txb, totalInputs, args)) { throw new Error('Not enough units of asset ' + key + ' to cover transfer transaction') }
    } else {
      debug('no utxo list')
      throw new Error('No output with the requested asset: ' + asset)
    }
  }
  debug('reached encoder')
  var encoder = cc.newTransaction(0x4343, CC_TX_VERSION)
  if (!self._tryAddingInputsForFee(txb, args.utxos, totalInputs, args, satoshiCost)) {
    throw new errors.NotEnoughFundsError({
      type: 'issuance',
      fee: args.fee,
      totalCost: satoshiCost,
      missing: satoshiCost - totalInputs.amount
    })
  }

  for (asset in assetList) {
    var currentAsset = assetList[asset]
    debug('encoding asset ' + asset)
    if (!currentAsset.done) {
      debug('current asset state is bad ' + asset)
      throw new errors.NotEnoughAssetsError({ asset: asset })
    }

    debug(currentAsset.addresses)
    var uniqAssets = _.uniqBy(currentAsset.addresses, function (item) { return item.address })
    debug('uniqAssets = ', uniqAssets)
    uniqAssets.forEach(function (address) {
      debug('adding output ' + (txb.tx.outs ? txb.tx.outs.length : 0) + ' for address: ' + address.address + ' with satoshi value ' + self.mindustvalue + ' asset value: ' + address.amount)
      var addressAmountLeft = address.amount
      debug('currentAsset = ', currentAsset, ', currentAsset.inputs.length = ', currentAsset.inputs.length)
      currentAsset.inputs.some(function (input) {
        if (!input.amount) { return false }
        if (addressAmountLeft - input.amount > 0) {
          debug('mapping to input ' + input.index + ' with amount ' + input.amount)
          if (address.address === 'burn') {
            encoder.addBurn(input.index, input.amount)
          } else {
            encoder.addPayment(input.index, input.amount, (txb.tx.outs ? txb.tx.outs.length : 0))
          }
          addressAmountLeft -= input.amount
          debug('left to map from next input ' + addressAmountLeft)
          input.amount = 0
          return false
        } else {
          debug('mapping to input ' + input.index + ' with amount ' + addressAmountLeft)
          if (address.address === 'burn') {
            encoder.addBurn(input.index, addressAmountLeft)
          } else {
            encoder.addPayment(input.index, addressAmountLeft, (txb.tx.outs ? txb.tx.outs.length : 0))
          }
          input.amount -= addressAmountLeft
          addressAmountLeft = 0
          return true
        }
      })
      debug('putting output in transaction')
      if (address.address !== 'burn') {
        txb.addOutput(address.address, self.mindustvalue)
      }
      if (address.reedemScript) {
        reedemScripts.push({ index: txb.tx.outs.length - 1, reedemScript: address.reedemScript, address: address.address })
      }

      debug(txb.tx)
      debug('adding output ' + (txb.tx.outs.length - 1))
    })
    debug('done adding colored outputs')
  }
  debug('before using encoder')
    // add metadata if we have any
  if (args.torrentHash && args.sha2 && self.writemultisig) {
    encoder.setHash(args.torrentHash, args.sha2)
  }
  var buffer = encoder.encode()
  if (buffer.leftover && buffer.leftover.length > 0) {
    encoder.shiftOutputs()
    reedemScripts.forEach(function (item) { item.index += 1 })
    buffer = encoder.encode()
    if (buffer.leftover.length === 1) {
      self._addHashesOutput(txb.tx, args.pubKeyReturnMultisigDust, buffer.leftover[0])
    } else if (buffer.leftover.length === 2) {
      self._addHashesOutput(txb.tx, args.pubKeyReturnMultisigDust, buffer.leftover[1], buffer.leftover[0])
    } else {
      throw new errors.CCTransactionConstructionError()
    }
  }

   // add array of colored ouput indexes
  encoder.payments.forEach(function (payment) {
    if (typeof payment.output !== 'undefined') coloredOutputIndexes.push(payment.output)
  })

  debug('encoding done')
  var ret = bitcoinjs.script.compile([
    bitcoinjs.opcodes.OP_RETURN,
    buffer.codeBuffer
  ])

  txb.addOutput(ret, 0)
  var lastOutputValue = self._getChangeAmount(txb.tx, args.fee, totalInputs)
  var coloredChange = _.keys(assetList).some(function (assetId) {
    return assetList[assetId].change > 0
  })

  var splitChange = !(args.financeChangeAddress == false)
  var changeAddress = args.financeChangeAddress || (Array.isArray(args.from) ? args.from[0] : args.from)

  var numOfChanges = (splitChange && coloredChange && lastOutputValue >= 2 * self.mindustvalue) ? 2 : 1

  if (lastOutputValue < numOfChanges * self.mindustvalue) {
    debug('trying to add additionl inputs to cover transaction')
    satoshiCost = self._getInputAmountNeededForTx(txb.tx, args.fee) + numOfChanges * self.mindustvalue
    if (!self._tryAddingInputsForFee(txb, args.utxos, totalInputs, args, satoshiCost)) {
      throw new errors.NotEnoughFundsError({
        type: 'transfer',
        fee: args.fee,
        totalCost: satoshiCost,
        missing: self.mindustvalue - lastOutputValue
      })
    }
    lastOutputValue = self._getChangeAmount(txb.tx, args.fee, totalInputs)
  }

  if (numOfChanges === 2) {
    txb.addOutput(changeAddress, lastOutputValue - self.mindustvalue)
    lastOutputValue = self.mindustvalue
  }
  if (coloredChange) {
    coloredOutputIndexes.push(txb.tx.outs.length)
  }
  txb.addOutput(Array.isArray(args.from) ? args.from[0] : args.from, lastOutputValue)
  debug('success')
  return { txHex: txb.tx.toHex(), metadataSha1: args.torrentHash, multisigOutputs: reedemScripts, coloredOutputIndexes: _.uniqBy(coloredOutputIndexes) }
}

ColoredCoinsBuilder.prototype.buildBurnTransaction = function (args) {
  var self = this
  args = args || {}
  var to = args.transfer || []
  var burn = args.burn || []
  burn.forEach(function (burnItem) { burnItem.burn = true })
  to.push.apply(to, burn)
  delete args.transfer
  args.to = to
  return self.buildSendTransaction(args)
}

module.exports = ColoredCoinsBuilder
