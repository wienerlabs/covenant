use anchor_lang::prelude::*;

use crate::errors::CovError;
use crate::state::{JobEscrow, JobStatus};

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    /// CHECK: validated via PDA seeds and by matching job_escrow.poster
    #[account(
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<SubmitWork>,
    work_hash: [u8; 32],
    delivery_uri: String,
) -> Result<()> {
    let clock = Clock::get()?;
    let challenge_end = {
        let job = &ctx.accounts.job_escrow;
        require!(job.status == JobStatus::Accepted, CovError::InvalidStatus);
        require!(job.taker == ctx.accounts.taker.key(), CovError::Unauthorized);
        require!(
            clock.unix_timestamp < job.deadline,
            CovError::DeadlineExpired
        );
        clock
            .unix_timestamp
            .checked_add(job.challenge_period as i64)
            .ok_or_else(|| error!(CovError::MathOverflow))?
    };

    let job = &mut ctx.accounts.job_escrow;
    job.work_hash = work_hash;
    job.set_delivery_uri(&delivery_uri)?;
    job.delivered_at = clock.unix_timestamp;
    job.challenge_end = challenge_end;
    job.status = JobStatus::Delivered;

    msg!(
        "Work submitted: taker={}, work_hash={:?}, challenge_end={}",
        job.taker,
        work_hash,
        challenge_end
    );

    Ok(())
}
