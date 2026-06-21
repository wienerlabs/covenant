use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::CovError;
use crate::state::{
    AgentReputation, ClaimListing, ClaimStatus, DisputeResolution, JobEscrow, JobStatus,
    ProtocolConfig,
};

/// Resolve a disputed job. Requires `config.threshold` approvals from
/// whitelisted arbitrators for the same resolution. Each call adds one
/// approval; when the threshold is reached the funds move and the job
/// transitions to Resolved.
///
/// The first arbitrator call establishes the pending `resolution` value
/// on-chain. Subsequent calls must pass the same `resolution`; a different
/// value returns ResolutionMismatch (to roll back, a new dispute would be
/// required — out of scope for v1).
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub arbitrator: Signer<'info>,

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

    /// CHECK: validated via seeds and job_escrow.poster
    #[account(
        mut,
        constraint = poster.key() == job_escrow.poster @ CovError::Unauthorized,
    )]
    pub poster: AccountInfo<'info>,

    /// Pinned to the canonical escrow PDA `[b"escrow_token", job_escrow]`
    /// that `create_job` derives, matching the bond account's seed
    /// constraint below — no attacker-supplied decoy can be substituted.
    #[account(
        mut,
        seeds = [b"escrow_token", job_escrow.key().as_ref()],
        bump,
        constraint = escrow_token_account.owner == job_escrow.key(),
        constraint = escrow_token_account.mint == job_escrow.token_mint @ CovError::MintMismatch,
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"bond", job_escrow.key().as_ref()],
        bump,
    )]
    pub bond_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = poster_token_account.owner == poster.key(),
        constraint = poster_token_account.mint == escrow_token_account.mint,
    )]
    pub poster_token_account: Box<Account<'info, TokenAccount>>,

    /// Payment beneficiary token account on the taker/buyer side.
    /// Owner validated in the handler against the routed destination
    /// (original taker for FavorPoster / no claim; claim buyer for
    /// FavorTaker or Split when a Bought listing exists).
    #[account(
        mut,
        constraint = taker_token_account.mint == escrow_token_account.mint @ CovError::MintMismatch,
    )]
    pub taker_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: must match job_escrow.taker; used only for rent reclamation
    #[account(
        mut,
        constraint = taker.key() == job_escrow.taker @ CovError::Unauthorized,
    )]
    pub taker: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = arbitrator,
        space = AgentReputation::LEN,
        seeds = [b"reputation", job_escrow.taker.as_ref()],
        bump,
    )]
    pub taker_reputation: Box<Account<'info, AgentReputation>>,

    /// CHECK: deterministic PDA at seeds=[b"claim", job_escrow.key()].
    /// May be uninitialized (lamports == 0) when no claim listing exists;
    /// handler reads and routes FavorTaker/Split payments to the buyer if
    /// a Bought listing is present.
    #[account(
        mut,
        seeds = [b"claim", job_escrow.key().as_ref()],
        bump,
    )]
    pub claim_listing: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ResolveDispute>, resolution: DisputeResolution) -> Result<()> {
    let clock = Clock::get()?;
    let signer_key = ctx.accounts.arbitrator.key();
    let threshold = ctx.accounts.config.threshold;

    // 1. Validate arbitrator + job state; add or validate approval.
    let (reached_threshold, poster_key, spec_hash, bump, amount, bond, final_resolution) = {
        let job = &mut ctx.accounts.job_escrow;
        require!(job.status == JobStatus::Disputed, CovError::InvalidStatus);
        require!(job.dispute.is_active(), CovError::NoActiveDispute);

        // Find arbitrator index (must be whitelisted)
        let arb_idx = ctx
            .accounts
            .config
            .arbitrators
            .iter()
            .position(|p| *p == signer_key && *p != Pubkey::default())
            .ok_or_else(|| error!(CovError::NotArbitrator))?;

        // Has this arbitrator already approved?
        require!(
            !job.dispute.has_approved(arb_idx),
            CovError::AlreadyApproved
        );

        // If a prior approval exists, require the same resolution value
        if job.dispute.approval_count > 0 {
            require!(
                job.dispute.resolution == resolution,
                CovError::ResolutionMismatch
            );
        } else {
            // First approver establishes the pending resolution
            job.dispute.resolution = resolution;
        }

        // Validate Split bounds if applicable
        if let DisputeResolution::Split { taker_amount } = resolution {
            require!(taker_amount <= job.amount, CovError::InvalidSplitAmount);
        }

        // Record approval in bitmask
        job.dispute.record_approval(arb_idx);

        let reached = job.dispute.approval_count >= threshold;
        (
            reached,
            job.poster,
            job.spec_hash,
            job.bump,
            job.amount,
            job.dispute.bond,
            resolution,
        )
    };

    if !reached_threshold {
        msg!(
            "Arbitrator {} approved resolution ({}/{}); awaiting more approvals",
            signer_key,
            ctx.accounts.job_escrow.dispute.approval_count,
            threshold
        );
        return Ok(());
    }

    // 2. Threshold reached — distribute escrow and bond per resolution.
    let seeds: &[&[u8]] = &[b"job", poster_key.as_ref(), spec_hash.as_ref(), &[bump]];
    let signer_seeds = &[seeds];

    let (escrow_to_taker, escrow_to_poster, bond_to_taker): (u64, u64, u64) = match final_resolution {
        DisputeResolution::Pending => {
            // Should not happen because resolution is set on first approval.
            return Err(error!(CovError::InvalidStatus));
        }
        DisputeResolution::FavorTaker => (amount, 0, bond),
        DisputeResolution::FavorPoster => (0, amount, 0),
        DisputeResolution::Split { taker_amount } => {
            let refund = amount
                .checked_sub(taker_amount)
                .ok_or_else(|| error!(CovError::MathOverflow))?;
            (taker_amount, refund, 0)
        }
    };

    // ---- Claim routing for the taker-side payout ----
    //
    // If a ClaimListing exists in Bought state and this resolution pays
    // the taker (FavorTaker or Split), the proceeds go to the BUYER's
    // ATA. FavorPoster means the buyer loses (priced into discount) —
    // nothing is re-routed. Bond on FavorTaker also goes to the buyer
    // since it's the economic continuation of the taker's position.
    let job_key = ctx.accounts.job_escrow.key();
    let mut pay_to_buyer: Option<Pubkey> = None;
    let mut settle_listing = false;

    if ctx.accounts.claim_listing.lamports() > 0 {
        require!(
            ctx.accounts.claim_listing.owner == ctx.program_id,
            CovError::ClaimListingMismatch,
        );
        let data = ctx.accounts.claim_listing.try_borrow_data()?;
        let listing = ClaimListing::try_deserialize(&mut &data[..])?;
        require!(listing.job == job_key, CovError::ClaimListingMismatch);
        if listing.status == ClaimStatus::Bought && escrow_to_taker > 0 {
            pay_to_buyer = Some(listing.buyer);
            settle_listing = true;
        }
    }

    // Enforce owner of the taker-side beneficiary ATA.
    if escrow_to_taker > 0 {
        let expected_owner = pay_to_buyer.unwrap_or(ctx.accounts.job_escrow.taker);
        require!(
            ctx.accounts.taker_token_account.owner == expected_owner,
            CovError::Unauthorized,
        );
    }

    // Transfer from escrow token account (main)
    if escrow_to_taker > 0 {
        let ctx_x = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.taker_token_account.to_account_info(),
                authority: ctx.accounts.job_escrow.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(ctx_x, escrow_to_taker)?;
    }
    if escrow_to_poster > 0 {
        let ctx_x = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.poster_token_account.to_account_info(),
                authority: ctx.accounts.job_escrow.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(ctx_x, escrow_to_poster)?;
    }

    // Distribute bond
    // FavorTaker  -> taker gets bond
    // FavorPoster -> poster gets bond back (full refund)
    // Split       -> poster gets bond back (challenger not fully wrong)
    if bond > 0 {
        let (bond_destination, bond_amount_move): (&AccountInfo, u64) = match final_resolution {
            DisputeResolution::FavorTaker => (
                &ctx.accounts.taker_token_account.to_account_info(),
                bond,
            ),
            _ => (&ctx.accounts.poster_token_account.to_account_info(), bond),
        };
        // `bond_to_taker` retained for log clarity but accounted via above.
        let _ = bond_to_taker;

        let ctx_x = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.bond_token_account.to_account_info(),
                to: bond_destination.clone(),
                authority: ctx.accounts.job_escrow.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(ctx_x, bond_amount_move)?;
    }

    // Close bond token account; rent refund to poster
    {
        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.bond_token_account.to_account_info(),
                destination: ctx.accounts.poster.to_account_info(),
                authority: ctx.accounts.job_escrow.to_account_info(),
            },
            signer_seeds,
        );
        token::close_account(close_ctx)?;
    }

    // Close escrow token account; rent refund to poster
    {
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
    }

    // 3. Update reputation
    {
        let reputation = &mut ctx.accounts.taker_reputation;
        let taker_key = ctx.accounts.taker.key();
        if reputation.address == Pubkey::default() {
            reputation.address = taker_key;
            reputation.bump = ctx.bumps.taker_reputation;
        }
        reputation.jobs_disputed = reputation
            .jobs_disputed
            .checked_add(1)
            .ok_or_else(|| error!(CovError::MathOverflow))?;
        match final_resolution {
            DisputeResolution::FavorTaker | DisputeResolution::Split { .. } => {
                reputation.jobs_completed = reputation
                    .jobs_completed
                    .checked_add(1)
                    .ok_or_else(|| error!(CovError::MathOverflow))?;
                reputation.total_earned = reputation
                    .total_earned
                    .checked_add(escrow_to_taker)
                    .ok_or_else(|| error!(CovError::MathOverflow))?;
            }
            DisputeResolution::FavorPoster => {
                reputation.jobs_failed = reputation
                    .jobs_failed
                    .checked_add(1)
                    .ok_or_else(|| error!(CovError::MathOverflow))?;
            }
            DisputeResolution::Pending => {}
        }
        if reputation.first_job_at == 0 {
            reputation.first_job_at = clock.unix_timestamp;
        }
    }

    // 4. If a claim listing routed the payout, mark it Settled so the
    //    on-chain audit trail reflects the resolution. Listings that were
    //    Bought but resolved FavorPoster remain in Bought state — the
    //    buyer's loss is visible forever as an unsettled listing.
    if settle_listing {
        let mut data = ctx.accounts.claim_listing.try_borrow_mut_data()?;
        let mut listing = ClaimListing::try_deserialize(&mut &data[..])?;
        listing.status = ClaimStatus::Settled;
        let mut cursor: &mut [u8] = &mut data[..];
        listing.try_serialize(&mut cursor)?;
    }

    // 5. Finalize status on the job account
    let job = &mut ctx.accounts.job_escrow;
    job.status = JobStatus::Resolved;
    job.dispute.resolved_at = clock.unix_timestamp;

    msg!(
        "Dispute resolved: resolution={:?}, escrow_to_taker={}, escrow_to_poster={}",
        final_resolution,
        escrow_to_taker,
        escrow_to_poster
    );

    Ok(())
}
