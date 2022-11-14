// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./InFR.sol";
import "./nFRStorage.sol";
import "@solidstate/contracts/token/ERC721/SolidStateERC721.sol";
import "@prb/math/contracts/PRBMathUD60x18.sol";
import "@prb/math/contracts/PRBMathSD59x18.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract nFR is InFR, SolidStateERC721 {
    using PRBMathUD60x18 for uint256;
    using PRBMathSD59x18 for int256;

    function retrieveFRInfo(uint256 tokenId)
        external
        view
        virtual
        override
        returns (
            uint8 numGenerations,
            uint256 percentOfProfit,
            uint256 successiveRatio,
            uint256 lastSoldPrice,
            uint256 ownerAmount,
            address[] memory addressesInFR
        )
    {
        nFRStorage.Layout storage l = nFRStorage.layout();
        return (l._tokenFRInfo[tokenId].numGenerations, l._tokenFRInfo[tokenId].percentOfProfit, l._tokenFRInfo[tokenId].successiveRatio, l._tokenFRInfo[tokenId].lastSoldPrice, l._tokenFRInfo[tokenId].ownerAmount, l._addressesInFR[tokenId]);
    }

    function retrieveListInfo(uint256 tokenId)
        external
        view
        virtual
        override
        returns (
            uint256,
            address,
            bool
        )
    {
        nFRStorage.Layout storage l = nFRStorage.layout();
        return (l._tokenListInfo[tokenId].salePrice, l._tokenListInfo[tokenId].lister, l._tokenListInfo[tokenId].isListed);
    }

    function retrieveAllottedFR(address account) external view virtual override returns (uint256) {
        nFRStorage.Layout storage l = nFRStorage.layout();
        return l._allottedFR[account];
    }

    function _transferFrom(
        address from,
        address to,
        uint256 tokenId,
        uint256 soldPrice
    ) internal virtual {
        require(from != to, "transfer to self");
        ERC721BaseInternal._transfer(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, ""), "ERC721: transfer to non ERC721Receiver implementer");
        nFRStorage.Layout storage l = nFRStorage.layout();

        if (soldPrice <= l._tokenFRInfo[tokenId].lastSoldPrice) { // NFT sold for a loss, meaning no FR distribution, but we still shift generations, and update price. We return ALL of the received ETH to the msg.sender as no FR chunk was needed.
            l._tokenFRInfo[tokenId].lastSoldPrice = soldPrice;
            l._tokenFRInfo[tokenId].ownerAmount++;
            _shiftGenerations(to, tokenId);
            (bool sent, ) = payable(l._tokenListInfo[tokenId].lister).call{value: soldPrice}("");
            require(sent, "ERC5173: Failed to send msg.value to lister");
        } else {
            _distributeFR(tokenId, soldPrice);
            l._tokenFRInfo[tokenId].lastSoldPrice = soldPrice;
            l._tokenFRInfo[tokenId].ownerAmount++;
            _shiftGenerations(to, tokenId);
        }

        delete l._tokenListInfo[tokenId];
    }

    function list(uint256 tokenId, uint256 salePrice) public virtual override {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC5173: list caller is not owner nor approved");
        nFRStorage.Layout storage l = nFRStorage.layout();

        l._tokenListInfo[tokenId] = nFRStorage.ListInfo(salePrice, _msgSender(), true);
    }

    function unlist(uint256 tokenId) public virtual override {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC5173: unlist caller is not owner nor approved");
        nFRStorage.Layout storage l = nFRStorage.layout();

        delete l._tokenListInfo[tokenId];
    }

    function buy(uint256 tokenId) public payable virtual override {
        nFRStorage.Layout storage l = nFRStorage.layout();
        require(l._tokenListInfo[tokenId].isListed == true, "Token is not listed");
        require(l._tokenListInfo[tokenId].salePrice == msg.value, "salePrice and msg.value mismatch");

        for (uint i = 0; i < l._addressesInFR[tokenId].length; i++) {
            require(l._addressesInFR[tokenId][i] != _msgSender(), "Already in the FR sliding window");
        }

        _transferFrom(l._tokenListInfo[tokenId].lister, _msgSender(), tokenId, l._tokenListInfo[tokenId].salePrice);
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        require(from != to, "transfer to self");
        super._transfer(from, to, tokenId);
        nFRStorage.Layout storage l = nFRStorage.layout();

        if (l._tokenListInfo[tokenId].isListed == true) {
            delete l._tokenListInfo[tokenId];
        }

        l._tokenFRInfo[tokenId].lastSoldPrice = 0;
        l._tokenFRInfo[tokenId].ownerAmount++;
        _shiftGenerations(to, tokenId);
    }

    function _mint(address to, uint256 tokenId) internal virtual override {
        nFRStorage.Layout storage l = nFRStorage.layout();

        require(l._defaultFRInfo.isValid, "No Default FR Info has been set");

        super._mint(to, tokenId);

        l._tokenFRInfo[tokenId] = nFRStorage.FRInfo(l._defaultFRInfo.numGenerations, l._defaultFRInfo.percentOfProfit, l._defaultFRInfo.successiveRatio, 0, 1, true);

        l._addressesInFR[tokenId].push(to);
    }

    function _burn(uint256 tokenId) internal virtual override {
        super._burn(tokenId);
        nFRStorage.Layout storage l = nFRStorage.layout();

        delete l._tokenFRInfo[tokenId];
        delete l._addressesInFR[tokenId];
        delete l._tokenListInfo[tokenId];
    }

    function _mint(
        address to,
        uint256 tokenId,
        uint8 numGenerations,
        uint256 percentOfProfit,
        uint256 successiveRatio
    ) internal virtual {
        require(numGenerations > 0 && percentOfProfit > 0 && percentOfProfit <= 1e18 && successiveRatio > 0, "Invalid Data Passed");

        ERC721BaseInternal._mint(to, tokenId);
        require(_checkOnERC721Received(address(0), to, tokenId, ""), "ERC721: transfer to non ERC721Receiver implementer");

        nFRStorage.Layout storage l = nFRStorage.layout();

        l._tokenFRInfo[tokenId] = nFRStorage.FRInfo(numGenerations, percentOfProfit, successiveRatio, 0, 1, true);

        l._addressesInFR[tokenId].push(to);
    }

    function _distributeFR(uint256 tokenId, uint256 soldPrice) internal virtual {
        nFRStorage.Layout storage l = nFRStorage.layout();
        uint256 profit = soldPrice - l._tokenFRInfo[tokenId].lastSoldPrice;
        uint256[] memory FR = _calculateFR(profit, l._tokenFRInfo[tokenId].percentOfProfit, l._tokenFRInfo[tokenId].successiveRatio, l._tokenFRInfo[tokenId].ownerAmount, l._tokenFRInfo[tokenId].numGenerations);

        for (uint owner = 0; owner < FR.length; owner++) {
            l._allottedFR[l._addressesInFR[tokenId][owner]] += FR[owner];
        }

        uint256 allocatedFR = 0;

        for (uint reward = 0; reward < FR.length; reward++) {
            allocatedFR += FR[reward];
        }

        (bool sent, ) = payable(l._tokenListInfo[tokenId].lister).call{value: soldPrice - allocatedFR}("");
        require(sent, "Failed to send ETH after FR distribution to lister");

        emit FRDistributed(tokenId, soldPrice, allocatedFR);
    }

    function _shiftGenerations(address to, uint256 tokenId) internal virtual {
        nFRStorage.Layout storage l = nFRStorage.layout();
        if (l._addressesInFR[tokenId].length < l._tokenFRInfo[tokenId].numGenerations) { // We just want to push to the array
            l._addressesInFR[tokenId].push(to);
        } else { // We want to remove the first element in the array and then push to the end of the array
            for (uint i = 0; i < l._addressesInFR[tokenId].length-1; i++) {
                l._addressesInFR[tokenId][i] = l._addressesInFR[tokenId][i+1];
            }

            l._addressesInFR[tokenId].pop();

            l._addressesInFR[tokenId].push(to);
        }
    }

    function _setDefaultFRInfo(
        uint8 numGenerations,
        uint256 percentOfProfit,
        uint256 successiveRatio
    ) internal virtual {
        require(numGenerations > 0 && percentOfProfit > 0 && percentOfProfit <= 1e18 && successiveRatio > 0, "Invalid Data Passed");
        nFRStorage.Layout storage l = nFRStorage.layout();

        l._defaultFRInfo.numGenerations = numGenerations;
        l._defaultFRInfo.percentOfProfit = percentOfProfit;
        l._defaultFRInfo.successiveRatio = successiveRatio;
        l._defaultFRInfo.isValid = true;
    }

    function releaseFR(address payable account) public virtual override {
        nFRStorage.Layout storage l = nFRStorage.layout();
        require(l._allottedFR[account] > 0, "No FR Payment due");

        uint256 FRAmount = l._allottedFR[account];

        l._allottedFR[account] = 0;

        (bool sent, ) = account.call{value: FRAmount}("");
        require(sent, "Failed to release FR");

        emit FRClaimed(account, FRAmount);
    }

    function _calculateFR(
        uint256 totalProfit,
        uint256 buyerReward,
        uint256 successiveRatio,
        uint256 ownerAmount,
        uint256 windowSize
    ) internal pure virtual returns (uint256[] memory) {
        uint256 n = Math.min(ownerAmount, windowSize);
        uint256[] memory FR = new uint256[](n);

        for (uint256 i = 1; i < n + 1; i++) {
            uint256 pi = 0;

            if (successiveRatio != 1e18) {
                int256 v1 = 1e18 - int256(successiveRatio).powu(n);
                int256 v2 = int256(successiveRatio).powu(i - 1);
                int256 v3 = int256(totalProfit).mul(int256(buyerReward));
                int256 v4 = v3.mul(1e18 - int256(successiveRatio));
                pi = uint256(v4 * v2 / v1);
            } else {
                pi = totalProfit.mul(buyerReward).div(n);
            }

            FR[n - i] = pi;
        }

        return FR;
    }

    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}
