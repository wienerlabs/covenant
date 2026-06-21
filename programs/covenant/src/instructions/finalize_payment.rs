use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{AgentReputation, ClaimListing, ClaimStatus, JobEscrow, JobStatus};

/// Permissionless: anyone can call finalize_payment once the challenge
/// period has expired and no dispute is active.
///
/// ## Payment routing (Covenant Credit)
///
/// The ClaimListing PDA is ALWAYS passed as an account — its address is
/// deterministic (`seeds = [b"claim", job_escrow.key()]`) so the crank
/// cannot omit it to hide a sold claim. We distinguish:
///   - lamports == 0 (account uninitialized): no listing, pay taker
///   - lamports > 0 + status == Bought: pay buyer, mark Settled
///   - lamports > 0 + status == Listed / Cancelled / Settled: pay taker
///
/// This closes the grief vector where a seller-crank could bypass their
/// own sale by silently "forgetting" to pass the listing.
///
/// The `taker_token_account` parameter is the payment beneficiary ATA —
/// its owner must match whoever the chain routes payment to. Reputation
/// credit always goes to the original taker.
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

    /// Pinned to the canonical escrow PDA `[b"escrow_token", job_escrow]`
    /// that `create_job` derives, so no attacker-supplied decoy token
    /// account can be substituted for the real escrow.
    #[account(
        mut,
        seeds = [b"escrow_token", job_escrow.key().as_ref()],
        bump,
        constraint = escrow_token_account.owner == job_escrow.key(),
        constraint = escrow_token_account.mint == job_escrow.token_mint @ CovError::MintMismatch,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    /// Payment beneficiary token account.
    /// Owner is validated in the handler against the routed destination.
    #[account(
        mut,
        constraint = taker_token_account.mint == escrow_token_account.mint @ CovError::MintMismatch,
    )]
    pub taker_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: used as destination for rent reclamation when closing the
    /// escrow token account; must match job.taker.
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

    /// CHECK: deterministic PDA at seeds=[b"claim", job_escrow.key()].
    /// May be uninitialized (lamports == 0) → no listing; handler reads
    /// and routes payment accordingly.
    #[account(
        mut,
        seeds = [b"claim", job_escrow.key().as_ref()],
        bump,
    )]
    pub claim_listing: UncheckedAccount<'info>,

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

    // ---- Claim routing ----
    let job_key = ctx.accounts.job_escrow.key();
    let mut pay_to_buyer: Option<Pubkey> = None;
    let mut settle_listing = false;

    if ctx.accounts.claim_listing.lamports() > 0 {
        // Listing exists. Owner must be this program (Anchor's seeds+bump
        // on UncheckedAccount already verified the address).
        require!(
            ctx.accounts.claim_listing.owner == ctx.program_id,
            CovError::ClaimListingMismatch,
        );
        let data = ctx.accounts.claim_listing.try_borrow_data()?;
        let listing = ClaimListing::try_deserialize(&mut &data[..])?;
        require!(listing.job == job_key, CovError::ClaimListingMismatch);
        match listing.status {
            ClaimStatus::Bought => {
                pay_to_buyer = Some(listing.buyer);
                settle_listing = true;
            }
            ClaimStatus::Listed | ClaimStatus::Cancelled | ClaimStatus::Settled => {
                // No payment re-routing for these states.
            }
        }
    }

    // Enforce beneficiary owner matches the routed destination.
    let expected_owner = pay_to_buyer.unwrap_or(ctx.accounts.job_escrow.taker);
    require!(
        ctx.accounts.taker_token_account.owner == expected_owner,
        CovError::Unauthorized,
    );

    let seeds: &[&[u8]] = &[b"job", poster_key.as_ref(), spec_hash.as_ref(), &[bump]];
    let signer_seeds = &[seeds];

    // 1. Transfer full escrow to the beneficiary.
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

    // 2. Close escrow token account; SPL rent refund to the poster, who
    //    funded the account's rent in create_job (init, payer = poster).
    //    This matches cancel_job and resolve_dispute, which also refund the
    //    escrow-account rent to the poster.
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

    // 3. Update taker reputation (original worker, regardless of claim sale).
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

    // 4. If a ClaimListing routed the payment, mark it Settled on chain.
    //    Account is left open (rent refund can be reclaimed by a future
    //    cleanup instruction) so the settlement trail remains visible.
    if settle_listing {
        let mut data = ctx.accounts.claim_listing.try_borrow_mut_data()?;
        let mut listing = ClaimListing::try_deserialize(&mut &data[..])?;
        listing.status = ClaimStatus::Settled;
        let mut cursor: &mut [u8] = &mut data[..];
        listing.try_serialize(&mut cursor)?;
    }

    // 5. Mark terminal status on the job (PDA closes to poster via
    //    `close =` on the account constraint above).
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Finalized;

    let recipient = ctx.accounts.taker_token_account.owner;
    msg!(
        "Payment finalized: recipient={}, taker={}, amount={}, crank={}, claim_routed={}",
        recipient,
        job.taker,
        amount,
        ctx.accounts.crank.key(),
        pay_to_buyer.is_some(),
    );

    Ok(())
}
