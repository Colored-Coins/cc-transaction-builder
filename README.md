# cc-transaction-builder
[![Build Status][travis-image]][travis-url] [![NPM version][npm-image]][npm-url] [![Slack Channel][slack-image]][slack-url]

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

ColoredCoins Transaction Builder.<br>
This module is a high-level abstraction for building transactions for issuing and transferring digital assets using the ColoredCoins protocol.

## Note
This repository is a **work in progress**.

## Installation

```sh
npm install cc-transaction-builder
```

## Usage

```js
var ColoredCoinsBuilder = require('cc-transaction-builder')
var ccb = new ColoredCoinsBuilder()
var result = ccb.buildsIssueTransaction({
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
  fee: 5000,
  divisibility: 2
})
console.log(result)
```

will print:

```sh
{ txHex: '01000000017434ffb735c6aef99ef962fc2b0e0c646493492d3b49ad37d9ccc800f2c957b70100000000ffffffff020000000000000000096a074343020522425088c4ad23000000001976a91477c0232b1c5c77f90754c9a400b825547cc30ebd88ac00000000',
  multisigOutputs: [],
  coloredOutputIndexes: [ 1 ],
  assetId: 'La5YH3tri7HbdzTUfeoiZWm8Dv39jJzgKb53JT' }
```

## API

### `builder = ColoredCoinsBuilder([properties])`

Create a new `ColoredCoinsBuilder` instance.

If `properties` is specified, then the default properties will be overridden.

```
{
  network: String,              // Which blockchain network should be used ('testnet' or 'mainnet', default='mainnet')
  defaultFee: Number,           // Transaction miner fee, fixed (default=null)
  defaultFeePerKb: Number,      // Transaction miner fee, per Kb (default=null)
  mindustvalue: Number,         // Minimum value to put in each output, in satoshi (except for OP_RETURN, default=600)
  mindustvaluemultisig: Number  // Minimum value to put in Multisig output, in satoshi (default=700)
}
```

**Note:** only one of `defaultFee` and `defaultFeePerKb` can provided.
If none of them is provided, `fee` will be mandatory in each API call.

### `builder.buildIssueTransaction(args)`

Build an issuance transaction.

`args` is a JSON of the format:

- `utxos`              Object[], array of unspent transaction outputs, **required**. Each consists of:
  - `txid`             String, transaction ID (hex string of length 64).
  - `index`            Number, UTXO index in its transaction.
  - `value`            Number, value of the UTXO, in satoshi.
  - `scriptPubKey`     Object, cosnists of:
    - `addresses`      String[], array of addresses the output is directed to.
    - `hex`            String, the UTXO's locking script hex.
- `issueAddress`       String, the Base58Check Bitcoin (or testnet) address which issues the asset, **required**.
- `amount`             Number, amount of units of the asset to issue, **required**.
- `fee`                Number, transaction miner fee in satoshi, **required** (unless constructed with one of `defaultFee` and `defaultFeePerKb`.
- `divisibility`       Number, how small is the smallest subdivision of the asset, calculated as 10^(-divisibility) (default=0).
- `lockStatus`         Boolean, is the issued asset locked (can't be reissued) or unlocked (default=true).
- `transfer`           Object[], array of transfer objects, each consists of:
  - `amount`           Number, amount of units of the asset to transfer.
  - `address`          String, address to send the assets to.
- `flags`              Object, consists of:
  - `injectPreviousOutput` Boolean, if true each input script will be its previous output script (default=false).
  - `splitChange`      Boolean, split colored change and finance (BTC) change into 2 different outputs (default=false).
- `torrentHash`        String, hex string of length 40 (result of metadata's torrent SHA1).
- `sha2`               String, hex string of length 64 (result of metadata SHA2).

On success, returns JSON which consists of:

- `txHex`                String, the result **unsigned** transaction hex.
- `assetId`              String, asset ID of the newly created asset.
- `multisigOutputs`      Number[], Array of indexes of the transaction multisig outputs.
- `coloredOutputIndexes` Number[], Array of indexes of the transaction colored outputs (carrying assets).
- `receivingAddresses`   String[], Array of addresses which receive the assets.

On failure, may throw an `Error`.

*The description of the 2 following functions will be expanded in the future:*

### `builder.buildSendTransaction(args)`

`args` is a JSON of the format:

- `utxos`
  - `txid`
  - `index`
  - `value`
  - `scriptPubKey`
    - `addresses`
    - `hex`
  - `assets`
    - `assetId`
    - `amount`
- `to`
  - `address`
  - `amount`
  - `assetId`
- `fee`

### `builder.buildIssueTransaction(args)`

`args` is a JSON of the format:

- `utxos`
  - `txid`
  - `index`
  - `value`
  - `scriptPubKey`
    - `addresses`
    - `hex`
  - `assets`
    - `assetId`
    - `amount`
- `burn`
  - `amount`
  - `assetId`
- `fee`

[npm-image]: https://badge.fury.io/js/cc-transaction-builder.svg
[npm-url]: https://npmjs.org/package/cc-transaction-builder
[travis-image]: https://travis-ci.org/Colored-Coins/cc-transaction-builder.svg?branch=master
[travis-url]: https://travis-ci.org/Colored-Coins/cc-transaction-builder
[slack-image]: http://slack.coloredcoins.org/badge.svg
[slack-url]: http://slack.coloredcoins.org
