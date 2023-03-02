// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IRandomNumberGenerator.sol";
import "../interfaces/IDeLott.sol";

contract MockRandomNumberGenerator is IRandomNumberGenerator, Ownable {
    address public deLott;
    uint32 public randomResult;
    uint256 public nextRandomResult;
    uint256 public latestLotteryId;

    /**
     * @notice Constructor
     * @dev MockRandomNumberGenerator must be deployed before the lottery.
     */
    constructor() {}

    /**
     * @notice Set the address for the PancakeSwapLottery
     * @param _deLott: address of the PancakeSwap lottery
     */
    function setLotteryAddress(address _deLott) external onlyOwner {
        deLott = _deLott;
    }

    /**
     * @notice Set the address for the PancakeSwapLottery
     * @param _nextRandomResult: next random result
     */
    function setNextRandomResult(uint256 _nextRandomResult) external onlyOwner {
        nextRandomResult = _nextRandomResult;
    }

    /**
     * @notice Request randomness from a user-provided seed
     */
    function getRandomNumber() external override {
        require(msg.sender == deLott, "Only DeLott");
        fulfillRandomness(nextRandomResult);
    }

    /**
     * @notice Change latest lotteryId to currentLotteryId
     */
    function changeLatestLotteryId() external {
        latestLotteryId = IDeLott(deLott).viewCurrentLotteryId();
    }

    /**
     * @notice View latestLotteryId
     */
    function viewLatestLotteryId() external view override returns (uint256) {
        return latestLotteryId;
    }

    /**
     * @notice View random result
     */
    function viewRandomResult() external view override returns (uint32) {
        return randomResult;
    }

    /**
     * @notice Callback function used by ChainLink's VRF Coordinator
     */
    function fulfillRandomness(uint256 randomness) internal {
        randomResult = uint32(1000000 + (randomness % 1000000));
    }
}
