use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{AgentReputation, JobEscrow, JobStatus};

/// Permissionless: anyone can call finalize_payment once the challenge
/// period has expired and no dispute is active. This ensures the protocol
/// always makes progress even if neither party is online to push the button.
#[derive(Accounts)]
pub struct FinalizePayment<'info> {
    #[account(mut)]
    pub crank: Signer<'info>,

    #[account(
        mut,
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
        close = poster,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    /// CHECK: validated via PDA seeds and by matching job_escrow.poster
    #[account(
        mut,
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_token_account.owner == job_escrow.key(),
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = taker_token_account.owner == job_escrow.taker @ CovError::Unauthorized,
        constraint = taker_token_account.mint == escrow_token_account.mint,
    )]
    pub taker_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: used as destination for rent reclamation when closing the
    /// escrow token account; must match job.taker
    #[account(
        mut,
        constraint = taker.key() == job_escrow.taker @ CovError::Unauthorized,
    )]
    pub taker: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = crank,
        space = AgentReputation::LEN,
        seeds = [b"reputation", job_escrow.taker.as_ref()],
        bump,
    )]
    pub taker_reputation: Box<Account<'info, AgentReputation>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FinalizePayment>) -> Result<()> {
    let clock = Clock::get()?;

    // Capture values needed for signing before we take a mutable borrow below.
    let (poster_key, spec_hash, bump, amount) = {
        let job = &ctx.accounts.job_escrow;
        require!(job.status == JobStatus::Delivered, CovError::InvalidStatus);
        require!(!job.has_active_dispute(), CovError::DisputeAlreadyActive);
        require!(
            clock.unix_timestamp >= job.challenge_end,
            CovError::ChallengePeriodNotExpired
        );
        (job.poster, job.spec_hash, job.bump, job.amount)
    };

    let seeds: &[&[u8]] = &[b"job", poster_key.as_ref(), spec_hash.as_ref(), &[bump]];
    let signer_seeds = &[seeds];

    // 1. Transfer full escrow to taker
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.taker_token_account.to_account_info(),
            authority: ctx.accounts.job_escrow.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

    // 2. Close escrow token account, rent returned to taker
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_token_account.to_account_info(),
            destination: ctx.accounts.taker.to_account_info(),
            authority: ctx.accounts.job_escrow.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;

    // 3. Update taker reputation
    {
        let reputation = &mut ctx.accounts.taker_reputation;
        let taker_key = ctx.accounts.taker.key();
        if reputation.address == Pubkey::default() {
            reputation.address = taker_key;
            reputation.bump = ctx.bumps.taker_reputation;
        }
        reputation.jobs_completed = reputation
            .jobs_completed
            .checked_add(1)
            .ok_or_else(|| error!(CovError::MathOverflow))?;
        reputation.total_earned = reputation
            .total_earned
            .checked_add(amount)
            .ok_or_else(|| error!(CovError::MathOverflow))?;
        if reputation.first_job_at == 0 {
            reputation.first_job_at = clock.unix_timestamp;
        }
    }

    // 4. Mark terminal status (PDA is closed to poster via `close =` on the account constraint)
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Finalized;

    msg!(
        "Payment finalized: taker={}, amount={}, crank={}",
        job.taker,
        amount,
        ctx.accounts.crank.key()
    );

    Ok(())
}
