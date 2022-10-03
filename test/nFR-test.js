const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");

const { getSelectors, FacetCutAction } = require('./libraries/diamond.js');

const { div, mul } = require("@prb/math");

describe("unDiamond contract", function() {

	const numGenerations = 10;

	const rewardRatio = ethers.utils.parseUnits("0.35");

	const ORatio = ethers.utils.parseUnits("0.4");

	const percentOfProfit = mul(rewardRatio, ethers.utils.parseUnits("0.6"));

	const successiveRatio = div(ethers.utils.parseUnits("10"), (ethers.utils.parseUnits("10").sub(ethers.utils.parseUnits("1.618")))); // Uses @prb/math mulDiv to get NumGen/(NumGen-1.618)

	const baseSale = ethers.utils.parseUnits("1");

	const saleIncrementor = "0.5";

	const tokenId = 1;

	const expectedFR = "159999999999999998"; // (percentOfProfit at 0.16) 16% of the profit on the first sale (1 ETH profit) should be 0.16 ETH aka 0.16e18, however, due to the precision of the successive ratio it is 2 units off

	const managerCut = ethers.utils.parseUnits("0.30");

	const license = "0"; // CBE_CC0

	const tokenURI = "";

	let unFactory;
	let unDiamond;
	let owner;
	let addrs;

	let oTokenHolders;

	let ERC721Token;

	beforeEach(async function() {
		unFactory = await ethers.getContractFactory("unDiamond");
		[owner, ...addrs] = await ethers.getSigners();

		unDiamond = await unFactory.deploy(owner.address, managerCut, "unTrading Shared Contract", "unNFT", "");
		await unDiamond.deployed();

		const unFacetFactory = await ethers.getContractFactory("unFacet");
		const unFacet = await unFacetFactory.deploy();
		await unFacet.deployed();

		const cut = [{ target: unFacet.address, action: FacetCutAction.Add, selectors: getSelectors(unFacet).remove(['supportsInterface(bytes4)']) }];
		await unDiamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

		unDiamond = await ethers.getContractAt('unFacet', unDiamond.address);

		await unDiamond.mint(owner.address, numGenerations, rewardRatio, ORatio, license, "");
	});

	describe("Deployment and Retrieval", function() {
		it("Should mint to the proper owner", async function() {
			expect(await unDiamond.ownerOf(tokenId)).to.equal(owner.address);
		});

		it("Should set and retrieve the correct FR info", async function() {
			let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("1"), [owner.address]]; // ..., lastSoldPrice, ownerAmount, addressesIunDiamond
			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal(expectedArray);
		});

		it("Should return the proper allotted FR", async function() {
			expect(await unDiamond.retrieveAllottedFR(owner.address)).to.equal(ethers.BigNumber.from("0"));
		});

		it("Should return the proper list info", async function() {
			expect(await unDiamond.retrieveListInfo(tokenId)).deep.to.equal([ ethers.BigNumber.from("0"), ethers.constants.AddressZero, false ]);
		});

	});

	/*
	describe("ERC721 Transactions", function() {
		it("Should fail mint without default FR info", async function() {
			await expect(unDiamond.mintERC721(owner.address, "")).to.be.revertedWith("No Default FR Info has been set");
		});

		it("Should successfully set default FR info and mint", async function() {
			await unDiamond.setDefaultFRInfo(numGenerations, percentOfProfit, successiveRatio);
			await unDiamond.mintERC721(owner.address, "")
			expect(await unDiamond.ownerOf("2")).to.equal(owner.address);
		});

		it("Should treat ERC721 transfer as an unprofitable sale and update data accordingly", async function() {
			await unDiamond["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId);

			let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("2"), [owner.address, addrs[0].address]];
			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal(expectedArray);
		});

		it("Should shift generations properly even if there have only been ERC721 transfers", async function() {
			await unDiamond["transferFrom(address,address,uint256)"](owner.address, addrs[0].address, tokenId);

			for (let transfers = 0; transfers < 9; transfers++) { // This results in 11 total owners, minter, transfer, 9 more transfers.
				let signer = unDiamond.connect(addrs[transfers]);

				await signer["transferFrom(address,address,uint256)"](addrs[transfers].address, addrs[transfers + 1].address, tokenId);
			}

			let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("11"), []];

			for (let a = 0; a < 10; a++) {
				expectedArray[5].push(addrs[a].address);
			}

			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal(expectedArray);

			expect(await waffle.provider.getBalance(unDiamond.address)).to.equal(ethers.BigNumber.from("0"));
		});

		it("Should delete FR info upon burning of NFT", async function() {
			await unDiamond.burnNFT(tokenId);

			let expectedArray = [0, ethers.BigNumber.from("0"), ethers.BigNumber.from("0"), ethers.BigNumber.from("0"), ethers.BigNumber.from("0"), []];
			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal(expectedArray);
		});
	});

	describe("nFR Transactions", function() {

		it("Should fail list if not owner", async function() {
			let signer = unDiamond.connect(addrs[0]);

			await expect(signer.list(tokenId, ethers.utils.parseUnits("1"))).to.be.revertedWith("ERC5173: list caller is not owner nor approved");
		});

		it("Should fail unlist if not owner", async function() {
			let signer = unDiamond.connect(addrs[0]);

			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			await expect(signer.unlist(tokenId)).to.be.revertedWith("ERC5173: unlist caller is not owner nor approved");
		});

		it("Should revert buy if NFT is not listed", async function() {
			let signer = unDiamond.connect(addrs[0]);

			await expect(signer.buy(tokenId, { value: ethers.utils.parseUnits("0.5") })).to.be.revertedWith("Token is not listed");
		});

		it("Should revert buy if msg.value is not equal to salePrice", async function() {
			let signer = unDiamond.connect(addrs[0]);

			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			await expect(signer.buy(tokenId, { value: ethers.utils.parseUnits("0.5") })).to.be.revertedWith("salePrice and msg.value mismatch");
		});

		it("Should list properly", async function() {
			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			expect(await unDiamond.retrieveListInfo(tokenId)).deep.to.equal([ ethers.utils.parseUnits("1"), owner.address, true ]);
		});

		it("Should unlist properly", async function() {
			await unDiamond.unlist(tokenId);

			expect(await unDiamond.retrieveListInfo(tokenId)).deep.to.equal([ ethers.BigNumber.from("0"), ethers.constants.AddressZero, false ]);
		});

		it("Should treat a profitable transaction properly", async function() {
			let signer = unDiamond.connect(addrs[0]);

			let balanceBefore = await waffle.provider.getBalance(addrs[0].address);

			let expectedBalance = balanceBefore.sub(expectedFR);

			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			await signer.buy(tokenId, {
				value: ethers.utils.parseUnits("1")
			});

			expect(await waffle.provider.getBalance(addrs[0].address)).to.be.below(expectedBalance);
			expect(await unDiamond.retrieveAllottedFR(owner.address)).to.equal(expectedFR);
			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal([ numGenerations, percentOfProfit, successiveRatio, ethers.utils.parseUnits("1"), ethers.BigNumber.from("2"), [owner.address, addrs[0].address] ]);
		});

		it("Should treat an unprofitable transaction properly", async function() {
			let signer = await unDiamond.connect(addrs[0]);

			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			await signer.buy(tokenId, {
				value: ethers.utils.parseUnits("1")
			});

			let secondSigner = await unDiamond.connect(addrs[1]);

			let balanceBefore = await waffle.provider.getBalance(addrs[0].address);

			await signer.list(tokenId, ethers.utils.parseUnits("0.5"));

			await secondSigner.buy(tokenId, { value: ethers.utils.parseUnits("0.5") });

			expect(await waffle.provider.getBalance(addrs[0].address)).to.be.above(balanceBefore.sub(ethers.utils.parseUnits("0.001")));
			expect(await unDiamond.retrieveAllottedFR(addrs[0].address)).to.equal(ethers.utils.parseUnits("0"));
			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal([ numGenerations, percentOfProfit, successiveRatio, ethers.utils.parseUnits("0.5"), ethers.BigNumber.from("3"), [owner.address, addrs[0].address, addrs[1].address] ]);
		});

		it("Should reset list info after sale", async function() {
			let signer = await unDiamond.connect(addrs[0]);

			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			await signer.buy(tokenId, {
				value: ethers.utils.parseUnits("1")
			});

			expect(await unDiamond.retrieveListInfo(tokenId)).deep.to.equal([ ethers.BigNumber.from("0"), ethers.constants.AddressZero, false ]);
		});

		it("Should fail if improper data passed to default FR info", async function() {
			await expect(unDiamond.setDefaultFRInfo("0", percentOfProfit, successiveRatio)).to.be.revertedWith("Invalid Data Passed");
			await expect(unDiamond.setDefaultFRInfo(numGenerations, ethers.utils.parseUnits("2"), successiveRatio)).to.be.revertedWith("Invalid Data Passed");
			await expect(unDiamond.setDefaultFRInfo(numGenerations, percentOfProfit, ethers.utils.parseUnits("0"))).to.be.revertedWith("Invalid Data Passed");
		});

		it("Should run through 10 FR generations successfully", async function() {
			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			let s = unDiamond.connect(addrs[0]);

			await s.buy(tokenId, { value: ethers.utils.parseUnits("1") });

			for (let transfers = 0; transfers < 9; transfers++) { // This results in 11 total owners, minter, transfer, 9 more transfers.
				let signer = unDiamond.connect(addrs[transfers]);
				let secondSigner = unDiamond.connect(addrs[transfers + 1]);

				let salePrice = (await unDiamond.retrieveFRInfo(tokenId))[3].add(ethers.utils.parseUnits(saleIncrementor)); // Get lastSoldPrice and add incrementor

				await signer.list(tokenId, salePrice);

				await secondSigner.buy(tokenId, { value: salePrice });
			}

			let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.utils.parseUnits("5.5"), ethers.BigNumber.from("11"), []];

			for (let a = 0; a < 10; a++) {
				expectedArray[5].push(addrs[a].address);
			}

			expect(await unDiamond.retrieveFRInfo(tokenId)).deep.to.equal(expectedArray);

			expect(await waffle.provider.getBalance(unDiamond.address)).to.be.above(ethers.utils.parseUnits("0.879")); // (0.16) + (9 * 0.5 * 0.16) - Taking fixed-point dust into account

			let totalOwners = [owner.address, ...expectedArray[5]];

			let allottedFRs = [];

			for (let o of totalOwners) allottedFRs.push(await unDiamond.retrieveAllottedFR(o));

			let greatestFR = allottedFRs.reduce((m, e) => e.gt(m) ? e : m);

			expect(greatestFR).to.equal(allottedFRs[0]);
		});

		it("Should emit FRDistributed", async function() {
			let signer = unDiamond.connect(addrs[0]);

			await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

			await expect(signer.buy(tokenId, { value: ethers.utils.parseUnits("1") })).to.emit(unDiamond, "FRDistributed")
			.withArgs(tokenId, ethers.utils.parseUnits("1"), expectedFR);
		});

		describe("Claiming", function() {
			it("Should release FR if allotted, and update state accordingly", async function() {
				let signer = unDiamond.connect(addrs[0]);

				await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

				await signer.buy(tokenId, { value: ethers.utils.parseUnits("1") });

				expect(await unDiamond.retrieveAllottedFR(owner.address)).to.equal(expectedFR);
				expect(await waffle.provider.getBalance(unDiamond.address)).to.equal(expectedFR);

				let expectedBalance = (await waffle.provider.getBalance(owner.address)).add(ethers.utils.parseUnits("0.1599"));

				await unDiamond.releaseFR(owner.address);

				expect(await unDiamond.retrieveAllottedFR(owner.address)).to.equal(ethers.utils.parseUnits("0"));
				expect(await waffle.provider.getBalance(unDiamond.address)).to.equal(ethers.utils.parseUnits("0"));
				expect(await waffle.provider.getBalance(owner.address)).to.be.above(expectedBalance);
			});

			it("Should revert if no FR allotted", async function() {
				await expect(unDiamond.releaseFR(owner.address)).to.be.revertedWith("No FR Payment due");
			});

			it("Should emit FRClaimed", async function() {
				let signer = unDiamond.connect(addrs[0]);

				await unDiamond.list(tokenId, ethers.utils.parseUnits("1"));

				await signer.buy(tokenId, { value: ethers.utils.parseUnits("1") });

				await expect(unDiamond.releaseFR(owner.address)).to.emit(unDiamond, "FRClaimed").withArgs(owner.address, expectedFR);
			});
		});
	});
	*/

	describe("untrading Transactions", () => {
		beforeEach(async () => {
			ERC721Token = await (await ethers.getContractFactory("MockERC721")).deploy();

			await ERC721Token.mintNFT(owner.address, "example.com");
		});

		describe("Minting", () => {

		});

		describe("oTokens", () => {

		});

		describe("Licensing", () => {

		});

		describe("Wrapping", () => {

		});

		describe("Unwrapping", () => {

		});

		describe("Management", () => {

		});
	});

	describe("Upgradability", () => {

	});
	
});