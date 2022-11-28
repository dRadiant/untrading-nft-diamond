// SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

import {SolidStateERC721} from "@solidstate/contracts/token/ERC721/SolidStateERC721.sol";
import {CounterStorage} from "./CounterStorage.sol";
import {ERC721MetadataStorage} from "@solidstate/contracts/token/ERC721/metadata/ERC721MetadataStorage.sol";

import "@prb/math/contracts/PRBMathUD60x18.sol";

import "@drad/eip-5173-diamond/contracts/nFR.sol";
import "./unFacetStorage.sol";

import "./CantBeEvil.sol";

import "./IunFacet.sol";

contract unFacet is IunFacet, nFR, CantBeEvil {
    using CounterStorage for CounterStorage.Layout;

    using PRBMathUD60x18 for uint256;

    function retrieveORInfo(uint256 tokenId) external view override returns (uint256 ORatio, uint256 rewardRatio, address[] memory holders) {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        return (f._oTokens[tokenId].ORatio, f._oTokens[tokenId].rewardRatio, f._oTokens[tokenId].holders);
    }

    function retrieveAllottedOR(address account) external view override returns (uint256) {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        return (f._allottedOR[account]);
    }

    function balanceOfOTokens(uint256 tokenId, address account) external view override returns (uint256) {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        return (f._oTokens[tokenId].amount[account]);
    }

    function mint(
        address recipient,
        uint8 numGenerations,
        uint256 rewardRatio,
        uint256 ORatio,
        uint8 license,
        string memory tokenURI
    ) external override returns(uint256 tokenId) {
        require(numGenerations >= 5 && numGenerations <= 20, "numGenerations must be between 5 and 20");
        require(rewardRatio >= 5e16 && rewardRatio <= 5e17, "rewardRatio must be between 5% and 50%");
        require(ORatio >= 5e16 && ORatio <= 5e17, "ORatio must be between 5% and 50%");

        uint256 successiveRatio = ((uint256(numGenerations) * 1e18).div((uint256(numGenerations) * 1e18) - 1.618e18)) / 100 * 100; // by ( / 100 * 100) we are effectively rounding down the successive ratio. The division takes advantage of Solidity's automatic decimal truncation, effectively removing the last 2 digits, then the multiplication adds those 2 digits back as 0s.
        uint256 percentOfProfit = rewardRatio.mul(1e18 - ORatio);

        ORatio = rewardRatio.mul(ORatio);

        CounterStorage.incrementTokenId();

        uint256 newItemId = CounterStorage.layout().tokenIds;
        _distributeOTokens(newItemId, recipient, ORatio, rewardRatio);
        _mint(recipient, newItemId, numGenerations, percentOfProfit, successiveRatio);
        
        _setTokenURI(newItemId, tokenURI);
        _setTokenLicense(newItemId, license);

        tokenId = newItemId;
    }

    function releaseOR(address payable account) external override {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        require(f._allottedOR[account] > 0, "No OR Payment due");

        uint256 ORAmount = f._allottedOR[account];

        f._allottedOR[account] = 0;

        (bool sent, ) = account.call{value: ORAmount}("");
        require(sent, "Failed to release OR");

        emit ORClaimed(account, ORAmount);
    }

    function transferOTokens(uint256 tokenId, address recipient, uint256 amount) external override {
        unFacetStorage.Layout storage f = unFacetStorage.layout();

        require(recipient != address(0), "transfer to the zero address");
        require(recipient != _msgSender(), "transfer to self");
        require(amount > 0, "transfer amount is 0");

        uint256 fromBalance = f._oTokens[tokenId].amount[_msgSender()];
        require(fromBalance >= amount, "transfer amount exceeds balance");

        unchecked {
             f._oTokens[tokenId].amount[_msgSender()] = fromBalance - amount;
            // Overflow not possible: the sum of all balances is capped by 1e18 (100%), and is preserved by
            // decrementing then incrementing.
             f._oTokens[tokenId].amount[recipient] += amount;
        }

        if (fromBalance - amount == 0) {
            for (uint256 i = 0; i < f._oTokens[tokenId].holders.length; i++) {
                if (f._oTokens[tokenId].holders[i] == _msgSender()) {
                    f._oTokens[tokenId].holders[i] = recipient;
                    return;
                }
            }
            revert("Not Found");
        } else {
            f._oTokens[tokenId].holders.push(recipient);
        }

        emit OTokenTransfer(_msgSender(), recipient, tokenId);
    }

    function _distributeOTokens(uint256 tokenId, address recipient, uint256 ORatio, uint256 rewardRatio) internal {
        unFacetStorage.Layout storage l = unFacetStorage.layout();
        
        l._oTokens[tokenId].ORatio = ORatio;
        l._oTokens[tokenId].rewardRatio = rewardRatio;
        l._oTokens[tokenId].holders = [l.untradingManager, recipient];
        l._oTokens[tokenId].amount[l.untradingManager] = l.managerCut;
        l._oTokens[tokenId].amount[recipient] = (1e18 - l.managerCut);

        emit OTokensDistributed(tokenId);
    }

    function _distributeOR(uint256 tokenId, uint256 soldPrice) internal {
        nFRStorage.Layout storage l = nFRStorage.layout();
        unFacetStorage.Layout storage f = unFacetStorage.layout();

        uint256 profit = soldPrice - l._tokenFRInfo[tokenId].lastSoldPrice;
        uint256 ORAvailable = profit.mul(f._oTokens[tokenId].ORatio);

        for (uint holder = 0; holder < f._oTokens[tokenId].holders.length; holder++) {
            address holderAddress = f._oTokens[tokenId].holders[holder];
            f._allottedOR[holderAddress] += ORAvailable.mul(f._oTokens[tokenId].amount[holderAddress]);
        }

        emit ORDistributed(tokenId, soldPrice, ORAvailable);
    }

    function _distributeFR(uint256 tokenId, uint256 soldPrice) internal override returns(uint256 allocatedFR) {
        _distributeOR(tokenId, soldPrice);
        uint256 allocated = super._distributeFR(tokenId, soldPrice);

        nFRStorage.Layout storage l = nFRStorage.layout();
        unFacetStorage.Layout storage f = unFacetStorage.layout();

        uint256 profit = soldPrice - l._tokenFRInfo[tokenId].lastSoldPrice;

        allocatedFR = (allocated + profit.mul(f._oTokens[tokenId].ORatio));
    }

    function _burn(uint256 tokenId) internal override {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        delete f._oTokens[tokenId];
        super._burn(tokenId);
    }

    /*
    function mintERC721(address recipient, string memory tokenURI) external {
        CounterStorage.incrementTokenId();

        uint256 newItemId = CounterStorage.layout().tokenIds;
        _mint(recipient, newItemId);
        _setTokenURI(newItemId, tokenURI);
    }

    function setDefaultFRInfo(
        uint8 numGenerations,
        uint256 percentOfProfit,
        uint256 successiveRatio
    ) external {
        _setDefaultFRInfo(numGenerations, percentOfProfit, successiveRatio);
    }

    function burnNFT(uint256 tokenId) external {
        _burn(tokenId);
    }
    */

    function _setTokenURI(uint256 tokenId, string memory tokenURI) internal {
        ERC721MetadataStorage.Layout storage l = ERC721MetadataStorage.layout();
        l.tokenURIs[tokenId] = tokenURI;
    }

    function retrieveManagerInfo() view external override returns (address untradingManager, uint256 managerCut) {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        return (f.untradingManager, f.managerCut);
    }

    function changeManagerCut(uint256 newManagerCut) external {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        require(msg.sender == f.untradingManager, "Caller not permitted");
        f.managerCut = newManagerCut;
    }
}
