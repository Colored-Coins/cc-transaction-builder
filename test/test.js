/* eslint-env mocha */
var ColoredCoinsBuilder = require('..')
var ccb = new ColoredCoinsBuilder({network: 'testnet'})
var assert = require('assert')
var clone = require('clone')
var bitcoinjs = require('bitcoinjs-lib')
var Transaction = bitcoinjs.Transaction
var script = bitcoinjs.script
var CC = require('cc-transaction')
var _ = require('lodash')

var issueArgs = {
  utxos: [{
    txid: 'b757c9f200c8ccd937ad493b2d499364640c0e2bfc62f99ef9aec635b7ff3474',
    index: 1,
    value: 598595600,
    scriptPubKey: {
      addresses: ['mrS8spZSamejRTW2HG9xshY4pZqhB1BfLY'],
      hex: '76a91477c0232b1c5c77f90754c9a400b825547cc30ebd88ac'
    }
  }],
  issueAddress: 'mrS8spZSamejRTW2HG9xshY4pZqhB1BfLY',
  amount: 3600,
  fee: 5000
}

describe('builder.buildIssueTransaction(args)', function () {
  it('throws: Must have "utxos"', function (done) {
    var args = clone(issueArgs)
    delete args.utxos
    assert.throws(function () {
      ccb.buildIssueTransaction(args)
    }, /Must have "utxos"/)
    done()
  })

  it('throws: Must have "fee"', function (done) {
    var args = clone(issueArgs)
    delete args.fee
    assert.throws(function () {
      ccb.buildIssueTransaction(args)
    }, /Must have "fee"/)
    done()
  })

  it('throws: Must have "issueAddress"', function (done) {
    var args = clone(issueArgs)
    delete args.issueAddress
    assert.throws(function () {
      ccb.buildIssueTransaction(args)
    }, /Must have "issueAddress"/)
    done()
  })

  it('throws: Must have "amount"', function (done) {
    var args = clone(issueArgs)
    delete args.amount
    assert.throws(function () {
      ccb.buildIssueTransaction(args)
    }, /Must have "amount"/)
    done()
  })

  it('returns valid response with default values', function (done) {
    var result = ccb.buildIssueTransaction(issueArgs)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 3) // OP_RETURN + 2 changes
    assert(result.assetId)
    assert.deepEqual(result.coloredOutputIndexes, [2])
    var sumValueInputs = issueArgs.utxos[0].value
    var sumValueOutputs = _.sumBy(tx.outs, function (output) { return output.value })
    assert.equal(sumValueInputs - sumValueOutputs, issueArgs.fee)
    var opReturnScriptBuffer = script.decompile(tx.outs[0].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.type, 'issuance')
    assert.equal(ccTransaction.amount, issueArgs.amount)
    // default values
    assert.equal(ccTransaction.lockStatus, true)
    assert.equal(ccTransaction.divisibility, 0)
    assert.equal(ccTransaction.aggregationPolicy, 'aggregatable')
    done()
  })

  it('flags.injectPreviousOutput === true: return previous output hex in inputs', function (done) {
    var args = clone(issueArgs)
    args.flags = {injectPreviousOutput: true}
    var result = ccb.buildIssueTransaction(args)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.ins[0].script.toString('hex'), args.utxos[0].scriptPubKey.hex)
    done()
  })

  it('should split change', function (done) {
    var args = clone(issueArgs)
    args.financeChangeAddress = false
    var result = ccb.buildIssueTransaction(args)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 2) // OP_RETURN + 1 change
    assert.deepEqual(result.coloredOutputIndexes, [1])
    done()
  })

  it('should encode torrentHash and sha2', function (done) {
    var args = clone(issueArgs)
    args.sha2 = '59040d5c3bc91b5e28e014541363c0f64d9a2429541fe6cf1c568c63c85fbb20'
    args.torrentHash = '02fcc3d843eaba4d278ed107c0c2b56a146f66b8'
    var result = ccb.buildIssueTransaction(args)
    var tx = Transaction.fromHex(result.txHex)
    var opReturnScriptBuffer = script.decompile(tx.outs[0].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.sha2.toString('hex'), args.sha2)
    assert.equal(ccTransaction.torrentHash.toString('hex'), args.torrentHash)
    done()
  })

  it('should encode torrentHash and sha2', function (done) {
    var args = clone(issueArgs)
    args.sha2 = '59040d5c3bc91b5e28e014541363c0f64d9a2429541fe6cf1c568c63c85fbb20'
    args.torrentHash = '02fcc3d843eaba4d278ed107c0c2b56a146f66b8'
    var result = ccb.buildIssueTransaction(args)
    var tx = Transaction.fromHex(result.txHex)
    var opReturnScriptBuffer = script.decompile(tx.outs[0].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.sha2.toString('hex'), args.sha2)
    assert.equal(ccTransaction.torrentHash.toString('hex'), args.torrentHash)
    done()
  })
})

