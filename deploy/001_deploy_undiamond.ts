import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { parseUnits } from 'ethers/lib/utils';

const managerCut = parseUnits("0") // No managerCut
const name = "untrading Shared Contract";
const symbol = "unNFT";
const baseURI = "";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;

	const { deployer, untradingManager } = await getNamedAccounts();

	await deploy('unDiamond', {
		from: deployer,
		args: [ untradingManager, managerCut, name, symbol, baseURI ],
	});
};

export default func;
func.tags = ["unDiamond"]