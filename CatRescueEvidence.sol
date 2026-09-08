// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CatRescueEvidence {
    address public owner;

    struct Donation {
        string  donorName;
        uint256 amount;
        string  projectId;
        string  message;
        uint256 timestamp;
        string  paymentHash;
    }

    Donation[] public donations;

    struct Task {
        string  staffName;
        string  taskType;
        uint256 reward;
        string  ipfsHash;
        uint256 timestamp;
        bool    verified;
    }

    Task[] public tasks;

    event DonationRecorded(uint256 indexed index, string projectId, uint256 timestamp);
    event TaskRecorded(uint256 indexed index, string taskType, uint256 timestamp);
    event TaskVerified(uint256 indexed index, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function recordDonation(
        string calldata _donorName,
        uint256 _amount,
        string calldata _projectId,
        string calldata _message,
        string calldata _paymentHash
    ) external onlyOwner {
        donations.push(Donation(
            _donorName,
            _amount,
            _projectId,
            _message,
            block.timestamp,
            _paymentHash
        ));
        emit DonationRecorded(donations.length - 1, _projectId, block.timestamp);
    }

    function recordTask(
        string calldata _staffName,
        string calldata _taskType,
        uint256 _reward,
        string calldata _ipfsHash
    ) external onlyOwner {
        tasks.push(Task(
            _staffName,
            _taskType,
            _reward,
            _ipfsHash,
            block.timestamp,
            false
        ));
        emit TaskRecorded(tasks.length - 1, _taskType, block.timestamp);
    }

    function verifyTask(uint256 _taskId) external onlyOwner {
        require(_taskId < tasks.length, "Task does not exist");
        tasks[_taskId].verified = true;
        emit TaskVerified(_taskId, block.timestamp);
    }

    function getDonationCount() external view returns (uint256) {
        return donations.length;
    }

    function getTaskCount() external view returns (uint256) {
        return tasks.length;
    }

    function getDonations(uint256 _offset, uint256 _limit)
        external
        view
        returns (Donation[] memory)
    {
        uint256 end = _offset + _limit;
        if (end > donations.length) {
            end = donations.length;
        }
        uint256 count = end - _offset;
        Donation[] memory result = new Donation[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = donations[_offset + i];
        }
        return result;
    }

    function getTasks(uint256 _offset, uint256 _limit)
        external
        view
        returns (Task[] memory)
    {
        uint256 end = _offset + _limit;
        if (end > tasks.length) {
            end = tasks.length;
        }
        uint256 count = end - _offset;
        Task[] memory result = new Task[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tasks[_offset + i];
        }
        return result;
    }
}
