// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@solidstate/contracts/introspection/IERC165.sol";

/*
 *
 * @dev Interface for the Future Rewards Token Standard.
 *
 * A standardized way to receive future rewards for non-fungible tokens (NFTs.)
 *
 */
interface IunFacet is IERC165 {

    event FRClaimed(address indexed account, uint256 indexed amount);

    event FRDistributed(uint256 indexed tokenId, uint256 indexed soldPrice, uint256 indexed allocatedFR);

    event Listed(uint256 indexed tokenId, uint256 indexed salePrice);

    event Bought(uint256 indexed tokenId, uint256 indexed salePrice);

    function list(uint256 tokenId, uint256 salePrice) external;

    function unlist(uint256 tokenId) external;

    function buy(uint256 tokenId) payable external;

    function releaseFR(address payable account) external;

    function retrieveFRInfo(uint256 tokenId) external returns(uint8, uint256, uint256, uint256, uint256, address[] memory);

    function retrieveAllottedFR(address account) external returns(uint256);

    function retrieveListInfo(uint256 tokenId) external returns(uint256, address, bool);
    
}