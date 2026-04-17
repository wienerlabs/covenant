use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{DisputeInfo, DisputeResolution, JobEscrow, JobStatus, ProtocolConfig};

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(mut)]
    pub poster: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    /// Bond escrow token account. Separate from the job escrow token account so
    /// we can release bond without affecting the main escrow on resolution.
    #[account(
        init,
        payer = poster,
        token::mint = token_mint,
        token::authority = job_escrow,
        seeds = [b"bond", job_escrow.key().as_ref()],
        bump,
    )]
    pub bond_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster.key(),
        constraint = poster_token_account.mint == token_mint.key(),
    )]
    pub poster_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        constraint = token_mint.key() == job_escrow.token_mint @ CovError::MintMismatch,
    )]
    pub token_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<RaiseDispute>,
    reason_hash: [u8; 32],
    bond: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.config;

    // Compute minimum bond required
    let pct_bond = (ctx.accounts.job_escrow.amount as u128)
        .checked_mul(config.min_bond_bps as u128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or_else(|| error!(CovError::MathOverflow))? as u64;
    let min_bond = pct_bond.max(config.min_bond_absolute);

    {
        let job = &ctx.accounts.job_escrow;
        require!(job.status == JobStatus::Delivered, CovError::InvalidStatus);
        require!(!job.has_active_dispute(), CovError::DisputeAlreadyActive);
        require!(ctx.accounts.poster.key() == job.poster, CovError::Unauthorized);
        require!(
            clock.unix_timestamp < job.challenge_end,
            CovError::DisputeWindowClosed
        );
        require!(bond >= min_bond, CovError::InsufficientBond);
    }

    // Transfer bond from poster to bond escrow
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.poster_token_account.to_account_info(),
            to: ctx.accounts.bond_token_account.to_account_info(),
            authority: ctx.accounts.poster.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, bond)?;

    // Update job state
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Disputed;
    job.dispute = DisputeInfo {
        challenger: ctx.accounts.poster.key(),
        bond,
        reason_hash,
        raised_at: clock.unix_timestamp,
        resolved_at: 0,
        resolution: DisputeResolution::Pending,
        approval_mask: 0,
        approval_count: 0,
    };

    msg!(
        "Dispute raised: challenger={}, bond={}, reason_hash={:?}",
        job.dispute.challenger,
        bond,
        reason_hash
    );

    Ok(())
}
