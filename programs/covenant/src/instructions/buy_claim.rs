use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{ClaimListing, ClaimStatus, JobEscrow, JobStatus};

/// Buy a listed payment claim.
///
/// The buyer pays `listing.price` USDC to the seller NOW. In return, when
/// finalize_payment / resolve_dispute executes, the escrow proceeds are
/// routed to the buyer instead of the original taker.
///
/// The buyer bears dispute risk: if a dispute resolves FavorPoster, they
/// lose their principal. Market prices this into the listing price.
#[derive(Accounts)]
pub struct BuyClaim<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
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
        mut,
        seeds = [b"claim", job_escrow.key().as_ref()],
        bump = claim_listing.bump,
        constraint = claim_listing.job == job_escrow.key() @ CovError::ClaimListingMismatch,
        constraint = claim_listing.status == ClaimStatus::Listed @ CovError::InvalidClaimStatus,
    )]
    pub claim_listing: Box<Account<'info, ClaimListing>>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == job_escrow.token_mint @ CovError::MintMismatch,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = seller_token_account.owner == claim_listing.seller @ CovError::Unauthorized,
        constraint = seller_token_account.mint == job_escrow.token_mint @ CovError::MintMismatch,
    )]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<BuyClaim>) -> Result<()> {
    let clock = Clock::get()?;

    // Same wallet cannot be both seller and buyer — defeats the purpose.
    require!(
        ctx.accounts.buyer.key() != ctx.accounts.claim_listing.seller,
        CovError::BuyerIsSeller,
    );

    // The poster funds the escrow, so letting them buy the claim is
    // self-dealing: they would route the escrow payout back to themselves
    // and could then grief the taker via a dispute. Block it, mirroring the
    // buyer≠seller guard above.
    require!(
        ctx.accounts.buyer.key() != ctx.accounts.job_escrow.poster,
        CovError::Unauthorized,
    );

    let price = ctx.accounts.claim_listing.price;

    // 1. Transfer price from buyer → seller (atomic payment).
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, price)?;

    // 2. Record buyer + transition to Bought.
    let listing = &mut ctx.accounts.claim_listing;
    listing.buyer = ctx.accounts.buyer.key();
    listing.bought_at = clock.unix_timestamp;
    listing.status = ClaimStatus::Bought;

    msg!(
        "Claim bought: job={}, buyer={}, seller={}, price={}, face_value={}",
        listing.job,
        listing.buyer,
        listing.seller,
        listing.price,
        listing.face_value,
    );

    Ok(())
}
