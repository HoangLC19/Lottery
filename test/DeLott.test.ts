import { ethers, network } from "hardhat";
import { expect, assert } from "chai";
import {
  MockERC20,
  DeLott,
  MockRandomNumberGenerator,
} from "../typechain-types";
import { BigNumber } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const calculatePriceBulkTickets = (
  discountDivisor: BigNumber,
  priceTicketInCake: BigNumber,
  numberOfTickets: BigNumber
) => {
  return priceTicketInCake
    .mul(numberOfTickets)
    .mul(discountDivisor.sub(numberOfTickets).add(1))
    .div(discountDivisor);
};

describe("DeLott", () => {
  // VARIABLES
  const _totalInitSupply = ethers.utils.parseEther("10000");

  let _lengthLottery = BigNumber.from(14400);
  let _priceTicketInCake = ethers.utils.parseEther("0.5");
  let _discountDivisor = BigNumber.from("2000");

  let _rewardsBreakdown = ["200", "300", "500", "1500", "2500", "5000"];
  let _treasuryFee = BigNumber.from("2000");

  // Contracts
  let deLott: DeLott;
  let mockCake: MockERC20;
  let mockRNG: MockRandomNumberGenerator;

  //Generic variables
  let result: any;
  let endTime: BigNumber;

  before(async () => {
    const [alice, bob, carol, david, erin, operator, treasury, injector] =
      await ethers.getSigners();
    // Deploy MockCake
    console.log("Deploying MockCake...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockCake = (await MockERC20.deploy(
      "Mock CAKE",
      "CAKE",
      _totalInitSupply
    )) as MockERC20;
    await mockCake.deployed();
    console.log("MockCake deployed at: ", mockCake.address);
    console.log("----------------------------------");

    console.log("Deploying MockRNG...");
    // Deploy MockRNG
    const MockRandomNumberGenerator = await ethers.getContractFactory(
      "MockRandomNumberGenerator"
    );
    mockRNG =
      (await MockRandomNumberGenerator.deploy()) as MockRandomNumberGenerator;
    await mockRNG.deployed();
    console.log("MockRNG deployed at: ", mockRNG.address);
    console.log("----------------------------------");

    // Deploy DeLott
    console.log("Deploying DeLott...");
    const DeLott = await ethers.getContractFactory("DeLott");
    deLott = (await DeLott.connect(alice).deploy(
      mockCake.address,
      mockRNG.address
    )) as DeLott;
    await deLott.deployed();
    console.log("DeLott deployed at: ", deLott.address);
    console.log("----------------------------------");
  });

  describe("DeLott - CUSTOM RANDOMNESS", async () => {
    it("admin set up operator, treasury, injector and emit event", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      expect(
        await deLott
          .connect(alice)
          .setOperatorAndTreasuryAndInjectorAddress(
            operator.address,
            treasury.address,
            injector.address
          )
      )
        .to.emit(deLott, "NewOperatorAndTreasuryAndInjectorAddresses")
        .withArgs(operator.address, treasury.address, injector.address);
    });

    it("Users mint and approve CAKE to be used in CAKE", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      for (let user of [alice, bob, carol, david, erin, injector]) {
        await mockCake.connect(user).mint(ethers.utils.parseEther("100000"));
        await mockCake
          .connect(user)
          .approve(deLott.address, ethers.utils.parseEther("100000"));
      }

      expect(await mockCake.balanceOf(alice.address)).to.equal(
        ethers.utils.parseEther("110000")
      );
      expect(await mockCake.balanceOf(bob.address)).to.equal(
        ethers.utils.parseEther("100000")
      );
      expect(await mockCake.balanceOf(carol.address)).to.equal(
        ethers.utils.parseEther("100000")
      );
      expect(await mockCake.balanceOf(david.address)).to.equal(
        ethers.utils.parseEther("100000")
      );
      expect(await mockCake.balanceOf(erin.address)).to.equal(
        ethers.utils.parseEther("100000")
      );
      expect(await mockCake.balanceOf(injector.address)).to.equal(
        ethers.utils.parseEther("100000")
      );
    });

    it("Operator start the lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      endTime = BigNumber.from(timestamp).add(_lengthLottery);

      expect(
        await deLott
          .connect(operator)
          .startLottery(
            ethers.BigNumber.from(endTime),
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      )
        .to.emit(deLott, "LotteryOpen")
        .withArgs(
          "1",
          (await ethers.provider.getBlock("latest")).timestamp,
          endTime,
          _priceTicketInCake,
          _discountDivisor,
          _rewardsBreakdown,
          _treasuryFee
        );
    });

    it("revert when not operator start the lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      endTime = BigNumber.from(timestamp).add(_lengthLottery);

      await expect(
        deLott
          .connect(alice)
          .startLottery(
            ethers.BigNumber.from(endTime),
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Not operator");
    });

    it("should revert when previous lottery is not finished", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      endTime = BigNumber.from(timestamp).add(_lengthLottery);

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            ethers.BigNumber.from(endTime),
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Not time to start");
    });

    it("Bob buys 100 tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _ticketsBought = [
        "1234561",
        "1234562",
        "1234563",
        "1234564",
        "1234565",
        "1234566",
        "1234567",
        "1234568",
        "1234569",
        "1234570",
        "1334571",
        "1334572",
        "1334573",
        "1334574",
        "1334575",
        "1334576",
        "1334577",
        "1334578",
        "1334579",
        "1334580",
        "1434509",
        "1434582",
        "1434583",
        "1434584",
        "1434585",
        "1434586",
        "1434587",
        "1434588",
        "1434589",
        "1534590",
        "1534591",
        "1534592",
        "1534593",
        "1534594",
        "1534595",
        "1534596",
        "1534597",
        "1534598",
        "1534599",
        "1634600",
        "1634601",
        "1634602",
        "1634603",
        "1634604",
        "1634605",
        "1634606",
        "1634607",
        "1634608",
        "1634609",
        "1634610",
        "1634611",
        "1634612",
        "1634613",
        "1634614",
        "1634615",
        "1634616",
        "1634617",
        "1634618",
        "1634619",
        "1634620",
        "1634621",
        "1634622",
        "1634623",
        "1634624",
        "1634625",
        "1634626",
        "1634627",
        "1634628",
        "1634629",
        "1634630",
        "1634631",
        "1634632",
        "1634633",
        "1634634",
        "1634635",
        "1634636",
        "1634637",
        "1634638",
        "1634639",
        "1634640",
        "1634641",
        "1634642",
        "1634643",
        "1634644",
        "1634645",
        "1634646",
        "1634647",
        "1634648",
        "1634649",
        "1634650",
        "1634651",
        "1634652",
        "1634653",
        "1634654",
        "1634655",
        "1634656",
        "1634657",
        "1634658",
        "1634659",
        "1634660",
      ];
      // expect(await deLott.connect(bob).buyTickets("1", _ticketsBought))
      //   .to.emit(deLott, "TicketPurchase")
      //   .withArgs(bob.address, "1", _ticketsBought.length);

      result = await deLott.connect(bob).buyTickets("1", _ticketsBought);
      const receipt = await ethers.provider.getTransactionReceipt(result.hash);
      // console.log(receipt);
      const inface = new ethers.utils.Interface([
        "event TicketPurchase(address indexed buyer, uint256 indexed lotteryId, uint256 numberTickets)",
      ]);
      const data = receipt.logs[2].data;
      const topics = receipt.logs[2].topics;
      const event = inface.decodeEventLog("TicketPurchase", data, topics);
      expect(event.buyer).to.equal(bob.address);
      expect(event.lotteryId).to.equal("1");
      expect(event.numberTickets).to.equal(_ticketsBought.length);

      result = await deLott.viewLottery("1");
      // console.log(result);
      const ticketPrice = calculatePriceBulkTickets(
        BigNumber.from(2000),
        _priceTicketInCake,
        BigNumber.from(_ticketsBought.length)
      );
      // console.log(ticketPrice.toString());
      expect(result[11]).to.equal(ticketPrice);

      result = await deLott.viewUserInfoForLotteryId(bob.address, "1", 0, 100);
      const bobTicketIds: string[] = [];

      result[0].forEach((value: BigNumber) => {
        bobTicketIds.push(value.toString());
      });

      const expectedTicketIds = Array.from({ length: 100 }, (_, v) =>
        v.toString()
      );
      // assert.includeOrderedMembers(bobTicketIds, expectedTicketIds);

      expect(bobTicketIds).include.ordered.members(expectedTicketIds);

      result = await deLott.viewNumbersAndStatusesForTicketIds(bobTicketIds);
      expect(result[0].map(String)).include.ordered.members(_ticketsBought);
    });

    it("revert when Carol buys tickets with invalid ticket numbers", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _ticketsBought = ["12345610"];

      await expect(
        deLott.connect(carol).buyTickets("1", _ticketsBought)
      ).to.be.revertedWith("Invalid ticket number");
    });

    it("revert when Carol buys 100 tickets with invalid numbers", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _ticketsBought: any = [];

      await expect(
        deLott.connect(carol).buyTickets("1", _ticketsBought)
      ).to.be.revertedWith("No tickets");
    });

    it("revert when david buys more than 100 tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _ticketsBought: any = [];
      let random;
      for (let i = 0; i < 101; i++) {
        random = Math.floor(Math.random() * 10000000);
        _ticketsBought.push(random);
      }

      await expect(
        deLott.connect(david).buyTickets("1", _ticketsBought)
      ).to.be.revertedWith("Too many tickets");
    });

    it("Carol buy one tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _ticketsBought = ["1111111"];

      const carolTicketPrice = calculatePriceBulkTickets(
        BigNumber.from(_discountDivisor),
        _priceTicketInCake,
        BigNumber.from(1)
      );
      // result = await deLott.connect(carol).buyTickets("1", _ticketsBought);
      // const receipt = await ethers.provider.getTransactionReceipt(result.hash);
      // expect().changeTokenBalance()

      await expect(
        deLott.connect(carol).buyTickets("1", _ticketsBought)
      ).changeTokenBalance(mockCake, deLott, carolTicketPrice);
    });

    it("Owner does 10K CAKE injection", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      expect(
        await deLott
          .connect(alice)
          .injectFunds("1", ethers.utils.parseEther("5000"))
      )
        .to.emit(deLott, "Lottery Injection")
        .withArgs("1", ethers.utils.parseEther("10000").toString());

      expect(
        await deLott
          .connect(injector)
          .injectFunds("1", ethers.utils.parseEther("5000"))
      ).changeTokenBalance(mockCake, deLott, ethers.utils.parseEther("5000"));
    });

    it("revert when not owner or injector does CAKE injection", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(bob).injectFunds("1", ethers.utils.parseEther("5000"))
      ).to.be.revertedWith("Not owner or injector");
    });

    it("revert when owner does CAKE injection with invalid lottery id", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(alice).injectFunds("2", ethers.utils.parseEther("5000"))
      ).to.be.revertedWith("Not open");
    });

    it("David buy 10 tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _ticketsBought = [
        "1111111",
        "1222222",
        "1333333",
        "1444444",
        "1555555",
        "1666666",
        "1777777",
        "1888888",
        "1000000",
        "1999999",
      ];

      const davidTicketPrice = calculatePriceBulkTickets(
        BigNumber.from(_discountDivisor),
        _priceTicketInCake,
        BigNumber.from(10)
      );

      await expect(
        deLott.connect(david).buyTickets("1", _ticketsBought)
      ).changeTokenBalance(mockCake, deLott, davidTicketPrice);
    });

    it("Owner close lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      await mockRNG.setLotteryAddress(deLott.address);
      await mockRNG.setNextRandomResult("1999999");
      await mockRNG.changeLatestLotteryId();
      await time.increase(60 * 60 * 4);
      await deLott.connect(operator).closeLottery("1");

      result = await deLott.viewLottery("1");
      expect(result[0].toString()).to.equal("2");
      console.log(result);
    });

    it("draw final number for lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      result = await deLott
        .connect(operator)
        .drawFinalNumberAndMakeLotteryClaimable("1", true);
      const receipt = await result.wait();
      const event = receipt.events?.pop();
      expect(event?.event).to.equal("LotteryNumberDrawn");
      expect(event?.args?.lotteryId).to.equal("1");
      expect(event?.args?.finalNumber).to.equal("1999999");
      expect(event?.args?.countWinningTickets).to.equal("12");
      // result = await deLott.viewLottery("1");
      // expect(result[0].toString()).to.equal("3");
      // console.log(result);
    });

    it("David claim the jackpot", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      result = await deLott.connect(david).claimTickets("1", ["110"], ["5"]);
      const receipt = await result.wait();
      const event = receipt.events?.pop();
      expect(event?.event).to.equal("TicketClaim");
      expect(event?.args?.lotteryId).to.equal("1");
      expect(event?.args?.claimer).to.equal(david.address);
      console.log(event?.args?.amount.toString());

      result = await deLott.viewNumbersAndStatusesForTicketIds(["110"]);
      expect(result[1][0]).to.be.true;
    });

    it("Bob claims 10 winning tickets he bought", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      result = await deLott
        .connect(bob)
        .claimTickets(
          "1",
          ["8", "18", "28", "48", "58", "68", "78", "88", "98", "38"],
          ["0", "0", "0", "0", "0", "0", "0", "0", "0", "1"]
        );
      const receipt = await result.wait();
      const event = receipt.events?.pop();
      expect(event?.event).to.equal("TicketClaim");
      expect(event?.args?.lotteryId).to.equal("1");
      expect(event?.args?.claimer).to.equal(bob.address);
      console.log(event?.args?.amount.toString());

      result = await deLott.viewNumbersAndStatusesForTicketIds([
        "8",
        "18",
        "28",
        "48",
        "58",
        "68",
        "78",
        "88",
        "98",
        "38",
      ]);

      for (const claimed of result[1]) expect(claimed).to.be.true;
    });
  });

  describe("Lottery 2", () => {
    it("Operator cannot close lottery that is in claiming", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(operator).closeLottery("1")
      ).to.be.revertedWith("Not open");
    });

    it("Operator cannot inject funds in a lottery that is open status", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(alice).injectFunds("1", ethers.utils.parseEther("5000"))
      ).to.be.revertedWith("Not open");
    });

    it("Operator cannot draw final number in a lottery that is open status", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott
          .connect(operator)
          .drawFinalNumberAndMakeLotteryClaimable("1", true)
      ).to.be.revertedWith("Not closed");
    });

    it("User cannot buy tickets for old lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(david).buyTickets("1", ["1111111"])
      ).to.be.revertedWith("Lottery not open");
    });

    it("User cannot buy tickets for future lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(david).buyTickets("3", ["1111111"])
      ).to.be.revertedWith("Lottery not open");
    });

    it("User cannot claim tickets with wrong bracket", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["6"])
      ).to.be.revertedWith("Bracket out of range");
      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["5"])
      ).to.be.rejectedWith("No prize for this bracket");
      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["4"])
      ).to.be.rejectedWith("No prize for this bracket");
      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["3"])
      ).to.be.rejectedWith("No prize for this bracket");
      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["2"])
      ).to.be.rejectedWith("No prize for this bracket");
      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["1"])
      ).to.be.rejectedWith("No prize for this bracket");
      await expect(
        deLott.connect(david).claimTickets("1", ["104"], ["0"])
      ).to.be.rejectedWith("No prize for this bracket");
    });

    it("User cannot claim twice a winning ticket", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(david).claimTickets("1", ["110"], ["5"])
      ).to.be.revertedWith("Not owner");
    });

    it("Operator cannot start lottery if length is too short/long", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      const currentLengthLottery = _lengthLottery;
      _lengthLottery = await deLott.MAX_LENGTH_LOTTERY();
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      endTime = BigNumber.from(timestamp)
        .add(_lengthLottery)
        .add(BigNumber.from(100));

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Lottery length out of range");

      _lengthLottery = currentLengthLottery;

      endTime = BigNumber.from(timestamp).add(_lengthLottery);
    });

    it("Operator cannot start lottery if discout divisor is too low", async () => {
      const currentDiscountDividor = _discountDivisor;

      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      _discountDivisor = BigNumber.from(
        await deLott.MIN_DISCOUNT_DIVISOR()
      ).sub(BigNumber.from(1));

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Discount divisor too low");

      _discountDivisor = currentDiscountDividor;
    });

    it("Operator cannot start lottery if treasury fee too high", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      const currentTreasuryFee = _treasuryFee;

      _treasuryFee = BigNumber.from(await deLott.MAX_TREASURY_FEE()).add(
        BigNumber.from("1")
      );

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Treasury fee too high");

      _treasuryFee = currentTreasuryFee;
    });

    it("Operator cannot start lottery if ticket price too low or too high", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      const currentPriceTicketInCake = _priceTicketInCake;

      _priceTicketInCake = (await deLott.minPriceTicketInCake()).sub(
        BigNumber.from("1")
      );

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Price ticket out of range");

      _priceTicketInCake = (await deLott.maxPriceTicketInCake()).add(
        BigNumber.from("1")
      );

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Price ticket out of range");

      _priceTicketInCake = currentPriceTicketInCake;
    });

    it("Operator cannot start lottery if rewards breakdown is wrong", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      const currentRewardsBreakdown = _rewardsBreakdown;

      _rewardsBreakdown = ["1000", "1000", "1000", "1000", "1000", "1000"];

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Rewards breakdown must sum to 10,000");

      _rewardsBreakdown = ["1000", "1000", "1000", "1000", "1000", "10000"];

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Rewards breakdown must sum to 10,000");

      _rewardsBreakdown = currentRewardsBreakdown;
    });

    it("Operator start lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      result = await deLott
        .connect(operator)
        .startLottery(
          endTime,
          _priceTicketInCake,
          _discountDivisor,
          _rewardsBreakdown,
          _treasuryFee
        );

      const receipt = await result.wait();
      // expect emit events
      expect(receipt.events[0].event).to.equal("LotteryOpen");
      expect(receipt.events[0].args[0]).to.equal(2);
      expect(receipt.events[0].args[1]).to.equal(
        await (
          await ethers.provider.getBlock("latest")
        ).timestamp
      );
      expect(receipt.events[0].args[2]).to.equal(endTime);
      expect(receipt.events[0].args[3]).to.equal(_priceTicketInCake);
    });

    it("Operator cannot close Lottery when lottery endtime is not reached", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(deLott.connect(operator).closeLottery(2)).to.be.revertedWith(
        "Not ended"
      );
    });

    it("Operator cannot draw numbers", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott
          .connect(operator)
          .drawFinalNumberAndMakeLotteryClaimable("2", true)
      ).to.be.revertedWith("Not closed");
    });

    it("Operator cannot start another lottery", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Not time to start");
    });

    it("User cannot buy 0 tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(deLott.connect(bob).buyTickets(2, [])).to.be.revertedWith(
        "No tickets"
      );
    });

    it("User cannot more than the limit of tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const _maxTicketsPerBuyOrClaim = "5";
      await deLott
        .connect(alice)
        .setMaxNumberTicketsPerBuy(_maxTicketsPerBuyOrClaim);

      await expect(
        deLott
          .connect(bob)
          .buyTickets(2, [
            "123456",
            "123456",
            "123456",
            "123456",
            "123456",
            "123456",
          ])
      ).to.be.revertedWith("Too many tickets");

      await deLott.connect(alice).setMaxNumberTicketsPerBuy("100");
    });

    it("User cannot buy tickets if one of the numbers is outside of range", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(bob).buyTickets(2, ["12222222"])
      ).to.be.revertedWith("Invalid ticket number");

      await expect(deLott.connect(bob).buyTickets(2, ["1"])).to.be.revertedWith(
        "Invalid ticket number"
      );
    });

    it("Bob buy 2 tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      const cakeBefore = await mockCake.balanceOf(bob.address);
      const deLottBefore = await mockCake.balanceOf(deLott.address);

      await mockCake
        .connect(bob)
        .approve(deLott.address, _priceTicketInCake.mul(2));
      await deLott.connect(bob).buyTickets(2, ["123456", "123457"]);

      const bulkTicketPrice = calculatePriceBulkTickets(
        _discountDivisor,
        _priceTicketInCake,
        BigNumber.from(2)
      );
      const cakeAfter = await mockCake.balanceOf(bob.address);
      const deLottAfter = await mockCake.balanceOf(deLott.address);

      expect(cakeAfter).to.equal(cakeBefore.sub(bulkTicketPrice));
      expect(deLottAfter).to.equal(deLottBefore.add(bulkTicketPrice));
    });

    it("user cannot claim tickets if argument arrays are not in the same length", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(bob).claimTickets(2, ["123456", "123457"], ["1"])
      ).to.be.revertedWith("Not same length");

      await expect(
        deLott
          .connect(bob)
          .claimTickets(2, ["123456", "123457"], ["1", "2", "3"])
      ).to.be.revertedWith("Not same length");
    });

    it("User cannot claim tickets if not over", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(bob).claimTickets(2, ["123456", "123457"], ["1", "2"])
      ).to.be.revertedWith("Not claimable");
    });

    it("User cannot buy tickets when lottery is ended", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await time.increase(endTime);

      await expect(
        deLott.connect(bob).buyTickets(2, ["123456", "123457"])
      ).to.be.revertedWith("Lottery closed");
    });

    it("Cannot change generator number", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(alice).changeRandomGenerator(mockRNG.address)
      ).to.be.revertedWith("Lottery not claimable");
    });

    it("Operator cannot draw numbers if the lotteryId isn't updated in RandomGenerator", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await mockRNG.connect(alice).setNextRandomResult("1999994");

      const treasuryBefore = await mockCake.balanceOf(treasury.address);
      expect(await deLott.connect(operator).closeLottery("2"))
        .to.emit(deLott, "LotteryClosed")
        .withArgs("2", "113");

      await expect(
        deLott
          .connect(operator)
          .drawFinalNumberAndMakeLotteryClaimable("2", false)
      ).to.be.rejectedWith("Numbers not drawn");

      await mockRNG.connect(alice).changeLatestLotteryId();

      expect(
        await deLott
          .connect(operator)
          .drawFinalNumberAndMakeLotteryClaimable("2", false)
      )
        .to.emit(deLott, "LotteryClaimable")
        .withArgs("2", "1999994", "0");

      expect(await mockCake.balanceOf(treasury.address)).to.equal(
        treasuryBefore.add(ethers.utils.parseEther("3620.0804"))
      );
    });

    it("Cannot claim for wrong lottery (too high)", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(bob).claimTickets(1, ["200"], ["1"])
      ).to.be.revertedWith("Ticket too high");

      await expect(
        deLott.connect(bob).claimTickets(2, ["200"], ["1"])
      ).to.be.revertedWith("Ticket too high");
    });

    it("Cannot claim for wrong lottery (too low)", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(bob).claimTickets(2, ["0"], ["1"])
      ).to.be.revertedWith("Ticket too low");
    });

    it("Lottery starts, close, and numbers get drawn without a participant", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      endTime = BigNumber.from(timestamp).add(BigNumber.from(60 * 60 * 4));
      expect(
        await deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      )
        .to.emit(deLott, "LotteryOpen")
        .withArgs("3", endTime, _priceTicketInCake, "113", "0");

      await time.increase(endTime);
      expect(await deLott.connect(operator).closeLottery("3"))
        .to.emit(deLott, "LotteryClosed")
        .withArgs("3", "113");

      await mockRNG.connect(alice).changeLatestLotteryId();

      expect(
        await deLott
          .connect(operator)
          .drawFinalNumberAndMakeLotteryClaimable("3", true)
      )
        .to.emit(deLott, "LotteryNumberDrawn")
        .withArgs("3", "1999994", "0");

      await expect(
        deLott.connect(bob).claimTickets("3", ["113"], ["1"])
      ).to.be.revertedWith("Ticket too high");
    });

    it("Change the random generator (to existing one)", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      expect(await deLott.changeRandomGenerator(mockRNG.address))
        .to.emit(deLott, "NewRandomGenerator")
        .withArgs(mockRNG.address);
    });

    it("Lottery starts with only 4 brackets with a prize, one user buys tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await mockRNG.connect(alice).setNextRandomResult("188888888");

      const newRewardsBreakdown = ["1000", "0", "1500", "2500", "0", "5000"];

      endTime = BigNumber.from(await time.latest()).add(
        BigNumber.from(60 * 60 * 4)
      );
      expect(
        await deLott
          .connect(operator)
          .startLottery(
            endTime,
            _priceTicketInCake,
            _discountDivisor,
            newRewardsBreakdown,
            _treasuryFee
          )
      )
        .to.emit(deLott, "LotteryOpen")
        .withArgs("4", endTime, _priceTicketInCake, "113", "0");

      await deLott
        .connect(injector)
        .injectFunds("4", ethers.utils.parseEther("1000"));
      const _ticketsBought = [
        "1111118",
        "1222288",
        "1333888",
        "1448888",
        "1588888",
        "1888888",
      ];

      expect(
        await deLott.connect(carol).buyTickets("4", _ticketsBought)
      ).changeTokenBalance(
        mockCake,
        carol,
        calculatePriceBulkTickets(
          _discountDivisor,
          _priceTicketInCake,
          BigNumber.from(_ticketsBought.length)
        ).mul(-1)
      );
    });

    it("Lottery close and numbers get drawn with only 4 brackets with a prize", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      await time.increase(endTime);

      const treasuryBefore = await mockCake.balanceOf(treasury.address);

      expect(await deLott.connect(operator).closeLottery("4"));

      await mockRNG.connect(alice).changeLatestLotteryId();

      expect(
        await deLott
          .connect(operator)
          .drawFinalNumberAndMakeLotteryClaimable("4", true)
      )
        .to.emit(deLott, "LotteryNumberDrawn")
        .withArgs("4", "1888888", "6");

      expect(await mockCake.balanceOf(treasury.address)).to.equal(
        treasuryBefore.add(ethers.utils.parseEther("200.5985"))
      );
    });

    it("User claims first ticket", async () => {
      // 802.394 CAKE to collect
      // Rewards: ["1000", "0", "1500", "2500", "0", "5000"];
      // 2 tickets with 1 matching --> 10% * 802.394 --> 80.2394 total --> 40.1197/ticket
      // 1 ticket with 3 matching --> 15% * 802.394 --> 120.3591 total --> 120.3591/ticket
      // 2 tickets with 4 matching --> 25% * 802.394 --> 200.5985 total --> 100.29925/ticket
      // 1 ticket with 6 matching --> 50% * 802.394 --> 401.197 total --> 401.197/ticket

      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      expect(await deLott.connect(carol).claimTickets("4", ["113"], ["0"]))
        .to.emit(deLott, "TicketClaim")
        .withArgs(carol.address, ethers.utils.parseEther("40.1197"), "4", "1");
    });

    it("User cannot claim ticket in a bracket if equals to 0", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(carol).claimTickets("4", ["114"], ["1"])
      ).to.be.revertedWith("No prize for this bracket");

      expect(await deLott.connect(carol).claimTickets("4", ["114"], ["0"]))
        .to.emit(deLott, "TicketClaim")
        .withArgs(carol.address, ethers.utils.parseEther("40.1197"), "4", "1");
    });

    it("User claims 2 more tickets", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      expect(
        await deLott
          .connect(carol)
          .claimTickets("4", ["115", "118"], ["2", "5"])
      )
        .to.emit(deLott, "TicketClaim")
        .withArgs(carol.address, ethers.utils.parseEther("521.5561"), "4", "2");
    });

    it("User cannot claim ticket in a lower bracket if bracket above is not 0", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(carol).claimTickets("4", ["116"], ["2"])
      ).to.be.revertedWith("Bracket must be higher");

      expect(
        await deLott
          .connect(carol)
          .claimTickets("4", ["116", "117"], ["3", "3"])
      )
        .to.emit(deLott, "TicketClaim")
        .withArgs(carol.address, ethers.utils.parseEther("200.5985"), "4", "2");
    });
  });

  describe("Role Exception", async () => {
    it("Owner can recover funds only if not CAKE token", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const randomToken = await MockERC20.deploy(
        "Random Token",
        "RT",
        ethers.utils.parseEther("100")
      );

      // Transfer token by accident
      await randomToken.transfer(deLott.address, ethers.utils.parseEther("1"));

      await expect(
        deLott
          .connect(alice)
          .recoverWrongTokens(randomToken.address, ethers.utils.parseEther("1"))
      )
        .to.emit(deLott, "AdminTokenRecovery")
        .withArgs(randomToken.address, ethers.utils.parseEther("1"));

      await expect(
        deLott
          .connect(alice)
          .recoverWrongTokens(mockCake.address, ethers.utils.parseEther("1"))
      ).to.be.rejectedWith("Cannot be CAKE");
    });

    it("Only operator can call operator functions", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();
      await expect(
        deLott
          .connect(alice)
          .startLottery(
            _lengthLottery,
            _priceTicketInCake,
            _discountDivisor,
            _rewardsBreakdown,
            _treasuryFee
          )
      ).to.be.revertedWith("Not operator");

      await expect(deLott.connect(alice).closeLottery("2")).to.be.revertedWith(
        "Not operator"
      );
      await expect(
        deLott.connect(alice).drawFinalNumberAndMakeLotteryClaimable("2", true)
      ).to.be.revertedWith("Not operator");
    });

    it("Only owner/injector can call owner functions", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(operator).setMaxNumberTicketsPerBuy("1")
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        deLott
          .connect(operator)
          .setOperatorAndTreasuryAndInjectorAddress(
            operator.address,
            treasury.address,
            injector.address
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        deLott.connect(operator).injectFunds("1", ethers.utils.parseEther("10"))
      ).to.be.revertedWith("Not owner or injector");

      await expect(
        deLott
          .connect(operator)
          .recoverWrongTokens(mockCake.address, ethers.utils.parseEther("10"))
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        deLott.connect(operator).changeRandomGenerator(mockRNG.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Revert statements work in owner functions", async () => {
      const [alice, bob, carol, david, erin, operator, treasury, injector] =
        await ethers.getSigners();

      await expect(
        deLott.connect(alice).setMaxNumberTicketsPerBuy("0")
      ).to.be.revertedWith("Invalid max number of tickets");

      await expect(
        deLott
          .connect(alice)
          .setOperatorAndTreasuryAndInjectorAddress(
            operator.address,
            ethers.constants.AddressZero,
            injector.address
          )
      ).to.be.revertedWith("Invalid treasury address");

      await expect(
        deLott
          .connect(alice)
          .setOperatorAndTreasuryAndInjectorAddress(
            ethers.constants.AddressZero,
            treasury.address,
            injector.address
          )
      ).to.be.revertedWith("Invalid operator address");

      await expect(
        deLott
          .connect(alice)
          .setOperatorAndTreasuryAndInjectorAddress(
            operator.address,
            treasury.address,
            ethers.constants.AddressZero
          )
      ).to.be.revertedWith("Invalid injector address");
    });
  });
});
