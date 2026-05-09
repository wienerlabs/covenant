use anchor_lang::prelude::*;

use crate::errors::CovError;
use crate::state::{ClaimListing, ClaimStatus};

/// Seller cancels an unsold listing. Once bought, a listing cannot be
/// cancelled — the buyer's rights are crystallized on chain.
///
/// Closing the account refunds rent to the seller.
#[derive(Accounts)]
pub struct CancelClaim<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"claim", claim_listing.job.as_ref()],
        bump = claim_listing.bump,
        close = seller,
        constraint = claim_listing.seller == seller.key() @ CovError::NotClaimSeller,
        constraint = claim_listing.status == ClaimStatus::Listed @ CovError::InvalidClaimStatus,
    )]
    pub claim_listing: Box<Account<'info, ClaimListing>>,
}

pub fn handler(ctx: Context<CancelClaim>) -> Result<()> {
    // Mark terminal status before close for clarity in log messages.
    let listing = &mut ctx.accounts.claim_listing;
    listing.status = ClaimStatus::Cancelled;

    msg!(
        "Claim cancelled: job={}, seller={}",
        listing.job,
        listing.seller,
    );

    Ok(())
}
