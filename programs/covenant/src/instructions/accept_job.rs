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
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
    )]
    pub job_escrow: Account<'info, JobEscrow>,

    /// CHECK: poster pubkey used only as PDA seed, validated by seeds constraint
    pub poster: AccountInfo<'info>,
}

pub fn handler(ctx: Context<AcceptJob>, spec_hash: [u8; 32]) -> Result<()> {
    let job = &mut ctx.accounts.job_escrow;

    require!(job.status == JobStatus::Open, CovError::InvalidStatus);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < job.deadline, CovError::DeadlineExpired);

    require!(spec_hash == job.spec_hash, CovError::SpecHashMismatch);

    job.taker = ctx.accounts.taker.key();
    job.status = JobStatus::Accepted;

    Ok(())
}
