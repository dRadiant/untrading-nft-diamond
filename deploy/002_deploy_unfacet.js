module.exports = async function (hre) {
	const {deployments, getNamedAccounts} = hre;
	const {deploy} = deployments;

	const {deployer} = await getNamedAccounts();

	await deploy('unFacet', {
		from: deployer,
	});
};
module.exports.tags = ["unFacet"];