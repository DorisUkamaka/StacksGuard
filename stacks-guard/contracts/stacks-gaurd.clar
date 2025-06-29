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

;; Helper functions
(define-private (calculate-premium
        (coverage-amount uint)
        (duration uint)
        (risk-factor uint)
    )
    (let (
            (base-rate (/ (* coverage-amount u100) u10000000)) ;; 1% base rate
            (risk-multiplier (+ u100 (* risk-factor u10)))
            (duration-multiplier (+ u100 (/ (* duration u50) u1000)))
        )
        (/ (* (* base-rate risk-multiplier) duration-multiplier) u10000)
    )
)

(define-private (is-policy-active (policy-id uint))
    (match (map-get? policies { policy-id: policy-id })
        policy (and (get is-active policy) (> (get end-block policy) stacks-block-height))
        false
    )
)

(define-private (calculate-voting-power (staked-amount uint))
    (/ staked-amount u1000000)
    ;; 1 vote per STX staked
)

;; Administrative functions
(define-public (pause-contract)
    (begin
        (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
        (var-set contract-paused true)
        (ok true)
    )
)

(define-public (unpause-contract)
    (begin
        (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
        (var-set contract-paused false)
        (ok true)
    )
)

(define-public (set-protocol-fee-rate (new-rate uint))
    (begin
        (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
        (asserts! (<= new-rate u1000) ERR_INVALID_AMOUNT) ;; Max 10%
        (var-set protocol-fee-rate new-rate)
        (ok true)
    )
)

;; Pool management functions
(define-public (create-insurance-pool
        (name (string-ascii 50))
        (description (string-ascii 200))
        (risk-factor uint)
    )
    (let ((pool-id (var-get next-pool-id)))
        (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
        (asserts! (<= risk-factor u100) ERR_INVALID_AMOUNT)
        (asserts! (> (len name) u0) ERR_INVALID_AMOUNT)
        (map-set insurance-pools { pool-id: pool-id } {
            name: name,
            description: description,
            total-staked: u0,
            active-policies: u0,
            risk-factor: risk-factor,
            created-at: stacks-block-height,
            is-active: true,
        })
        (var-set next-pool-id (+ pool-id u1))
        (ok pool-id)
    )
)

;; Policy management functions
(define-public (purchase-policy
        (pool-id uint)
        (coverage-amount uint)
        (duration uint)
    )
    (let (
            (policy-id (var-get next-policy-id))
            (pool (unwrap! (map-get? insurance-pools { pool-id: pool-id })
                ERR_POOL_NOT_FOUND
            ))
            (premium (calculate-premium coverage-amount duration (get risk-factor pool)))
            (protocol-fee (/ (* premium (var-get protocol-fee-rate)) u10000))
        )
        (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
        (asserts! (get is-active pool) ERR_POOL_NOT_FOUND)
        (asserts! (>= coverage-amount MIN_PREMIUM) ERR_INVALID_AMOUNT)
        (asserts! (<= coverage-amount MAX_COVERAGE) ERR_INVALID_AMOUNT)
        (asserts! (>= duration MIN_DURATION) ERR_INVALID_DURATION)
        (asserts! (<= duration MAX_DURATION) ERR_INVALID_DURATION)
        (asserts! (<= coverage-amount (get total-staked pool))
            ERR_INSUFFICIENT_COVERAGE
        )
        ;; Transfer premium from user to contract
        (try! (stx-transfer? (+ premium protocol-fee) tx-sender (as-contract tx-sender)))
        ;; Update protocol fees
        (var-set total-protocol-fees
            (+ (var-get total-protocol-fees) protocol-fee)
        )
        (var-set protocol-treasury (+ (var-get protocol-treasury) protocol-fee))
        ;; Create policy
        (map-set policies { policy-id: policy-id } {
            holder: tx-sender,
            pool-id: pool-id,
            coverage-amount: coverage-amount,
            premium-paid: premium,
            start-block: stacks-block-height,
            end-block: (+ stacks-block-height duration),
            is-active: true,
            claims-made: u0,
        })
        ;; Update pool stats
        (map-set insurance-pools { pool-id: pool-id }
            (merge pool { active-policies: (+ (get active-policies pool) u1) })
        )
        (var-set next-policy-id (+ policy-id u1))
        (ok policy-id)
    )
)

(define-public (stake-in-pool
        (pool-id uint)
        (amount uint)
    )
    (let (
            (existing-stake (default-to {
                staked-amount: u0,
                staked-at: u0,
                rewards-earned: u0,
                is-active: false,
            }
                (map-get? underwriter-stakes {
                    underwriter: tx-sender,
                    pool-id: pool-id,
                })
            ))
            (pool (unwrap! (map-get? insurance-pools { pool-id: pool-id })
                (err ERR_POOL_NOT_FOUND)
            ))
        )
        ;; Validate contract state and inputs
        (asserts! (not (var-get contract-paused)) (err ERR_UNAUTHORIZED))
        (asserts! (>= amount MIN_STAKE) (err ERR_INVALID_AMOUNT))
        ;; Transfer STX from user to contract
        (let ((transfer-result (stx-transfer? amount tx-sender (as-contract tx-sender))))
            (unwrap! transfer-result ERR_UNAUTHORIZED)
        )
        ;; Update pool total staked
        (map-set insurance-pools { pool-id: pool-id }
            (merge pool { total-staked: (+ (get total-staked pool) amount) })
        )
        ;; Update underwriter stake
        (map-set underwriter-stakes {
            underwriter: tx-sender,
            pool-id: pool-id,
        } {
            staked-amount: (+ (get staked-amount existing-stake) amount),
            staked-at: block-height,
            rewards-earned: (get rewards-earned existing-stake),
            is-active: true,
        })
        (ok true)
    )
)
