use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{AgentReputation, JobEscrow, JobStatus};

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
    pub job_escrow: Account<'info, JobEscrow>,

    /// CHECK: validated against job_escrow.poster
    #[account(
        mut,
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_token_account.owner == job_escrow.key(),
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster.key(),
        constraint = poster_token_account.mint == escrow_token_account.mint,
    )]
    pub poster_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = signer,
        space = AgentReputation::LEN,
        seeds = [b"reputation", job_escrow.taker.as_ref()],
        bump,
    )]
    pub taker_reputation: Account<'info, AgentReputation>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelJob>) -> Result<()> {
    let job = &ctx.accounts.job_escrow;
    let clock = Clock::get()?;

    // Determine which cancel path is valid
    let is_path_a = job.status == JobStatus::Open
        && ctx.accounts.signer.key() == job.poster;

    let is_path_b = job.status == JobStatus::Accepted
        && clock.unix_timestamp > job.deadline;

    if !is_path_a && !is_path_b {
        if job.status != JobStatus::Open && job.status != JobStatus::Accepted {
            return Err(error!(CovError::InvalidStatus));
        }
        if job.status == JobStatus::Open && ctx.accounts.signer.key() != job.poster {
            return Err(error!(CovError::Unauthorized));
        }
        if job.status == JobStatus::Accepted && clock.unix_timestamp <= job.deadline {
            return Err(error!(CovError::DeadlineNotExpired));
        }
    }

    // Build PDA signer seeds for escrow transfers
    let poster_key = ctx.accounts.poster.key();
    let spec_hash = job.spec_hash;
    let bump = job.bump;
    let seeds = &[
        b"job".as_ref(),
        poster_key.as_ref(),
        spec_hash.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // 1. Transfer escrow tokens back to poster
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

    // 2. Close escrow token account, return rent to poster
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

    // 3. PATH B: update taker reputation (jobs_failed++)
    if is_path_b {
        let reputation = &mut ctx.accounts.taker_reputation;
        if reputation.address == Pubkey::default() {
            reputation.address = job.taker;
            reputation.bump = ctx.bumps.taker_reputation;
        }
        reputation.jobs_failed += 1;
        if reputation.first_job_at == 0 {
            reputation.first_job_at = clock.unix_timestamp;
        }
    }

    // 4. Set status to Cancelled (Anchor's close = poster handles PDA closure)
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Cancelled;

    Ok(())
}
