;; StacksGuard: Decentralized Insurance Protocol

;; Contract constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_INVALID_AMOUNT (err u402))
(define-constant ERR_POLICY_NOT_FOUND (err u403))
(define-constant ERR_INSUFFICIENT_BALANCE (err u404))
(define-constant ERR_POLICY_EXPIRED (err u405))
(define-constant ERR_CLAIM_NOT_FOUND (err u406))
(define-constant ERR_CLAIM_ALREADY_PROCESSED (err u407))
(define-constant ERR_INSUFFICIENT_COVERAGE (err u408))
(define-constant ERR_INVALID_DURATION (err u409))
(define-constant ERR_POOL_NOT_FOUND (err u410))

;; Protocol configuration
(define-constant MIN_PREMIUM u1000000) ;; 1 STX minimum premium
(define-constant MAX_COVERAGE u1000000000000) ;; 1M STX max coverage
(define-constant MIN_DURATION u144) ;; ~1 day in blocks
(define-constant MAX_DURATION u52560) ;; ~1 year in blocks
(define-constant CLAIM_VOTING_PERIOD u1008) ;; ~1 week in blocks
(define-constant MIN_STAKE u10000000) ;; 10 STX minimum stake

;; Data structures
(define-map insurance-pools
    { pool-id: uint }
    {
        name: (string-ascii 50),
        description: (string-ascii 200),
        total-staked: uint,
        active-policies: uint,
        risk-factor: uint, ;; 1-100 scale
        created-at: uint,
        is-active: bool,
    }
)

(define-map policies
    { policy-id: uint }
    {
        holder: principal,
        pool-id: uint,
        coverage-amount: uint,
        premium-paid: uint,
        start-block: uint,
        end-block: uint,
        is-active: bool,
        claims-made: uint,
    }
)

(define-map claims
    { claim-id: uint }
    {
        policy-id: uint,
        claimant: principal,
        amount: uint,
        description: (string-ascii 500),
        submitted-at: uint,
        status: (string-ascii 20), ;; "pending", "approved", "rejected"
        votes-for: uint,
        votes-against: uint,
        voting-ends-at: uint,
    }
)

(define-map underwriter-stakes
    {
        underwriter: principal,
        pool-id: uint,
    }
    {
        staked-amount: uint,
        staked-at: uint,
        rewards-earned: uint,
        is-active: bool,
    }
)

(define-map claim-votes
    {
        claim-id: uint,
        voter: principal,
    }
    {
        vote: bool, ;; true = approve, false = reject
        voting-power: uint,
        voted-at: uint,
    }
)

;; Contract state variables
(define-data-var next-pool-id uint u1)
(define-data-var next-policy-id uint u1)
(define-data-var next-claim-id uint u1)
(define-data-var protocol-fee-rate uint u250) ;; 2.5% in basis points
(define-data-var total-protocol-fees uint u0)
(define-data-var contract-paused bool false)

;; Protocol treasury
(define-data-var protocol-treasury uint u0)
