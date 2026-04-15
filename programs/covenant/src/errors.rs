use anchor_lang::prelude::*;

#[error_code]
pub enum CovError {
    #[msg("Job is not in the required status for this operation")]
    InvalidStatus,
    #[msg("Job deadline has passed")]
    DeadlineExpired,
    #[msg("Job deadline has not passed yet")]
    DeadlineNotExpired,
    #[msg("Spec hash provided does not match committed hash")]
    SpecHashMismatch,
    #[msg("Signer is not authorized for this operation")]
    Unauthorized,
    #[msg("Payment amount must be greater than zero")]
    InvalidAmount,
    #[msg("Challenge period must be within protocol min/max bounds")]
    InvalidChallengePeriod,
    #[msg("Delivery URI exceeds maximum length")]
    DeliveryUriTooLong,
    #[msg("Challenge period has not expired yet")]
    ChallengePeriodNotExpired,
    #[msg("Challenge window has already closed")]
    DisputeWindowClosed,
    #[msg("Dispute is already active on this job")]
    DisputeAlreadyActive,
    #[msg("No dispute active for this job")]
    NoActiveDispute,
    #[msg("Insufficient dispute bond provided")]
    InsufficientBond,
    #[msg("Signer is not a whitelisted arbitrator")]
    NotArbitrator,
    #[msg("Arbitrator has already approved this resolution")]
    AlreadyApproved,
    #[msg("Dispute resolution requires approval from multiple arbitrators")]
    InsufficientApprovals,
    #[msg("Pending resolution does not match requested resolution")]
    ResolutionMismatch,
    #[msg("Split resolution amount exceeds escrow balance")]
    InvalidSplitAmount,
    #[msg("Protocol config already initialized")]
    ConfigAlreadyInitialized,
    #[msg("Protocol config not initialized")]
    ConfigNotInitialized,
    #[msg("Arbitrator threshold must be between 2 and ARBITRATOR_COUNT")]
    InvalidThreshold,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Token mint does not match the escrow's original mint")]
    MintMismatch,
}
