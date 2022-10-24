// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "../unFacetStorage.sol";

contract MockFacet {
    function MockFunc() external pure returns (string memory) {
        return _mockFunc();
    }

    function _mockFunc() internal pure returns (string memory) {
        return "Hello unDiamond";
    }

    function changeManagerCut(uint256 newManagerCut) external {
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        require(msg.sender == f.untradingManager, "Caller not permitted");
        f.managerCut = 0.4e18;
    }
}