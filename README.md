# Truffle Plugin Sourcify

[![NPM Version](https://img.shields.io/npm/v/truffle-plugin-sourcify.svg)](https://www.npmjs.com/package/truffle-plugin-sourcify)
[![NPM Monthly Downloads](https://img.shields.io/npm/dm/truffle-plugin-sourcify.svg)](https://www.npmjs.com/package/truffle-plugin-sourcify)
[![NPM License](https://img.shields.io/npm/l/truffle-assertions.svg)](https://www.npmjs.com/package/truffle-plugin-sourcify)

This truffle plugin allows you to automatically verify your smart contracts' source code on Sourcify, straight from the Truffle CLI.

## Installation / preparation

1. Install the plugin with npm or yarn
   ```sh
   npm install -D truffle-plugin-sourcify
   yarn add -D truffle-plugin-sourcify
   ```
2. Add the plugin to your `truffle-config.js` file

   ```js
   module.exports = {
     /* ... rest of truffle-config */

     plugins: ["truffle-plugin-sourcify"],
   };
   ```

## Usage

Before running verification, make sure that you have successfully deployed your contracts to a public network with Truffle. The contract deployment must have completely finished without errors, including the final step of "saving migration to chain," so that the artifact files are updated with the required information. If this final step fails, try lowering your global gas limit in your `truffle-config.js` file, as saving migrations to chain uses your global gas limit and gas price, which could be problematic if you do not have sufficient ETH in your wallet to cover this maximum hypothetical cost.

After deployment, run the following command with one or more contracts that you wish to verify:

```
truffle run sourcify SomeContractName --network networkName [--debug]
```

The network parameter should correspond to a network defined in the Truffle config file, with the correct network id set. The Ethereum mainnet and all main public testnets are supported.

For example, if we defined `goerli` as network in Truffle, and we wish to verify the `SimpleStorage` contract:

```
truffle run verify SimpleStorage --network goerli
```

This can take some time, and will eventually return

```
Contract Storage is already verified, verification date: 2022-10-06T07:23:20.647Z
  0x104fE1bc33C8a709DD984FE5ac282BCD1A84b1C0: perfect_match
  Sourcify url: https://sourcify.dev/#/lookup/0x104fE1bc33C8a709DD984FE5ac282BCD1A84b1C0
```
