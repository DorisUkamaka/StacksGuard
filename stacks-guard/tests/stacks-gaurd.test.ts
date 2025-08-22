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

describe("Policy Management", () => {
    beforeEach(() => {
      // Create a pool and stake funds for policy tests
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Test Pool"),
        Cl.stringAscii("Pool for policy tests"),
        Cl.uint(50)
      ], address1);
      
      // Stake enough to cover policies
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(1),
        Cl.uint(100000000) // 100 STX
      ], address2);
    });

    it("calculates premium correctly", () => {
      const coverageAmount = 10000000; // 10 STX
      const duration = 1000; // blocks
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "calculate-policy-premium", [
        Cl.uint(coverageAmount),
        Cl.uint(duration),
        Cl.uint(1) // pool-id
      ], address1);
      
      expect(result).toBeOk(Cl.uint(expect.any(Number)));
    });

    it("returns error for premium calculation on non-existent pool", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "calculate-policy-premium", [
        Cl.uint(10000000),
        Cl.uint(1000),
        Cl.uint(999) // Non-existent pool
      ], address1);
      
      expect(result).toBeErr(Cl.uint(410)); // ERR_POOL_NOT_FOUND
    });

    it("allows purchasing policy with valid parameters", () => {
      const coverageAmount = 10000000; // 10 STX
      const duration = 1000; // blocks
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1), // pool-id
        Cl.uint(coverageAmount),
        Cl.uint(duration)
      ], address1);
      
      expect(result).toBeOk(Cl.uint(1)); // First policy ID should be 1
    });

    it("prevents purchasing policy with coverage below minimum", () => {
      const invalidCoverage = MIN_PREMIUM - 1;
      const duration = 1000;
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(invalidCoverage),
        Cl.uint(duration)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents purchasing policy with coverage above maximum", () => {
      const invalidCoverage = MAX_COVERAGE + 1;
      const duration = 1000;
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(invalidCoverage),
        Cl.uint(duration)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents purchasing policy with duration below minimum", () => {
      const coverageAmount = 10000000;
      const invalidDuration = MIN_DURATION - 1;
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(coverageAmount),
        Cl.uint(invalidDuration)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(409)); // ERR_INVALID_DURATION
    });

    it("prevents purchasing policy with duration above maximum", () => {
      const coverageAmount = 10000000;
      const invalidDuration = MAX_DURATION + 1;
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(coverageAmount),
        Cl.uint(invalidDuration)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(409)); // ERR_INVALID_DURATION
    });

    it("prevents purchasing policy from non-existent pool", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(999), // Non-existent pool
        Cl.uint(10000000),
        Cl.uint(1000)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(410)); // ERR_POOL_NOT_FOUND
    });

    it("prevents purchasing policy when contract is paused", () => {
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000),
        Cl.uint(1000)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("prevents purchasing policy with insufficient pool coverage", () => {
      // Create a pool with minimal staking
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Small Pool"),
        Cl.stringAscii("Pool with minimal funds"),
        Cl.uint(30)
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(2), // New pool ID
        Cl.uint(MIN_STAKE) // Minimal stake
      ], address2);
      
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(2),
        Cl.uint(50000000), // 50 STX - more than pool has
        Cl.uint(1000)
      ], address1);
      
      expect(result).toBeErr(Cl.uint(408)); // ERR_INSUFFICIENT_COVERAGE
    });

    it("creates multiple policies", () => {
      const coverageAmount = 5000000; // 5 STX
      const duration = 1000;
      
      const { result: policy1 } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(coverageAmount),
        Cl.uint(duration)
      ], address1);
      expect(policy1).toBeOk(Cl.uint(1));
      
      const { result: policy2 } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(coverageAmount),
        Cl.uint(duration)
      ], address3);
      expect(policy2).toBeOk(Cl.uint(2));
    });

    it("updates contract stats after policy purchase", () => {
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000),
        Cl.uint(1000)
      ], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-contract-stats", [], deployer);
      expect(result).toEqual(
        Cl.tuple({
          "total-pools": Cl.uint(1),
          "total-policies": Cl.uint(1),
          "total-claims": Cl.uint(0),
          "protocol-fees": Cl.uint(expect.any(Number)),
          "is-paused": Cl.bool(false),
        })
      );
    });

    it("updates pool active policies count", () => {
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000),
        Cl.uint(1000)
      ], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-pool-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Test Pool"),
          description: Cl.stringAscii("Pool for policy tests"),
          "total-staked": Cl.uint(100000000),
          "active-policies": Cl.uint(1),
          "risk-factor": Cl.uint(50),
          "created-at": Cl.uint(simnet.blockHeight - 2),
          "is-active": Cl.bool(true),
        })
      );
    });

    it("retrieves policy information correctly", () => {
      const coverageAmount = 10000000;
      const duration = 1000;
      
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(coverageAmount),
        Cl.uint(duration)
      ], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-policy-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          holder: Cl.principal(address1),
          "pool-id": Cl.uint(1),
          "coverage-amount": Cl.uint(coverageAmount),
          "premium-paid": Cl.uint(expect.any(Number)),
          "start-block": Cl.uint(simnet.blockHeight),
          "end-block": Cl.uint(simnet.blockHeight + duration),
          "is-active": Cl.bool(true),
          "claims-made": Cl.uint(0),
        })
      );
    });

    it("returns none for non-existent policy", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-policy-info", [Cl.uint(999)], address1);
      expect(result).toBeNone();
    });

    it("validates policy status correctly", () => {
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000),
        Cl.uint(1000)
      ], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "is-policy-valid", [Cl.uint(1)], address1);
      expect(result).toBeBool(true);
    });

    it("returns false for expired policy", () => {
      // Create a policy with short duration
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000),
        Cl.uint(MIN_DURATION) // Minimum duration
      ], address1);
      
      // Advance blocks beyond policy duration
      simnet.mineEmptyBlocks(MIN_DURATION + 1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "is-policy-valid", [Cl.uint(1)], address1);
      expect(result).toBeBool(false);
    });

    it("returns false for non-existent policy", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "is-policy-valid", [Cl.uint(999)], address1);
      expect(result).toBeBool(false);
    });

    it("handles premium calculation with different risk factors", () => {
      // Create pools with different risk factors
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Low Risk Pool"),
        Cl.stringAscii("Pool with low risk"),
        Cl.uint(10) // Low risk
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("High Risk Pool"),
        Cl.stringAscii("Pool with high risk"),
        Cl.uint(90) // High risk
      ], address1);
      
      // Stake in both pools
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(2), Cl.uint(50000000)], address2);
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(3), Cl.uint(50000000)], address2);
      
      const coverageAmount = 10000000;
      const duration = 1000;
      
      const { result: lowRiskPremium } = simnet.callReadOnlyFn("stacks-guard", "calculate-policy-premium", [
        Cl.uint(coverageAmount),
        Cl.uint(duration),
        Cl.uint(2) // Low risk pool
      ], address1);
      
      const { result: highRiskPremium } = simnet.callReadOnlyFn("stacks-guard", "calculate-policy-premium", [
        Cl.uint(coverageAmount),
        Cl.uint(duration),
        Cl.uint(3) // High risk pool
      ], address1);
      
      expect(lowRiskPremium).toBeOk(Cl.uint(expect.any(Number)));
      expect(highRiskPremium).toBeOk(Cl.uint(expect.any(Number)));
      // High risk should have higher premium than low risk
      const lowRiskAmount = (lowRiskPremium as { value: { value: bigint } }).value.value;
      const highRiskAmount = (highRiskPremium as { value: { value: bigint } }).value.value;
      expect(Number(highRiskAmount)).toBeGreaterThan(Number(lowRiskAmount));
    });
  });

