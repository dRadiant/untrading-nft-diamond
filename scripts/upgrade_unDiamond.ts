import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { ethers, deployments, getNamedAccounts } from "hardhat";

import { Selectors, FacetCutAction } from '../test/libraries/diamond';

/**
 * Deploys new unFacet and links it with deployed unDiamond
 */
const main = async () => {  
    const { execute, get } = deployments;

    const { deployer } = await getNamedAccounts();

    const unFacet = await ethers.getContractAt("unFacet", (await get('unFacet')).address);

    const cut = [{ target: unFacet.address, action: FacetCutAction.Replace, selectors: new Selectors(unFacet).remove(['supportsInterface(bytes4)']) }];

    await execute('unDiamond', {from: deployer}, 'diamondCut', cut, ethers.constants.AddressZero, "0x");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});