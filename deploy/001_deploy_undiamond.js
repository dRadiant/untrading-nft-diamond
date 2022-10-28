const { parseUnits } = require('ethers/lib/utils');

const managerCut = parseUnits("0") // No managerCut
const name = "untrading Shared Contract";
const symbol = "unNFT";
const baseURI = "";

module.exports = async function (hre) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;

	const {deployer, untradingManager} = await getNamedAccounts();

	await deploy('unDiamond', {
		from: deployer,
		args: [untradingManager, managerCut, name, symbol, baseURI],
	});
};
module.exports.tags = ["unDiamond"];