describe("Claims Management", () => {
    beforeEach(() => {
      // Setup: Create pool, stake funds, and purchase policy
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Test Pool"),
        Cl.stringAscii("Pool for claims tests"),
        Cl.uint(40)
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [
        Cl.uint(1),
        Cl.uint(100000000) // 100 STX
      ], address2);
      
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000), // 10 STX coverage
        Cl.uint(5000) // Long duration
      ], address1);
    });

    it("allows policy holder to submit claim", () => {
      const claimAmount = 5000000; // 5 STX
      const description = "Medical expenses claim";
      
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1), // policy-id
        Cl.uint(claimAmount),
        Cl.stringAscii(description)
      ], address1);
      
      expect(result).toBeOk(Cl.uint(1)); // First claim ID should be 1
    });

    it("prevents non-policy holder from submitting claim", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(5000000),
        Cl.stringAscii("Unauthorized claim")
      ], address2); // address2 is not the policy holder
      
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("prevents claim on non-existent policy", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(999), // Non-existent policy
        Cl.uint(5000000),
        Cl.stringAscii("Invalid policy claim")
      ], address1);
      
      expect(result).toBeErr(Cl.uint(403)); // ERR_POLICY_NOT_FOUND
    });

    it("prevents claim amount exceeding coverage", () => {
      const excessiveAmount = 15000000; // 15 STX - more than 10 STX coverage
      
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(excessiveAmount),
        Cl.stringAscii("Excessive claim")
      ], address1);
      
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents claim with empty description", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(5000000),
        Cl.stringAscii("")
      ], address1);
      
      expect(result).toBeErr(Cl.uint(402)); // ERR_INVALID_AMOUNT
    });

    it("prevents claim on expired policy", () => {
      // Create policy with short duration
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(10000000),
        Cl.uint(MIN_DURATION) // Minimum duration
      ], address3);
      
      // Advance blocks beyond policy duration
      simnet.mineEmptyBlocks(MIN_DURATION + 1);
      
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(2), // Second policy
        Cl.uint(5000000),
        Cl.stringAscii("Expired policy claim")
      ], address3);
      
      expect(result).toBeErr(Cl.uint(405)); // ERR_POLICY_EXPIRED
    });

    it("prevents claim submission when contract is paused", () => {
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(5000000),
        Cl.stringAscii("Paused contract claim")
      ], address1);
      
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("updates policy claims count after submission", () => {
      simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(5000000),
        Cl.stringAscii("Test claim")
      ], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-policy-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          holder: Cl.principal(address1),
          "pool-id": Cl.uint(1),
          "coverage-amount": Cl.uint(10000000),
          "premium-paid": Cl.uint(expect.any(Number)),
          "start-block": Cl.uint(expect.any(Number)),
          "end-block": Cl.uint(expect.any(Number)),
          "is-active": Cl.bool(true),
          "claims-made": Cl.uint(1),
        })
      );
    });

    it("retrieves claim information correctly", () => {
      const claimAmount = 5000000;
      const description = "Medical expenses";
      
      simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(claimAmount),
        Cl.stringAscii(description)
      ], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-claim-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          "policy-id": Cl.uint(1),
          claimant: Cl.principal(address1),
          amount: Cl.uint(claimAmount),
          description: Cl.stringAscii(description),
          "submitted-at": Cl.uint(expect.any(Number)),
          status: Cl.stringAscii("pending"),
          "votes-for": Cl.uint(0),
          "votes-against": Cl.uint(0),
          "voting-ends-at": Cl.uint(expect.any(Number)),
        })
      );
    });

    it("returns none for non-existent claim", () => {
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-claim-info", [Cl.uint(999)], address1);
      expect(result).toBeNone();
    });
  });

  describe("Claims Voting System", () => {
    beforeEach(() => {
      // Setup: Create pool, multiple stakers, policy, and claim
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Voting Pool"),
        Cl.stringAscii("Pool for voting tests"),
        Cl.uint(30)
      ], address1);
      
      // Multiple underwriters stake
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(50000000)], address2); // 50 STX
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(30000000)], address3); // 30 STX
      
      // Purchase policy and submit claim
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(15000000), // 15 STX coverage
        Cl.uint(5000)
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(8000000), // 8 STX claim
        Cl.stringAscii("Valid medical claim")
      ], address1);
    });

    it("allows underwriter to vote on claim", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "vote-on-claim", [
        Cl.uint(1), // claim-id
        Cl.bool(true) // approve
      ], address2);
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents non-underwriter from voting", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "vote-on-claim", [
        Cl.uint(1),
        Cl.bool(true)
      ], address1); // address1 is not an underwriter for this pool
      
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("prevents voting on non-existent claim", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "vote-on-claim", [
        Cl.uint(999), // Non-existent claim
        Cl.bool(true)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(406)); // ERR_CLAIM_NOT_FOUND
    });

    it("prevents double voting", () => {
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      
      const { result } = simnet.callPublicFn("stacks-guard", "vote-on-claim", [
        Cl.uint(1),
        Cl.bool(false) // Try to change vote
      ], address2);
      
      expect(result).toBeErr(Cl.uint(407)); // ERR_CLAIM_ALREADY_PROCESSED
    });

    it("prevents voting after voting period ends", () => {
      // Advance blocks beyond voting period (1008 blocks)
      simnet.mineEmptyBlocks(1009);
      
      const { result } = simnet.callPublicFn("stacks-guard", "vote-on-claim", [
        Cl.uint(1),
        Cl.bool(true)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(405)); // ERR_POLICY_EXPIRED
    });

    it("updates vote counts correctly", () => {
      // address2 has 50 STX staked = 50 voting power
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-claim-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          "policy-id": Cl.uint(1),
          claimant: Cl.principal(address1),
          amount: Cl.uint(8000000),
          description: Cl.stringAscii("Valid medical claim"),
          "submitted-at": Cl.uint(expect.any(Number)),
          status: Cl.stringAscii("pending"),
          "votes-for": Cl.uint(50),
          "votes-against": Cl.uint(0),
          "voting-ends-at": Cl.uint(expect.any(Number)),
        })
      );
    });

    it("handles multiple votes correctly", () => {
      // address2 votes for (50 voting power)
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      
      // address3 votes against (30 voting power)
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(false)], address3);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-claim-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          "policy-id": Cl.uint(1),
          claimant: Cl.principal(address1),
          amount: Cl.uint(8000000),
          description: Cl.stringAscii("Valid medical claim"),
          "submitted-at": Cl.uint(expect.any(Number)),
          status: Cl.stringAscii("pending"),
          "votes-for": Cl.uint(50),
          "votes-against": Cl.uint(30),
          "voting-ends-at": Cl.uint(expect.any(Number)),
        })
      );
    });

    it("prevents voting when contract is paused", () => {
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn("stacks-guard", "vote-on-claim", [
        Cl.uint(1),
        Cl.bool(true)
      ], address2);
      
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });
  });

  describe("Claims Processing", () => {
    beforeEach(() => {
      // Setup: Create pool, stakers, policy, and claim
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Processing Pool"),
        Cl.stringAscii("Pool for processing tests"),
        Cl.uint(25)
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(60000000)], address2); // 60 STX
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(40000000)], address3); // 40 STX
      
      simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(20000000), // 20 STX coverage
        Cl.uint(5000)
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(12000000), // 12 STX claim
        Cl.stringAscii("Processing test claim")
      ], address1);
    });

    it("processes approved claim correctly", () => {
      // Both underwriters vote to approve (majority)
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2); // 60 votes
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address3); // 40 votes
      
      // Advance beyond voting period
      simnet.mineEmptyBlocks(1009);
      
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeOk(Cl.stringAscii("approved"));
    });

    it("processes rejected claim correctly", () => {
      // Both underwriters vote to reject (majority)
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(false)], address2); // 60 votes
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(false)], address3); // 40 votes
      
      // Advance beyond voting period
      simnet.mineEmptyBlocks(1009);
      
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeOk(Cl.stringAscii("rejected"));
    });

    it("processes claim with majority approval", () => {
      // address2 votes for (60 votes), address3 votes against (40 votes)
      // Majority should approve (60 > 50% of 100)
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(false)], address3);
      
      simnet.mineEmptyBlocks(1009);
      
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeOk(Cl.stringAscii("approved"));
    });

    it("processes claim with majority rejection", () => {
      // address2 votes against (60 votes), address3 votes for (40 votes)
      // Majority should reject (60 > 50% of 100)
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(false)], address2);
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address3);
      
      simnet.mineEmptyBlocks(1009);
      
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeOk(Cl.stringAscii("rejected"));
    });

    it("prevents processing before voting period ends", () => {
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      
      // Don't advance blocks - still in voting period
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeErr(Cl.uint(406)); // ERR_CLAIM_NOT_FOUND (voting not ended)
    });

    it("prevents processing non-existent claim", () => {
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(999)], address1);
      expect(result).toBeErr(Cl.uint(406)); // ERR_CLAIM_NOT_FOUND
    });

    it("prevents double processing", () => {
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      simnet.mineEmptyBlocks(1009);
      
      // First processing
      simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      
      // Second processing attempt
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeErr(Cl.uint(407)); // ERR_CLAIM_ALREADY_PROCESSED
    });

    it("prevents processing when contract is paused", () => {
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      simnet.mineEmptyBlocks(1009);
      simnet.callPublicFn("stacks-guard", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("updates claim status after processing", () => {
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address3);
      simnet.mineEmptyBlocks(1009);
      
      simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      
      const { result } = simnet.callReadOnlyFn("stacks-guard", "get-claim-info", [Cl.uint(1)], address1);
      expect(result).toBeSome(
        Cl.tuple({
          "policy-id": Cl.uint(1),
          claimant: Cl.principal(address1),
          amount: Cl.uint(12000000),
          description: Cl.stringAscii("Processing test claim"),
          "submitted-at": Cl.uint(expect.any(Number)),
          status: Cl.stringAscii("approved"),
          "votes-for": Cl.uint(100),
          "votes-against": Cl.uint(0),
          "voting-ends-at": Cl.uint(expect.any(Number)),
        })
      );
    });
  });

  describe("Integration Tests", () => {
    it("complete insurance workflow", () => {
      // 1. Create insurance pool
      const { result: poolResult } = simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Complete Test Pool"),
        Cl.stringAscii("End-to-end workflow test pool"),
        Cl.uint(45)
      ], address1);
      expect(poolResult).toBeOk(Cl.uint(1));
      
      // 2. Underwriters stake funds
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(80000000)], address2); // 80 STX
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(20000000)], address3); // 20 STX
      
      // 3. User purchases policy
      const { result: policyResult } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(25000000), // 25 STX coverage
        Cl.uint(3000) // Duration
      ], address1);
      expect(policyResult).toBeOk(Cl.uint(1));
      
      // 4. Policy holder submits claim
      const { result: claimResult } = simnet.callPublicFn("stacks-guard", "submit-claim", [
        Cl.uint(1),
        Cl.uint(15000000), // 15 STX claim
        Cl.stringAscii("Emergency medical expenses")
      ], address1);
      expect(claimResult).toBeOk(Cl.uint(1));
      
      // 5. Underwriters vote on claim
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2); // Approve
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address3); // Approve
      
      // 6. Process claim after voting period
      simnet.mineEmptyBlocks(1009);
      const { result: processResult } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      expect(processResult).toBeOk(Cl.stringAscii("approved"));
      
      // 7. Verify final state
      const { result: finalStats } = simnet.callReadOnlyFn("stacks-guard", "get-contract-stats", [], deployer);
      expect(finalStats).toEqual(
        Cl.tuple({
          "total-pools": Cl.uint(1),
          "total-policies": Cl.uint(1),
          "total-claims": Cl.uint(1),
          "protocol-fees": Cl.uint(expect.any(Number)),
          "is-paused": Cl.bool(false),
        })
      );
    });

    it("handles multiple concurrent policies and claims", () => {
      // Create pool and stake
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Multi-Policy Pool"),
        Cl.stringAscii("Pool for multiple policies"),
        Cl.uint(35)
      ], address1);
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(200000000)], address2); // 200 STX
      
      // Multiple users purchase policies
      simnet.callPublicFn("stacks-guard", "purchase-policy", [Cl.uint(1), Cl.uint(30000000), Cl.uint(4000)], address1); // Policy 1
      simnet.callPublicFn("stacks-guard", "purchase-policy", [Cl.uint(1), Cl.uint(20000000), Cl.uint(3000)], address3); // Policy 2
      
      // Both submit claims
      simnet.callPublicFn("stacks-guard", "submit-claim", [Cl.uint(1), Cl.uint(20000000), Cl.stringAscii("Claim 1")], address1);
      simnet.callPublicFn("stacks-guard", "submit-claim", [Cl.uint(2), Cl.uint(15000000), Cl.stringAscii("Claim 2")], address3);
      
      // Vote on both claims
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(1), Cl.bool(true)], address2);
      simnet.callPublicFn("stacks-guard", "vote-on-claim", [Cl.uint(2), Cl.bool(false)], address2);
      
      // Process both claims
      simnet.mineEmptyBlocks(1009);
      const { result: claim1 } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(1)], address1);
      const { result: claim2 } = simnet.callPublicFn("stacks-guard", "process-claim", [Cl.uint(2)], address3);
      
      expect(claim1).toBeOk(Cl.stringAscii("approved"));
      expect(claim2).toBeOk(Cl.stringAscii("rejected"));
    });

    it("handles edge case scenarios", () => {
      // Test minimum values
      simnet.callPublicFn("stacks-guard", "create-insurance-pool", [
        Cl.stringAscii("Edge Case Pool"),
        Cl.stringAscii("Testing edge cases"),
        Cl.uint(1) // Minimum risk factor
      ], address1);
      
      simnet.callPublicFn("stacks-guard", "stake-in-pool", [Cl.uint(1), Cl.uint(MIN_STAKE)], address2);
      
      // Purchase policy with minimum values
      const { result } = simnet.callPublicFn("stacks-guard", "purchase-policy", [
        Cl.uint(1),
        Cl.uint(MIN_PREMIUM), // Minimum coverage
        Cl.uint(MIN_DURATION) // Minimum duration
      ], address1);
      
      expect(result).toBeOk(Cl.uint(1));
      
      // Verify policy is created correctly
      const { result: policyInfo } = simnet.callReadOnlyFn("stacks-guard", "get-policy-info", [Cl.uint(1)], address1);
      expect(policyInfo).toBeSome(
        Cl.tuple({
          holder: Cl.principal(address1),
          "pool-id": Cl.uint(1),
          "coverage-amount": Cl.uint(MIN_PREMIUM),
          "premium-paid": Cl.uint(expect.any(Number)),
          "start-block": Cl.uint(expect.any(Number)),
          "end-block": Cl.uint(expect.any(Number)),
          "is-active": Cl.bool(true),
          "claims-made": Cl.uint(0),
        })
      );
    });
  });
