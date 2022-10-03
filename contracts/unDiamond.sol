// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@solidstate/contracts/proxy/diamond/SolidStateDiamond.sol";
import {IERC165} from "@solidstate/contracts/introspection/IERC165.sol";
import {ERC165Storage} from "@solidstate/contracts/introspection/ERC165Storage.sol";
import {ERC721MetadataStorage} from "@solidstate/contracts/token/ERC721/metadata/ERC721MetadataStorage.sol";
import {IERC721} from "@solidstate/contracts/token/ERC721/IERC721.sol";

import "./InFR.sol";
import "./unFacetStorage.sol";

contract unDiamond is SolidStateDiamond {
    using ERC165Storage for ERC165Storage.Layout;

    constructor(
        address untradingManager,
        uint256 managerCut,
        string memory name,
        string memory symbol,
        string memory baseURI
    ) {
        require(managerCut <= 1e18, "managerCut exceeds 100%");
        // Init the ERC721 Metadata for the unNFT Shared Contract
        ERC721MetadataStorage.Layout storage l = ERC721MetadataStorage.layout();
        l.name = name;
        l.symbol = symbol;
        l.baseURI = baseURI;

        // Declare all interfaces supported by the Diamond
        ERC165Storage.layout().setSupportedInterface(
            type(IERC165).interfaceId,
            true
        );
        ERC165Storage.layout().setSupportedInterface(
            type(IERC721).interfaceId,
            true
        );
        ERC165Storage.layout().setSupportedInterface(
            type(InFR).interfaceId,
            true
        );

        // Init the manager and managerCut used by oTokens
        unFacetStorage.Layout storage f = unFacetStorage.layout();
        f.untradingManager = untradingManager;
        f.managerCut = managerCut;
    }
}
