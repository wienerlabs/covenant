use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{AgentReputation, JobEscrow, JobStatus};

/// The SP1 program vkey hash for the word-count circuit.
/// This is derived from `vk.bytes32()` on the compiled SP1 program's verification key.
/// Must be updated when the circuit is recompiled.
pub const WORD_COUNT_VKEY_HASH: &str =
    "0x002b54c2ee0f83205f876710bd9bc4cabf71fb0a73d872fb8769dea99e133b9f";

#[derive(Accounts)]
pub struct SubmitCompletion<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"job", poster.key().as_ref(), &job_escrow.spec_hash],
        bump = job_escrow.bump,
        close = poster,
    )]
    pub job_escrow: Account<'info, JobEscrow>,

    /// CHECK: poster pubkey used only as PDA seed, validated by seeds constraint
    #[account(mut)]
    pub poster: AccountInfo<'info>,

    #[account(
        mut,
        constraint = escrow_token_account.owner == job_escrow.key(),
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = taker_token_account.owner == taker.key(),
        constraint = taker_token_account.mint == escrow_token_account.mint,
    )]
    pub taker_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        space = AgentReputation::LEN,
        seeds = [b"reputation", taker.key().as_ref()],
        bump,
    )]
    pub taker_reputation: Account<'info, AgentReputation>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SubmitCompletion>,
    proof: Vec<u8>,
    min_words: u32,
    text_hash: [u8; 32],
) -> Result<()> {
    let job = &ctx.accounts.job_escrow;

    // 1. Assert job is Accepted
    require!(job.status == JobStatus::Accepted, CovError::InvalidStatus);

    // 2. Assert caller is the assigned taker
    require!(job.taker == ctx.accounts.taker.key(), CovError::Unauthorized);

    // 3. Verify the ZK proof
    let mut sp1_public_inputs = Vec::with_capacity(36);
    sp1_public_inputs.extend_from_slice(&min_words.to_le_bytes());
    sp1_public_inputs.extend_from_slice(&text_hash);

    sp1_solana::verify_proof(
        &proof,
        &sp1_public_inputs,
        WORD_COUNT_VKEY_HASH,
        sp1_solana::GROTH16_VK_5_0_0_BYTES,
    )
    .map_err(|_| error!(CovError::InvalidProof))?;

    // 4. Transfer escrowed tokens to taker
    let poster_key = ctx.accounts.poster.key();
    let spec_hash = job.spec_hash;
    let bump = job.bump;
    let amount = job.amount;
    let seeds = &[
        b"job".as_ref(),
        poster_key.as_ref(),
        spec_hash.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];

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

    // 5. Close escrow token account, return rent to taker
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

    // 6. Update taker reputation
    let clock = Clock::get()?;
    let reputation = &mut ctx.accounts.taker_reputation;
    if reputation.address == Pubkey::default() {
        reputation.address = ctx.accounts.taker.key();
        reputation.bump = ctx.bumps.taker_reputation;
    }
    reputation.jobs_completed += 1;
    reputation.total_earned += amount;
    if reputation.first_job_at == 0 {
        reputation.first_job_at = clock.unix_timestamp;
    }

    // 7. Update job status (Anchor's close = poster handles PDA closure)
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Completed;

    Ok(())
}