var sendArgs = {
  utxos: [
    {
      txid: '9ad3154af0fba1c7ff399935f55680810faaf1e382f419fe1247e43edb12941d',
      index: 3,
      value: 9789000,
      used: false,
      blockheight: 577969,
      blocktime: 1444861908000,
      scriptPubKey: {
        asm: 'OP_DUP OP_HASH160 0e8fffc70907a025e65f0bdbc5ec6bb2d326d3a7 OP_EQUALVERIFY OP_CHECKSIG',
        hex: '76a9140e8fffc70907a025e65f0bdbc5ec6bb2d326d3a788ac',
        reqSigs: 1,
        type: 'pubkeyhash',
        addresses: ['mgqxFyV13aG2HQpnQ2bLKTUwm8wTPtssQ5']
      },
      assets: [
        {
          assetId: 'Ua4XPaYTew2DiFNmLT9YDAnvRGeYnsiY1UwV9j',
          amount: 500,
          issueTxid: '3b598a4048557ab507952ee5705040ab1a184e54ed70f31e0e20b0be7549cd09',
          divisibility: 2,
          lockStatus: false,
          aggregationPolicy: 'aggregatable'
        }
      ]
    }
  ],
  to: [{ address: 'mrS8spZSamejRTW2HG9xshY4pZqhB1BfLY', amount: 20, assetId: 'Ua4XPaYTew2DiFNmLT9YDAnvRGeYnsiY1UwV9j' }],
  fee: 5000
}

