use anchor_lang::prelude::*;

use crate::errors::CovError;
use crate::state::{ClaimListing, ClaimStatus, JobEscrow, JobStatus};

/// List a pending payment claim for sale at a discount.
///
/// Only the original taker of a Delivered, non-disputed job may list. The
/// listing creates a PDA at seeds = [b"claim", job_escrow.key()], which
/// means the same job can never host two simultaneous listings (init-time
/// PDA collision).
#[derive(Accounts)]
pub struct ListClaim<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
        constraint = job_escrow.taker == seller.key() @ CovError::Unauthorized,
        constraint = job_escrow.status == JobStatus::Delivered @ CovError::InvalidStatus,
        constraint = !job_escrow.has_active_dispute() @ CovError::DisputeAlreadyActive,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    /// CHECK: validated via seeds + job_escrow.poster
    #[account(
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,

    #[account(
        init,
        payer = seller,
        space = ClaimListing::LEN,
        seeds = [b"claim", job_escrow.key().as_ref()],
        bump,
    )]
    pub claim_listing: Box<Account<'info, ClaimListing>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ListClaim>, price: u64) -> Result<()> {
    let clock = Clock::get()?;

    let face_value = ctx.accounts.job_escrow.amount;

    // A listing with price >= face_value would never attract a rational
    // buyer (lender pays more than they will receive). 0 is also invalid.
    require!(price > 0 && price < face_value, CovError::InvalidClaimPrice);

    let listing = &mut ctx.accounts.claim_listing;
    listing.job = ctx.accounts.job_escrow.key();
    listing.seller = ctx.accounts.seller.key();
    listing.buyer = Pubkey::default();
    listing.price = price;
    listing.face_value = face_value;
    listing.listed_at = clock.unix_timestamp;
    listing.bought_at = 0;
    listing.status = ClaimStatus::Listed;
    listing.bump = ctx.bumps.claim_listing;

    msg!(
        "Claim listed: job={}, seller={}, price={}, face_value={}",
        listing.job,
        listing.seller,
        price,
        face_value,
    );

    Ok(())
}
