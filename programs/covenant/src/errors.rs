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
    #[msg("Proof verification failed")]
    InvalidProof,
    #[msg("Signer is not authorized for this operation")]
    Unauthorized,
    #[msg("Payment amount must be greater than zero")]
    InvalidAmount,
}