describe('builder.buildSendTransaction(args)', function () {
  it('throws: Must have "utxos"', function (done) {
    var args = clone(sendArgs)
    delete args.utxos
    assert.throws(function () {
      ccb.buildSendTransaction(args)
    }, /Must have "utxos"/)
    done()
  })

  it('throws: Must have "to"', function (done) {
    var args = clone(sendArgs)
    delete args.to
    assert.throws(function () {
      ccb.buildSendTransaction(args)
    }, /Must have "to"/)
    done()
  })

  it('throws: Must have "fee"', function (done) {
    var args = clone(sendArgs)
    delete args.fee
    assert.throws(function () {
      ccb.buildSendTransaction(args)
    }, /Must have "fee"/)
    done()
  })

  it('returns valid response with default values', function (done) {
    var result = ccb.buildSendTransaction(sendArgs)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 4) // transfer + OP_RETURN + 2 changes
    assert.deepEqual(result.coloredOutputIndexes, [0, 3])
    var sumValueInputs = sendArgs.utxos[0].value
    var sumValueOutputs = _.sumBy(tx.outs, function (output) { return output.value })
    assert.equal(sumValueInputs - sumValueOutputs, sendArgs.fee)
    var opReturnScriptBuffer = script.decompile(tx.outs[1].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.type, 'transfer')
    assert.equal(ccTransaction.payments[0].range, false)
    assert.equal(ccTransaction.payments[0].output, 0)
    assert.equal(ccTransaction.payments[0].input, 0)
    assert.equal(ccTransaction.payments[0].percent, false)
    assert.equal(ccTransaction.payments[0].amount, sendArgs.to[0].amount)
    done()
  })

  it('returns valid response with default values', function (done) {
    var addresses = [
      'mtr98kany9G1XYNU74pRnfBQmaCg2FZLmc',
      'mtrD2mBMp93bc8SmMa9WK6tteUCtYEuQQz',
      'mtr98kany9G1XYNU74pRnfBQmaCg2FZLmc',
      'mivV5HAfYpBQRy7BNUPMWHKAnEg7yVT5Wh',
      'mtr98kany9G1XYNU74pRnfBQmaCg2FZLmc',
      'n1utwqxiwFn6p6P4fjBytbwNWvFUy5tKVq',
      'mtr98kany9G1XYNU74pRnfBQmaCg2FZLmc',
      'mpp9gLXWszG4FwPM8pUEUTiqHAcUc99J5Y',
      'muEK4mzoFJ8XpwTZ6Nj87g7RJbTjjrhZTC',
      'mtaqc9M2svVynsrSunGV9LN63YcWYPGAaD',
      'mtmxEhx1ucf2k9XofrgmsthWnYmKeLXU1c',
      'mwxkhhJUnS8TUiaMB1Gmfk3zu2QJuHcEiV',
      'mhhzCzpJSz7LiRWwSSjQEZ4NsLKvBzY2sK',
      'n2ug8FVg4oBBb4qyMVPwzqj4QowHuM9Hi1',
      'n15wwcX6Zgu7krWV1EXEdSLLTeCvUutvTM',
      'mni9h4mUNsdiGBSJQoMdzeKsCXmTvxxvid',
      'miQ7sSXkmoek3ZcwhZHNCFnVfncTs341UC',
      'miYMk1nKQQWVmMH5xsJRKyqEnHfJf9pEeF',
      'msNcXmKjLYKgMM9TiyQjAvJ69w1L63Zp4N',
      'myhb6JeUJy1JvyVuq5tXJZbADU6EMH24vo',
      'n13Utk1gZv65R9hmBPd2B7m5v4P2gZvwrG',
      'mhKnKtPFCbYpC61buDMgSBB57mqiWvXCUo',
      'my6kMPNS5MdtfDMF9NLXNjkpkHokvoT3qR',
      'mhKnKtPFCbYpC61buDMgSBB57mqiWvXCUo',
      'mjKZeM23nEu7qViqTT3Nd6KCQYcw58WhGc',
      '2N3GSnGbfS36M7u6dynXVyBcbPs9mCUHwEM',
      '2NC8ftGyT9YhZbKvvqFwC8rct4dbqiCyGCM',
      'mxFfdSEbQtqe5GLzLiFFENeRYufomdtFhc',
      'mn5aNzZ2PeaopcyeMxzz7K5k2WK27e6oEm',
      'mqEk4DsCoVMav9NiEjCxJsEHnNGvity8Pz',
      'n2gmBqufUfkcfPF1iKkRM41gaFZLHhmCjL',
      'n27rLEmKU4AbVKntw3mkyQzjGSvXrdpAqc',
      'n1nB1jCx9ABDPvsdbw7AptyZK1WP55xY3X',
      'mzj9s6mgvCRhzmgVQk27K1L5tNhU2nkA3A'
    ]

    var args = clone(sendArgs)
    for (var address of addresses) {
      args.to.push({ address: address, amount: 1, assetId: 'Ua4XPaYTew2DiFNmLT9YDAnvRGeYnsiY1UwV9j' })
    }
    args.sha2 = '59040d5c3bc91b5e28e014541363c0f64d9a2429541fe6cf1c568c63c85fbb20'
    args.torrentHash = '02fcc3d843eaba4d278ed107c0c2b56a146f66b8'
    var result = ccb.buildSendTransaction(args)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    var opReturnScriptBuffer = script.decompile(tx.outs[tx.outs.length - 3].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.multiSig[0].hashType, 'sha2')
    assert.equal(ccTransaction.multiSig[1].hashType, 'torrentHash')
    done()
  })

  it('should encode torrentHash and sha2', function (done) {
    var args = clone(sendArgs)
    args.sha2 = '59040d5c3bc91b5e28e014541363c0f64d9a2429541fe6cf1c568c63c85fbb20'
    args.torrentHash = '02fcc3d843eaba4d278ed107c0c2b56a146f66b8'
    var result = ccb.buildSendTransaction(args)
    var tx = Transaction.fromHex(result.txHex)
    var opReturnScriptBuffer = script.decompile(tx.outs[1].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.sha2.toString('hex'), args.sha2)
    assert.equal(ccTransaction.torrentHash.toString('hex'), args.torrentHash)
    done()
  })

  it('flags.injectPreviousOutput === true: return previous output hex in inputs', function (done) {
    var args = clone(sendArgs)
    args.flags = {injectPreviousOutput: true}
    var result = ccb.buildSendTransaction(args)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.ins[0].script.toString('hex'), args.utxos[0].scriptPubKey.hex)
    done()
  })

  it('should not split change', function (done) {
    var args = clone(sendArgs)
    args.financeChangeAddress = false
    var result = ccb.buildSendTransaction(args)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 3) // transfer + OP_RETURN + 1 change
    assert.deepEqual(result.coloredOutputIndexes, [0, 2])
    done()
  })
})

