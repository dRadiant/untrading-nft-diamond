// SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

interface IManagement {
    function getManagerInfo() external view returns(address, uint256);

    function setManagerCut(uint256 newManagerCut) external;
}