import { UnFacet } from '../typechain-types/contracts';
import { MockERC721 } from '../typechain-types/contracts/test';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { expect } from "chai";
import { ethers } from "hardhat";

import { Selectors, FacetCutAction } from './libraries/diamond';

import { div, mul } from "@prb/math";

describe("unDiamond contract", function() {

	const numGenerations = 10;

	const rewardRatio = ethers.utils.parseUnits("0.35");

	const ORatio = ethers.utils.parseUnits("0.4");

	const proportionalORatio = mul(rewardRatio, ORatio);

	const percentOfProfit = mul(rewardRatio, ethers.utils.parseUnits("0.6"));

	const successiveRatio = (div(ethers.utils.parseUnits("10"), (ethers.utils.parseUnits("10").sub(ethers.utils.parseUnits("1.618"))))).div(100).mul(100); // Uses @prb/math mulDiv to get NumGen/(NumGen-1.618), then does ( / 100 * 100 ) using BN functions instead

	const baseSale = ethers.utils.parseUnits("1");

	const saleIncrementor = "0.5";

	const tokenId = 1;

	const expectedFR = "159999999999999998"; // (percentOfProfit at 0.16) 16% of the profit on the first sale (1 ETH profit) should be 0.16 ETH aka 0.16e18, however, due to the precision of the successive ratio it is 2 units off

	const managerCut = ethers.utils.parseUnits("0.30");

	const license = "0"; // CBE_CC0

	const tokenURI = "";

	let unFactory;
	let unDiamond: UnFacet; // Uses unFacet ABI - unFacet at unDiamond
	let owner: SignerWithAddress;
	let untradingManager: SignerWithAddress;
	let addrs: SignerWithAddress[];

	let oTokenHolders;

	let ERC721Token: MockERC721;

	beforeEach(async function() {
		unFactory = await ethers.getContractFactory("unDiamond");
		[owner, untradingManager, ...addrs] = await ethers.getSigners();

		const undiamond = await unFactory.deploy(untradingManager.address, managerCut, "untrading Shared Contract", "unNFT", "");
		await undiamond.deployed();

		const unFacetFactory = await ethers.getContractFactory("unFacet");
		const unFacet = await unFacetFactory.deploy();
		await unFacet.deployed();

		const cut = [{ target: unFacet.address, action: FacetCutAction.Add, selectors: new Selectors(unFacet).remove(['supportsInterface(bytes4)']) }];
		await undiamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

		unDiamond = await ethers.getContractAt('unFacet', undiamond.address);

		await unDiamond.mint(owner.address, numGenerations, rewardRatio, ORatio, license, "");
	});

	describe("Deployment and Retrieval", function() {
		it("Should mint to the proper owner", async function() {
			expect(await unDiamond.ownerOf(tokenId)).to.equal(owner.address);
		});

		it("Should set and retrieve the correct FR info", async function() {
			let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("1"), [owner.address]]; // ..., lastSoldPrice, ownerAmount, addressesIunDiamond
			expect(await unDiamond.retrieveFRInfo(tokenId)).to.deep.equal(expectedArray);
		});

		it("Should return the proper allotted FR", async function() {
			expect(await unDiamond.retrieveAllottedFR(owner.address)).to.equal(ethers.BigNumber.from("0"));
		});

		it("Should return the proper list info", async function() {
			expect(await unDiamond.retrieveListInfo(tokenId)).to.deep.equal([ ethers.BigNumber.from("0"), ethers.constants.AddressZero, false ]);
		});

		it("Should return the proper manager info", async () => {
			expect(await unDiamond.retrieveManagerInfo()).to.deep.equal([ untradingManager.address, managerCut ]);
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
			let ERC721TokenContract = await (await ethers.getContractFactory("MockERC721")).deploy();

			ERC721Token = await ethers.getContractAt("MockERC721", ERC721TokenContract.address);

			await ERC721Token.mintNFT(owner.address, "example.com");
		});

		describe("Minting", () => {
			describe("Reverts", () => {
				it("Should revert if numGenerations out of range", async () => {
					await expect(unDiamond.mint(owner.address, 25, rewardRatio, ORatio, license, "")).to.be.revertedWith("numGenerations must be between 5 and 20");
					await expect(unDiamond.mint(owner.address, 4, rewardRatio, ORatio, license, "")).to.be.revertedWith("numGenerations must be between 5 and 20");
				});

				it("Should revert if rewardRatio out of range", async () => {
					await expect(unDiamond.mint(owner.address, numGenerations, ethers.utils.parseUnits("0.04"), ORatio, license, "")).to.be.revertedWith("rewardRatio must be between 5% and 50%");
					await expect(unDiamond.mint(owner.address, numGenerations, ethers.utils.parseUnits("0.51"), ORatio, license, "")).to.be.revertedWith("rewardRatio must be between 5% and 50%");
				});

				it("Should revert if ORatio out of range", async () => {
					await expect(unDiamond.mint(owner.address, numGenerations, rewardRatio, ethers.utils.parseUnits("0.04"), license, "")).to.be.revertedWith("ORatio must be between 5% and 50%");
					await expect(unDiamond.mint(owner.address, numGenerations, rewardRatio, ethers.utils.parseUnits("0.51"), license, "")).to.be.revertedWith("ORatio must be between 5% and 50%");
				});

				it("Should revert if license out of range", async () => {
					await expect(unDiamond.mint(owner.address, numGenerations, rewardRatio, ORatio, 7, "")).to.be.revertedWith("Invalid License");
				});
			});
		});

		describe("oTokens", () => {
			describe("Should have proper oTokens after Mint", () => {
				it("Should have proper OR Info", async () => {
					expect(await unDiamond.retrieveORInfo(tokenId)).to.deep.equal([ proportionalORatio, rewardRatio, [untradingManager.address, owner.address] ]);
				});

				it("Should have proper oToken Balances", async () => {
					expect(await unDiamond.balanceOfOTokens(tokenId, owner.address)).to.equal(ethers.utils.parseUnits("0.7"));
					expect(await unDiamond.balanceOfOTokens(tokenId, untradingManager.address)).to.equal(ethers.utils.parseUnits("0.3"));
				});

				it("Should have proper allotted OR", async () => {
					expect(await unDiamond.retrieveAllottedOR(owner.address)).to.equal("0");
				});
			});

			describe("Transfer", () => {
				describe("Reverts", () => {
					it("Should revert if transferring to self", async () => {
						await expect(unDiamond.transferOTokens(tokenId, owner.address, ethers.utils.parseUnits("0.1"))).to.be.revertedWith("transfer to self");
					});

					it("Should revert if transferring to zero address", async () => {
						await expect(unDiamond.transferOTokens(tokenId, ethers.constants.AddressZero, ethers.utils.parseUnits("0.1"))).to.be.revertedWith("transfer to the zero address");
					});

					it("Should revert if transferring with insufficient balance", async () => {
						await expect(unDiamond.transferOTokens(tokenId, untradingManager.address, ethers.utils.parseUnits("0.8"))).to.be.revertedWith("transfer amount exceeds balance");
					});

					it("Should revert if transferring 0 tokens", async () => {
						await expect(unDiamond.transferOTokens(tokenId, untradingManager.address, 0)).to.be.revertedWith("transfer amount is 0");
					});
				});

				describe("State Changes", () => {
					it("Should properly transfer oTokens", async () => {
						await unDiamond.transferOTokens(tokenId, addrs[0].address, ethers.utils.parseUnits("0.1"));

						expect(await unDiamond.balanceOfOTokens(tokenId, owner.address)).to.equal(ethers.utils.parseUnits("0.6"));
						expect(await unDiamond.balanceOfOTokens(tokenId, addrs[0].address)).to.equal(ethers.utils.parseUnits("0.1"));
					});

					it("Should properly adjust oToken holders", async () => {
						await unDiamond.transferOTokens(tokenId, addrs[0].address, ethers.utils.parseUnits("0.7"));

						expect((await unDiamond.retrieveORInfo(tokenId))[2]).to.deep.equal([ untradingManager.address, addrs[0].address ]);

						let c = await unDiamond.connect(addrs[0]);

						await c.transferOTokens(tokenId, addrs[1].address, ethers.utils.parseUnits("0.6"));

						expect((await unDiamond.retrieveORInfo(tokenId))[2]).to.deep.equal([ untradingManager.address, addrs[0].address, addrs[1].address ]);
					});
				});
			});

			describe("OR", () => {
				describe("OR Distribution", () => {
					it("Should cycle through 10 FR cycles properly with OR", async () => {
						// Setup for 10 cycles
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

						// FR Validation

						let expectedArray: any = [numGenerations, percentOfProfit, successiveRatio, ethers.utils.parseUnits("5.5"), ethers.BigNumber.from("11"), []];
	
						for (let a = 0; a < 10; a++) {
							expectedArray[5].push(addrs[a].address);
						}
	
						expect(await unDiamond.retrieveFRInfo(tokenId)).to.deep.equal(expectedArray);
	
						let totalOwners = [owner.address, ...expectedArray[5]];
	
						let allottedFRs = [];
	
						for (let o of totalOwners) allottedFRs.push(await unDiamond.retrieveAllottedFR(o));
	
						let greatestFR = allottedFRs.reduce((m, e) => e.gt(m) ? e : m);
	
						expect(greatestFR).to.equal(allottedFRs[0]);

						expect(await ethers.provider.getBalance(unDiamond.address)).to.equal(ethers.utils.parseUnits("1.715")); // (0.14) + (9 * 0.5 * 0.35) = 1.715 - Taking fixed-point dust into account - (rewardRatio) + ((totalProfitablePurchases - 1) * (ProfitIncrementor) * (rewardRatio))

						// OR Validation

						expect(await unDiamond.retrieveAllottedOR(owner.address)).to.equal(ethers.utils.parseUnits("0.539")); // ((0.14) + (9*0.5*0.14)) * 0.7
						expect(await unDiamond.retrieveAllottedOR(untradingManager.address)).to.equal(ethers.utils.parseUnits("0.231")); // ((0.14) + (9*0.5*0.14)) * 0.3

						expect(
								(allottedFRs.reduce((partialSum, a) => partialSum.add(a), ethers.BigNumber.from("0")))
								.add(await unDiamond.retrieveAllottedOR(owner.address))
								.add(await unDiamond.retrieveAllottedOR(untradingManager.address)))
								.to.be.above(ethers.utils.parseUnits("1.714")
						); // This is to ensure that all the FRs + ORs match the rewardRatio in terms of allocation to the respective addresses. To account for fixed-point dust, 1.714 is checked instead of 1.715, in fact the contract is actually only short 40 wei w/o rounding, 30 wei w/ rounding.

						expect((await unDiamond.retrieveORInfo(tokenId))[2]).to.deep.equal([ untradingManager.address, owner.address ]); // Ensure holder array is unaltered
					});
				});
				
				describe("Claiming", () => {
					describe("Reverts", () => {
						it("Should revert if no OR allotted", async () => {
							await expect(unDiamond.releaseOR(owner.address)).to.be.revertedWith("No OR Payment due");
						});
					});
					
					describe("State Changes", () => {
						it("Should release FR and OR after successful sale", async () => {
							await unDiamond.list(tokenId, baseSale);

							const buyer = unDiamond.connect(addrs[0]);

							await buyer.buy(tokenId, { value: baseSale });

							expect(await ethers.provider.getBalance(unDiamond.address)).to.equal(ethers.utils.parseUnits("0.14")); // Only OR was paid
							expect(await unDiamond.retrieveAllottedFR(owner.address)).to.equal(ethers.utils.parseUnits("0")); // 0.35 * 0.6 --- Note --- It seems that the added precision in calculating the Successive Ratio inside the contract with prb-math results in a few wei of dust, maybe we should round it?
							expect(await unDiamond.retrieveAllottedOR(owner.address)).to.equal(ethers.utils.parseUnits("0.098")); // 0.35 * 0.4 * 0.7

							let ETHBefore = await ethers.provider.getBalance(owner.address);

							let releaseTx = await (await unDiamond.releaseOR(owner.address)).wait();

							expect(await ethers.provider.getBalance(unDiamond.address)).to.equal(ethers.utils.parseUnits("0.042")); // 0.14 - 0.098
							expect(await ethers.provider.getBalance(owner.address)).to.equal((ETHBefore.add(ethers.utils.parseUnits("0.098"))).sub((releaseTx.cumulativeGasUsed).mul(releaseTx.effectiveGasPrice))); // Add amount released - Tx fee

							const secondBuyer = unDiamond.connect(addrs[1]);

							await buyer.list(tokenId, baseSale.add(ethers.utils.parseUnits(saleIncrementor)));

							await secondBuyer.buy(tokenId, { value: baseSale.add(ethers.utils.parseUnits(saleIncrementor)) });
							
							releaseTx = await (await unDiamond.releaseOR(owner.address)).wait();
							
							ETHBefore = await ethers.provider.getBalance(owner.address);

							releaseTx = await (await unDiamond.releaseFR(owner.address)).wait();

							expect(await ethers.provider.getBalance(unDiamond.address)).to.equal(ethers.utils.parseUnits("0.063")); // OR remaining for untrading manager as FR and OR has been claimed for owner - (1*0.35*0.4*0.3) + (0.5*0.35*0.4*0.3)
							expect(await ethers.provider.getBalance(owner.address)).to.equal((ETHBefore.add(ethers.utils.parseUnits("0.105"))).sub((releaseTx.cumulativeGasUsed).mul(releaseTx.effectiveGasPrice))); // Amount - (0.5*0.35*0.6) = 0.105

							expect(await unDiamond.retrieveAllottedOR(untradingManager.address)).to.equal(await ethers.provider.getBalance(unDiamond.address));
						});
					});
				});
			});
		});

		describe("Licensing", () => {
			describe("Reverts", () => {
				it("Should revert if provided improper license", async () => {
					await expect(unDiamond.mint(owner.address, numGenerations, rewardRatio, ORatio, "7", "")).to.be.revertedWith("Invalid License");
				});
			});

			it("Should retrieve proper license name", async () => {
				expect(await unDiamond.getLicenseName(tokenId)).to.equal("CBE_CC0");
			});

			it("Should retrieve proper license uri", async () => {
				expect(await unDiamond.getLicenseURI(tokenId)).to.equal("ar://_D9kN1WrNWbCq55BSAGRbTB4bS3v8QAPTYmBThSbX3A/" + license);
			});

			it("Should set proper license", async () => {
				await unDiamond.mint(owner.address, numGenerations, rewardRatio, ORatio, "5", "");

				expect(await unDiamond.getLicenseURI("2")).to.equal("ar://_D9kN1WrNWbCq55BSAGRbTB4bS3v8QAPTYmBThSbX3A/" + "5");
			});
		});

		describe("Wrapping", () => {
			describe("Reverts", () => {
				it("Should fail if contract is not approved to transfer token", async () => {
					await expect(unDiamond.wrap(ERC721Token.address, 1, numGenerations, rewardRatio, ORatio, license, tokenURI)).to.be.revertedWith("ERC721: caller is not token owner nor approved");
				});
	
				it("Should fail if token being wrapped is not ERC721", async () => {
					let ERC20Token = await (await ethers.getContractFactory("MockERC20")).deploy();
					await expect(unDiamond.wrap(ERC20Token.address, 1, numGenerations, rewardRatio, ORatio, license, tokenURI)).to.be.reverted;
				});

				it("Should fail with improper arguments", async () => {
					await ERC721Token.approve(unDiamond.address, 1);
					await expect(unDiamond.wrap(ERC721Token.address, 1, 100, rewardRatio, ORatio, license, tokenURI)).to.be.revertedWith("numGenerations must be between 5 and 20");
					await expect(unDiamond.wrap(ERC721Token.address, 1, numGenerations, rewardRatio, ORatio, "7", tokenURI)).to.be.revertedWith("Invalid License");
				});
			});

			it("Should transfer provided token to contract", async () => {
				await ERC721Token.approve(unDiamond.address, 1);
				await unDiamond.wrap(ERC721Token.address, 1, numGenerations, rewardRatio, ORatio, license, tokenURI);
				expect(await ERC721Token.ownerOf(1)).to.equal(unDiamond.address);
			});

			it("Should mint wrapped NFT and update Wrapped", async () => {
				await ERC721Token.approve(unDiamond.address, 1);
				await unDiamond.wrap(ERC721Token.address, 1, numGenerations, rewardRatio, ORatio, license, tokenURI);

				expect(await unDiamond.ownerOf(2)).to.equal(owner.address);
				expect(await unDiamond.retrieveWrappedInfo(2)).to.deep.equal([ ERC721Token.address, 1, true ]);

				expect(await unDiamond.retrieveWrappedInfo(tokenId)).to.deep.equal([ ethers.constants.AddressZero, 0, false ]); // Make sure non-wrapped token is blank
			});
		});

		describe("Unwrapping", () => {

		});

		describe("Management", () => {
			describe("Manager Cut", () => {
				describe("Reverts", () => {
					it("Should revert if caller is not permitted", async () => {
						await expect(unDiamond.changeManagerCut(ethers.utils.parseUnits("1"))).to.be.revertedWith("Caller not permitted");
					});
				});

				it("Should change manager cut", async () => {
					let manager = unDiamond.connect(untradingManager);
					await manager.changeManagerCut(ethers.utils.parseUnits("0.4"));
					expect(await unDiamond.retrieveManagerInfo()).to.deep.equal([ untradingManager.address, ethers.utils.parseUnits("0.4") ]);
				});
			});
		});
	});

	describe("Upgradability", () => {
		describe("Reverts", () => {
			it("Should revert if caller is not permitted", async () => {
				let diamond = await ethers.getContractAt("unDiamond", unDiamond.address);

				let unauthorizedUser = diamond.connect(addrs[0]);

				let MockFacetFactory = await ethers.getContractFactory("MockFacet");

				let MockFacet = await MockFacetFactory.deploy()

				await MockFacet.deployed();

				const cut = [{ target: MockFacet.address, action: FacetCutAction.Add, selectors: new Selectors(MockFacet).getSelectors() }];
				
				await expect(unauthorizedUser.diamondCut(cut, ethers.constants.AddressZero, "0x")).to.be.revertedWith("Ownable: sender must be owner");
			});
		});

		it("Should add new function properly", async () => {
			let diamond = await ethers.getContractAt("unDiamond", unDiamond.address);

			let MockFacetFactory = await ethers.getContractFactory("MockFacet");

			let MockFacet = await MockFacetFactory.deploy();

			await MockFacet.deployed();

			const cut = [{ target: MockFacet.address, action: FacetCutAction.Add, selectors: new Selectors(MockFacet).remove(["changeManagerCut(uint256)"]) }];

			await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

			let newDiamond = await ethers.getContractAt("MockFacet", unDiamond.address);

			expect(await newDiamond.MockFunc()).to.equal("Hello unDiamond");
		});

		it("Should remove a function properly", async () => {
			let diamond = await ethers.getContractAt("unDiamond", unDiamond.address);

			let MockFacetFactory = await ethers.getContractFactory("MockFacet");

			let MockFacet = await MockFacetFactory.deploy();

			await MockFacet.deployed();

			let cut = [{ target: MockFacet.address, action: FacetCutAction.Add, selectors: new Selectors(MockFacet).remove(["changeManagerCut(uint256)"]) }];

			await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

			let newDiamond = await ethers.getContractAt("MockFacet", unDiamond.address);

			expect(await newDiamond.MockFunc()).to.equal("Hello unDiamond");

			cut = [{ target: ethers.constants.AddressZero, action: FacetCutAction.Remove, selectors: new Selectors(MockFacet).remove(["changeManagerCut(uint256)"]) }];

			await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

			await expect(newDiamond.MockFunc()).to.be.revertedWith("DiamondBase: no facet found for function signature");
		});

		it("Should update a function properly", async () => {
			let diamond = await ethers.getContractAt("unDiamond", unDiamond.address);

			let MockFacetFactory = await ethers.getContractFactory("MockFacet");

			let MockFacet = await MockFacetFactory.deploy();

			await MockFacet.deployed();

			const cut = [{ target: MockFacet.address, action: FacetCutAction.Replace, selectors: new Selectors(MockFacet).remove(["MockFunc()"]) }];

			await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

			let newDiamond = await ethers.getContractAt("MockFacet", unDiamond.address);

			newDiamond = await newDiamond.connect(untradingManager);

			await newDiamond.changeManagerCut(ethers.utils.parseUnits("1"));

			expect(await unDiamond.retrieveManagerInfo()).to.deep.equal([ untradingManager.address, ethers.utils.parseUnits("0.4") ]);
		});

		it("Should retain data after removing all functions and adding them back", async () => {
			let diamond = await ethers.getContractAt("unDiamond", unDiamond.address);

			const unFacetFactory = await ethers.getContractFactory("unFacet");
			const unFacet = await unFacetFactory.deploy();
			await unFacet.deployed();

			let cut = [{ target: ethers.constants.AddressZero, action: FacetCutAction.Remove, selectors: new Selectors(unFacet).remove(["supportsInterface(bytes4)"]) }];
			
			await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

			await expect(unDiamond.retrieveManagerInfo()).to.be.revertedWith("DiamondBase: no facet found for function signature");

			cut = [{ target: unFacet.address, action: FacetCutAction.Add, selectors: new Selectors(unFacet).remove(["supportsInterface(bytes4)"]) }];

			await diamond.diamondCut(cut, ethers.constants.AddressZero, "0x");

			expect(await unDiamond.retrieveManagerInfo()).to.deep.equal([ untradingManager.address, managerCut ]);

			let expectedArray = [numGenerations, percentOfProfit, successiveRatio, ethers.BigNumber.from("0"), ethers.BigNumber.from("1"), [owner.address]]; // ..., lastSoldPrice, ownerAmount, addressesIunDiamond
			expect(await unDiamond.retrieveFRInfo(tokenId)).to.deep.equal(expectedArray);
		});
	});
	
});

