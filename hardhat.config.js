require("dotenv/config");
require("@nomiclabs/hardhat-waffle");
require('hardhat-deploy');
require("@nomiclabs/hardhat-ethers")

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.8",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },

  namedAccounts: {
    deployer: 0, // Deployer
    untradingManager: process.env.UNTRADING_MANAGER_ADDRESS // Contract/untrading Manager address
  },

  networks: {
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_TOKEN}`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    mumbai: {
      url: `https://rpc-mumbai.matic.today/`, // RPC URL
      accounts: process.env.DEPLOYER_PRIVATE_KEY == undefined ? [] : [`0x${process.env.DEPLOYER_PRIVATE_KEY}`],
      saveDeployments: true,
    },
  },
  
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY
    }
  },

};
