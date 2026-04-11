use anchor_lang::prelude::*;

use crate::errors::CovError;
use crate::state::{JobEscrow, JobStatus};

#[derive(Accounts)]
#[instruction(spec_hash: [u8; 32])]
pub struct AcceptJob<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"job", poster.key().as_ref(), &spec_hash],
        bump = job_escrow.bump,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    /// CHECK: validated via PDA seeds and by matching job_escrow.poster
    #[account(
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,
}

pub fn handler(ctx: Context<AcceptJob>, spec_hash: [u8; 32]) -> Result<()> {
    let job = &mut ctx.accounts.job_escrow;
    let clock = Clock::get()?;

    require!(job.status == JobStatus::Open, CovError::InvalidStatus);
    require!(job.spec_hash == spec_hash, CovError::SpecHashMismatch);
    require!(clock.unix_timestamp < job.deadline, CovError::DeadlineExpired);

    job.taker = ctx.accounts.taker.key();
    job.status = JobStatus::Accepted;

    msg!("Job accepted by taker={}", job.taker);

    Ok(())
}
