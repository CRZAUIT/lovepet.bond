// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * 喵链 · 猫咪救助存证
 *
 * 只做存证，不碰钱：
 *   - Cat  猫咪档案（链上只存 catId + 名字，照片/描述放链下 cats.json）
 *   - Help 帮助记录（谁、帮了哪只猫、做了什么）
 */
contract CatRescueLedger {
    address public owner;

    struct Cat {
        string  catId;
        string  name;
        uint256 timestamp;
    }

    Cat[] public cats;

    struct Help {
        string  helperName;
        string  catId;
        string  action;
        string  message;
        string  proofHash;
        uint256 timestamp;
    }

    Help[] public helps;

    event CatRegistered(uint256 indexed index, string catId, string name, uint256 timestamp);
    event HelpRecorded(uint256 indexed index, string catId, string helperName, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerCat(string calldata _catId, string calldata _name) external onlyOwner {
        cats.push(Cat(_catId, _name, block.timestamp));
        emit CatRegistered(cats.length - 1, _catId, _name, block.timestamp);
    }

    function recordHelp(
        string calldata _helperName,
        string calldata _catId,
        string calldata _action,
        string calldata _message,
        string calldata _proofHash
    ) external onlyOwner {
        helps.push(Help(_helperName, _catId, _action, _message, _proofHash, block.timestamp));
        emit HelpRecorded(helps.length - 1, _catId, _helperName, block.timestamp);
    }

    function getCatCount() external view returns (uint256) {
        return cats.length;
    }

    function getHelpCount() external view returns (uint256) {
        return helps.length;
    }

    function getCats(uint256 _offset, uint256 _limit) external view returns (Cat[] memory) {
        uint256 end = _offset + _limit;
        if (end > cats.length) end = cats.length;
        uint256 count = end - _offset;
        Cat[] memory result = new Cat[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = cats[_offset + i];
        }
        return result;
    }

    function getHelps(uint256 _offset, uint256 _limit) external view returns (Help[] memory) {
        uint256 end = _offset + _limit;
        if (end > helps.length) end = helps.length;
        uint256 count = end - _offset;
        Help[] memory result = new Help[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = helps[_offset + i];
        }
        return result;
    }
}
