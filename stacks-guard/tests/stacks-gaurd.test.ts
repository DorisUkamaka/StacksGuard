import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const deployer = accounts.get("deployer")!;

// Test constants that match contract constants
const MIN_PREMIUM = 1000000; // 1 STX
const MAX_COVERAGE = 1000000000000; // 1M STX
const MIN_DURATION = 144; // ~1 day in blocks
const MAX_DURATION = 52560; // ~1 year in blocks
const MIN_STAKE = 10000000; // 10 STX

describe("StacksGuard Contract Tests", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.mineEmptyBlocks(1);
  });

  describe("Contract Initialization", () => {
    it("ensures simnet is well initialised", () => {
      expect(simnet.blockHeight).toBeDefined();
    });

    it("initializes contract with correct default values", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-contract-stats", [], deployer);
      expect(result).toEqual(
        Cl.tuple({
          "total-pools": Cl.uint(0),
          "total-policies": Cl.uint(0),
          "total-claims": Cl.uint(0),
          "protocol-fees": Cl.uint(0),
          "is-paused": Cl.bool(false),
        })
      );
    });

    it("sets correct contract owner", () => {
      // Contract owner should be the deployer
      const { result } = simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      expect(result).toBeOk(Cl.bool(true));
      
      // Reset for other tests
      simnet.callPublicFn("stacks-guard", "unpause-contract", [], deployer);
    });
  });

  describe("Administrative Functions", () => {
    it("allows owner to pause contract", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      expect(result).toBeOk(Cl.bool(true));

      const { result: stats } = simnet.callReadOnlyFn("stacks-guard", "get-contract-stats", [], deployer);
      expect(stats).toEqual(
        Cl.tuple({
          "total-pools": Cl.uint(0),
          "total-policies": Cl.uint(0),
          "total-claims": Cl.uint(0),
          "protocol-fees": Cl.uint(0),
          "is-paused": Cl.bool(true),
        })
      );
    });

    it("allows owner to unpause contract", () => {
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      const { result } = simnet.callPublicFn("stacks-guard", "unpause-contract", [], deployer);
      expect(result).toBeOk(Cl.bool(true));

      const { result: stats } = simnet.callReadOnlyFn("stacks-guard", "get-contract-stats", [], deployer);
      expect(stats).toEqual(
        Cl.tuple({
          "total-pools": Cl.uint(0),
          "total-policies": Cl.uint(0),
          "total-claims": Cl.uint(0),
          "protocol-fees": Cl.uint(0),
          "is-paused": Cl.bool(false),
        })
      );
    });

    it("prevents non-owner from pausing contract", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "pause-contract", [], address1);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("prevents non-owner from unpausing contract", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "unpause-contract", [], address1);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("allows owner to set protocol fee rate", () => {
      const newRate = 500; // 5%
      const { result } = simnet.callPublicFn("stacks-guard", "set-protocol-fee-rate", [Cl.uint(newRate)], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents setting protocol fee rate above 10%", () => {
      const invalidRate = 1100; // 11%
      const { result } = simnet.callPublicFn("stacks-guard", "set-protocol-fee-rate", [Cl.uint(invalidRate)], deployer);
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents non-owner from setting protocol fee rate", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "set-protocol-fee-rate", [Cl.uint(300)], address1);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });
  });

  describe("Insurance Pool Management", () => {
    it("creates insurance pool with valid parameters", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Health Insurance"),
        Cl.stringAscii("Comprehensive health coverage pool"),
        Cl.uint(50) // risk factor
      ], address1);
      expect(result).toBeOk(Cl.uint(1)); // First pool ID should be 1
    });

    it("creates multiple insurance pools", () => {
      const { result: pool1 } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Health Insurance"),
        Cl.stringAscii("Health coverage pool"),
        Cl.uint(30)
      ], address1);
      expect(pool1).toBeOk(Cl.uint(1));

      const { result: pool2 } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Auto Insurance"),
        Cl.stringAscii("Vehicle coverage pool"),
        Cl.uint(70)
      ], address2);
      expect(pool2).toBeOk(Cl.uint(2));

      const { result: stats } = simnet.callReadOnlyFn("stacks-guard", "get-contract-stats", [], deployer);
      expect(stats).toEqual(
        Cl.tuple({
          "total-pools": Cl.uint(2),
          "total-policies": Cl.uint(0),
          "total-claims": Cl.uint(0),
          "protocol-fees": Cl.uint(0),
          "is-paused": Cl.bool(false),
        })
      );
    });

    it("prevents creating pool with invalid risk factor", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Invalid Pool"),
        Cl.stringAscii("Pool with invalid risk factor"),
        Cl.uint(150) // Invalid risk factor > 100
      ], address1);
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents creating pool with empty name", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii(""),
        Cl.stringAscii("Pool with empty name"),
        Cl.uint(50)
      ], address1);
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents creating pool when contract is paused", () => {
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Test Pool"),
        Cl.stringAscii("Test description"),
        Cl.uint(50)
      ], address1);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("retrieves pool information correctly", () => {
      const poolName = "Test Pool";
      const poolDescription = "Test pool description";
      const riskFactor = 25;
      
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii(poolName),
        Cl.stringAscii(poolDescription),
        Cl.uint(riskFactor)
      ], address1);

      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-pool-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii(poolName),
          description: Cl.stringAscii(poolDescription),
          "total-staked": Cl.uint(0),
          "active-policies": Cl.uint(0),
          "risk-factor": Cl.uint(riskFactor),
          "created-at": Cl.uint(simnet.blockHeight),
          "is-active": Cl.bool(true),
        })
      );
    });

    it("returns none for non-existent pool", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-pool-info", [Cl.uint(999)], address1);
      expect(result).toBeNone();
    });
  });

  describe("Underwriter Staking", () => {
    beforeEach(() => {
      // Create a pool for staking tests
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Test Pool"),
        Cl.stringAscii("Pool for staking tests"),
        Cl.uint(40)
      ], address1);
    });

    it("allows staking in insurance pool", () => {
      const stakeAmount = MIN_STAKE;
      const { result } = simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(1), // pool-id
        Cl.uint(stakeAmount)
      ], address1);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents staking below minimum amount", () => {
      const invalidStakeAmount = MIN_STAKE - 1;
      const { result } = simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(1),
        Cl.uint(invalidStakeAmount)
      ], address1);
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents staking in non-existent pool", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(999), // Non-existent pool
        Cl.uint(MIN_STAKE)
      ], address1);
      expect(result).toBeErr(Cl.uint(410)); // ERR_POOL_NOT_FOUND
    });

    it("prevents staking when contract is paused", () => {
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(1),
        Cl.uint(MIN_STAKE)
      ], address1);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("allows multiple stakes in same pool", () => {
      const stakeAmount = MIN_STAKE;
      
      // First stake
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      
      // Second stake
      const { result } = simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("updates pool total staked amount", () => {
      const stakeAmount = MIN_STAKE;
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-pool-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Test Pool"),
          description: Cl.stringAscii("Pool for staking tests"),
          "total-staked": Cl.uint(stakeAmount),
          "active-policies": Cl.uint(0),
          "risk-factor": Cl.uint(40),
          "created-at": Cl.uint(simnet.blockHeight - 1),
          "is-active": Cl.bool(true),
        })
      );
    });

    it("retrieves underwriter stake information", () => {
      const stakeAmount = MIN_STAKE;
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-underwriter-stake", [Cl.principal(address1), Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          "staked-amount": Cl.uint(stakeAmount),
          "staked-at": Cl.uint(simnet.blockHeight),
          "rewards-earned": Cl.uint(0),
          "is-active": Cl.bool(true),
        })
      );
    });

    it("allows unstaking from pool", () => {
      const stakeAmount = MIN_STAKE;
      const unstakeAmount = MIN_STAKE / 2;
      
      // First stake
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      
      // Then unstake
      const { result } = simnet.callPublicFn("stacks-guard", "unstake-from-pool", [Cl.uint(1), Cl.uint(unstakeAmount)], address1);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents unstaking more than staked", () => {
      const stakeAmount = MIN_STAKE;
      const invalidUnstakeAmount = stakeAmount + 1;
      
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      
      const { result } = simnet.callPublicFn("stacks-guard", "unstake-from-pool", [Cl.uint(1), Cl.uint(invalidUnstakeAmount)], address1);
      expect(result).toBeErr(Cl.uint(404)); // ERR_INSUFFICIENT_BALANCE
    });

    it("prevents unstaking from non-existent stake", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "unstake-from-pool", [Cl.uint(1), Cl.uint(MIN_STAKE)], address2);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("calculates voting power correctly", () => {
      const stakeAmount = MIN_STAKE;
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(stakeAmount)], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-voting-power-for-user", [Cl.principal(address1), Cl.uint(1)], address1);
      expect(result).toBeOk(Cl.uint(stakeAmount / 1000000)); // 1 vote per STX staked
    });

    it("returns zero voting power for non-stakers", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-voting-power-for-user", [Cl.principal(address2), Cl.uint(1)], address1);
      expect(result).toBeOk(Cl.uint(0));
    });
  });
});