var burnArgs = {
  utxos: [
    {
      txid: '9ad3154af0fba1c7ff399935f55680810faaf1e382f419fe1247e43edb12941d',
      index: 3,
      value: 9789000,
      used: false,
      blockheight: 577969,
      blocktime: 1444861908000,
      scriptPubKey: {
        asm: 'OP_DUP OP_HASH160 0e8fffc70907a025e65f0bdbc5ec6bb2d326d3a7 OP_EQUALVERIFY OP_CHECKSIG',
        hex: '76a9140e8fffc70907a025e65f0bdbc5ec6bb2d326d3a788ac',
        reqSigs: 1,
        type: 'pubkeyhash',
        addresses: ['mgqxFyV13aG2HQpnQ2bLKTUwm8wTPtssQ5']
      },
      assets: [
        {
          assetId: 'Ua4XPaYTew2DiFNmLT9YDAnvRGeYnsiY1UwV9j',
          amount: 50,
          issueTxid: '3b598a4048557ab507952ee5705040ab1a184e54ed70f31e0e20b0be7549cd09',
          divisibility: 2,
          lockStatus: false,
          aggregationPolicy: 'aggregatable'
        }
      ]
    }
  ],
  burn: [{ amount: 20, assetId: 'Ua4XPaYTew2DiFNmLT9YDAnvRGeYnsiY1UwV9j' }],
  fee: 5000
}

describe('builder.buildBurnTransaction(args)', function () {
  it('returns valid response with default values', function (done) {
    var result = ccb.buildBurnTransaction(burnArgs)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 3) // OP_RETURN + 2 changes
    assert.deepEqual(result.coloredOutputIndexes, [2])
    var sumValueInputs = sendArgs.utxos[0].value
    var sumValueOutputs = _.sumBy(tx.outs, function (output) { return output.value })
    assert.equal(sumValueInputs - sumValueOutputs, burnArgs.fee)
    var opReturnScriptBuffer = script.decompile(tx.outs[0].script)[1]
    var ccTransaction = CC.fromHex(opReturnScriptBuffer)
    assert.equal(ccTransaction.type, 'burn')
    assert.equal(ccTransaction.payments[0].burn, true)
    assert.equal(ccTransaction.payments[0].input, 0)
    assert.equal(ccTransaction.payments[0].amount, burnArgs.burn[0].amount)
    done()
  })
})