// nFR Buy & Transfer functions - Make sure the user is not already in the FR cycle OR allow user to buy, except not adding them to the FR cycle. Add this requirement to EIP too. Also update EIP-5173 Diamond repo
// Verify the way nFR FR sliding window works, make sure that the user is never paying themselves FR, and only paying the people ahead of them. We need to confirm if right now the user is being added after they buy, meaning they pay themselves FR. If that is the case, we need to switch the logic to add the user to the FR cycle only after they sell. Essentially, you would only get added to the FR cycle after you sell, not after you buy. So you are not paying yourself. Need to update EIP too.
// For the above, we have at least 2 approaches...
// 1. Don't add minter to FR array at mint time, and add them after they sell/transfer the NFT. Then checking for an empty FR array, and if so not distributing FR. Then adding future people with shiftGen(from) instead of shiftGen(to) after they make a sale/transfer.
// 2. Add the minter to FR array at mint time, and check in shiftGenerations if they are already there, we could move the above nFR Buy & Transfer logic to shiftGenerations to accomplish this. Then adding future people with shiftGen(from) instead of shiftGen(to) after they make a sale/transfer.
// 3. Add minter during mint time to FR array, and keeping the original shiftGen(to), however during distribution, exclude the latest person in the FR array. Then when running the calculate FR we may need to subtract 1 from the numGenerations and ownerAmount we pass in to get the right amt for the amt of ppl.
// For every approach we shouldn't stress too much because we can always rewrite and upgrade it, whether that be upgrading the diamond or deploying new contracts.
// Add more events and update EIP