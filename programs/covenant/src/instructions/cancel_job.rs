use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{AgentReputation, JobEscrow, JobStatus};

/// Cancel a job and refund escrow.
///
/// Valid cancel paths:
///   A. Open   : poster may always cancel (nobody has accepted yet)
///   B. Accepted : anyone may cancel once `now > deadline` (taker missed
///       delivery); taker is marked as `jobs_failed++` for reputation.
///
/// Not valid from: Delivered / Disputed / Finalized / Resolved / Cancelled.
#[derive(Accounts)]
pub struct CancelJob<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
        close = poster,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    /// CHECK: validated against job_escrow.poster
    #[account(
        mut,
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_token_account.owner == job_escrow.key(),
        constraint = escrow_token_account.mint == job_escrow.token_mint @ CovError::MintMismatch,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster.key(),
        constraint = poster_token_account.mint == escrow_token_account.mint,
    )]
    pub poster_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = signer,
        space = AgentReputation::LEN,
        seeds = [b"reputation", job_escrow.taker.as_ref()],
        bump,
    )]
    pub taker_reputation: Box<Account<'info, AgentReputation>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelJob>) -> Result<()> {
    let clock = Clock::get()?;

    let (path_a, path_b) = {
        let job = &ctx.accounts.job_escrow;

        let path_a = job.status == JobStatus::Open
            && ctx.accounts.signer.key() == job.poster;

        let path_b = job.status == JobStatus::Accepted
            && clock.unix_timestamp > job.deadline
            && (ctx.accounts.signer.key() == job.poster
                || ctx.accounts.signer.key() == job.taker);

        if !path_a && !path_b {
            // Produce specific errors for better UX
            match job.status {
                JobStatus::Open => return Err(error!(CovError::Unauthorized)),
                JobStatus::Accepted => return Err(error!(CovError::DeadlineNotExpired)),
                _ => return Err(error!(CovError::InvalidStatus)),
            }
        }

        (path_a, path_b)
    };

    // Build PDA signer seeds
    let job = &ctx.accounts.job_escrow;
    let poster_key = ctx.accounts.poster.key();
    let spec_hash = job.spec_hash;
    let bump = job.bump;
    let seeds: &[&[u8]] = &[b"job", poster_key.as_ref(), spec_hash.as_ref(), &[bump]];
    let signer_seeds = &[seeds];

    // 1. Transfer escrow balance back to poster
    let escrow_balance = ctx.accounts.escrow_token_account.amount;
    if escrow_balance > 0 {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.poster_token_account.to_account_info(),
                authority: ctx.accounts.job_escrow.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, escrow_balance)?;
    }

    // 2. Close escrow token account, rent refund to poster
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_token_account.to_account_info(),
            destination: ctx.accounts.poster.to_account_info(),
            authority: ctx.accounts.job_escrow.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;

    // 3. Path B: mark taker as failed
    if path_b {
        let reputation = &mut ctx.accounts.taker_reputation;
        if reputation.address == Pubkey::default() {
            reputation.address = ctx.accounts.job_escrow.taker;
            reputation.bump = ctx.bumps.taker_reputation;
        }
        reputation.jobs_failed = reputation
            .jobs_failed
            .checked_add(1)
            .ok_or_else(|| error!(CovError::MathOverflow))?;
        if reputation.first_job_at == 0 {
            reputation.first_job_at = clock.unix_timestamp;
        }
    }

    // 4. Mark job cancelled (account is being closed via `close = poster`)
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Cancelled;

    msg!(
        "Job cancelled: path_a={}, path_b={}, signer={}",
        path_a,
        path_b,
        ctx.accounts.signer.key()
    );

    Ok(())
}
