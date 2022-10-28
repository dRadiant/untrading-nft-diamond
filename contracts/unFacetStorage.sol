// SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

library unFacetStorage {
    bytes32 internal constant STORAGE_SLOT = keccak256("unFacet.nFR.facet.contract.storage");

    struct oToken {
        address[] holders; // The addresses receiving the oToken cut of profit
        mapping(address => uint256) amount; // The amount of tokens each holder has
        uint256 ORatio; // The percentage of the profit
        uint256 rewardRatio; // The percentage of profit allocated to both FR and OR
    }

    struct Layout {
        address untradingManager;
        uint256 managerCut; // This is the cut of the oTokens that the untradingManager gets

        mapping(uint256 => oToken) _oTokens; // Mapping that represents the oToken information for a given tokenId

        mapping(address => uint256) _allottedOR; // Mapping that represents the OR (in Ether) allotted for a given address
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
