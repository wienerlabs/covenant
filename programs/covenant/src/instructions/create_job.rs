use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{JobEscrow, JobStatus, ProtocolConfig, DisputeInfo};

#[derive(Accounts)]
#[instruction(amount: u64, spec_hash: [u8; 32], deadline: i64, challenge_period: u64)]
pub struct CreateJob<'info> {
    #[account(mut)]
    pub poster: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = poster,
        space = JobEscrow::LEN,
        seeds = [b"job", poster.key().as_ref(), &spec_hash],
        bump,
    )]
    pub job_escrow: Box<Account<'info, JobEscrow>>,

    #[account(
        init,
        payer = poster,
        token::mint = token_mint,
        token::authority = job_escrow,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster.key(),
        constraint = poster_token_account.mint == token_mint.key(),
    )]
    pub poster_token_account: Box<Account<'info, TokenAccount>>,

    pub token_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateJob>,
    amount: u64,
    spec_hash: [u8; 32],
    deadline: i64,
    challenge_period: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.config;

    require!(amount > 0, CovError::InvalidAmount);
    require!(deadline > clock.unix_timestamp, CovError::DeadlineExpired);
    require!(
        challenge_period >= config.min_challenge_period
            && challenge_period <= config.max_challenge_period,
        CovError::InvalidChallengePeriod
    );

    // Transfer tokens from poster to escrow token account
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.poster_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.poster.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    let job = &mut ctx.accounts.job_escrow;
    job.poster = ctx.accounts.poster.key();
    job.taker = Pubkey::default();
    job.token_mint = ctx.accounts.token_mint.key();
    job.amount = amount;
    job.spec_hash = spec_hash;
    job.status = JobStatus::Open;
    job.created_at = clock.unix_timestamp;
    job.deadline = deadline;
    job.challenge_period = challenge_period;
    job.challenge_end = 0;
    job.delivered_at = 0;
    job.work_hash = [0u8; 32];
    job.delivery_uri = [0u8; crate::state::DELIVERY_URI_MAX_LEN];
    job.delivery_uri_len = 0;
    job.dispute = DisputeInfo::default();
    job.bump = ctx.bumps.job_escrow;

    msg!(
        "Job created: poster={}, amount={}, challenge_period={}s",
        job.poster,
        amount,
        challenge_period
    );

    Ok(())
}
