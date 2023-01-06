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

    event ORClaimed(address indexed account, uint256 indexed amount);

    event ORDistributed(uint256 indexed tokenId, uint256 indexed soldPrice, uint256 indexed allocatedFR);

    event OTokenTransfer(address indexed from, address indexed to, uint256 indexed tokenId);

    event OTokensDistributed(uint256 indexed tokenId);

    function mint(address recipient, uint8 numGenerations, uint256 rewardRatio, uint256 ORatio, uint8 license, string memory tokenURI) external returns(uint256);

    function wrap(address token, uint256 tokenId, uint8 numGenerations, uint256 rewardRatio, uint256 ORatio, uint8 license, string memory tokenURI) external;

    function unwrap(uint256 tokenId) external;

    function transferOTokens(uint256 tokenId, address recipient, uint256 amount) external;

    function releaseOR(address payable account) external;

    function retrieveORInfo(uint256 tokenId) external returns(uint256, uint256, address[] memory);

    function retrieveAllottedOR(address account) external returns(uint256);

    function balanceOfOTokens(uint256 tokenId, address account) external returns(uint256);

    function retrieveWrappedInfo(uint256 tokenId) external returns (address, uint256, bool);

    function retrieveManagerInfo() external returns(address, uint256);
}