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
    console.log('result', result)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 2) // OP_RETURN + change
    assert(result.assetId)
    assert.deepEqual(result.coloredOutputIndexes, [1])
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
    args.flags = {splitChange: true}
    var result = ccb.buildIssueTransaction(args)
    assert(result.txHex)
    var tx = Transaction.fromHex(result.txHex)
    assert.equal(tx.ins.length, 1)
    assert.equal(tx.outs.length, 3) // OP_RETURN + 2 changes
    assert.deepEqual(result.coloredOutputIndexes, [2])
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
