import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";

import * as dotenv from "dotenv";
dotenv.config();

const {
  ALCHEMY_URL,
  PRIVATE_KEY,
  EHTERSCAN_API_KEY,
  COINMARKETCAP_API_KEY,
  BNBSCAN_API_KEY,
} = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  gasReporter: {
    enabled: true,
    currency: "USD",
    token: "BNB",
    coinmarketcap: COINMARKETCAP_API_KEY || "",
    gasPriceApi: `https://api.bscscan.com/api?module=proxy&action=eth_gasPrice`,
  },

  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
    strict: true,
  },
};

export default config;
