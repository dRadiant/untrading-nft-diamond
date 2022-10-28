const { getSelectors, FacetCutAction } = require('../test/libraries/diamond');

module.exports = async function (hre) {
	const {deployments, getNamedAccounts, ethers} = hre;
	const {execute, get} = deployments;

	const {deployer} = await getNamedAccounts();

    const unFacet = await ethers.getContractAt("unFacet", (await get('unFacet')).address);

    const cut = [{ target: unFacet.address, action: FacetCutAction.Add, selectors: getSelectors(unFacet).remove(['supportsInterface(bytes4)']) }];

	await execute('unDiamond', {from: deployer}, 'diamondCut', cut, ethers.constants.AddressZero, "0x");
};
module.exports.tags = ["DiamondCutAdd"];
