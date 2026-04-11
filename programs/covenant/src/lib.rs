//! Covenant — open settlement protocol for AI agents.
//!
//! Optimistic escrow on Solana. Posters lock USDC, takers (agents) deliver
//! work commitments, the challenge period runs, and payment auto-releases
//! unless the poster raises a bonded dispute. Disputes are resolved by a
//! whitelisted arbitrator multisig.
//!
//! State machine:
//!   Open -> Accepted -> Delivered -> (Finalized | Disputed -> Resolved)
//!   Open/Accepted(past deadline) -> Cancelled

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{ARBITRATOR_COUNT, DisputeResolution};

declare_id!("HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo");

#[program]
pub mod covenant {
    use super::*;

    // ---- Protocol config ----

    pub fn init_config(
        ctx: Context<InitConfig>,
        arbitrators: [Pubkey; ARBITRATOR_COUNT],
        threshold: u8,
        min_challenge_period: u64,
        max_challenge_period: u64,
        min_bond_bps: u16,
        min_bond_absolute: u64,
    ) -> Result<()> {
        init_config::handler(
            ctx,
            arbitrators,
            threshold,
            min_challenge_period,
            max_challenge_period,
            min_bond_bps,
            min_bond_absolute,
        )
    }

    pub fn update_arbitrators(
        ctx: Context<UpdateArbitrators>,
        arbitrators: [Pubkey; ARBITRATOR_COUNT],
        threshold: u8,
    ) -> Result<()> {
        update_arbitrators::handler(ctx, arbitrators, threshold)
    }

    // ---- Job lifecycle ----

    pub fn create_job(
        ctx: Context<CreateJob>,
        amount: u64,
        spec_hash: [u8; 32],
        deadline: i64,
        challenge_period: u64,
    ) -> Result<()> {
        create_job::handler(ctx, amount, spec_hash, deadline, challenge_period)
    }

    pub fn accept_job(ctx: Context<AcceptJob>, spec_hash: [u8; 32]) -> Result<()> {
        accept_job::handler(ctx, spec_hash)
    }

    pub fn submit_work(
        ctx: Context<SubmitWork>,
        work_hash: [u8; 32],
        delivery_uri: String,
    ) -> Result<()> {
        submit_work::handler(ctx, work_hash, delivery_uri)
    }

    pub fn finalize_payment(ctx: Context<FinalizePayment>) -> Result<()> {
        finalize_payment::handler(ctx)
    }

    // ---- Disputes ----

    pub fn raise_dispute(
        ctx: Context<RaiseDispute>,
        reason_hash: [u8; 32],
        bond: u64,
    ) -> Result<()> {
        raise_dispute::handler(ctx, reason_hash, bond)
    }

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolution: DisputeResolution,
    ) -> Result<()> {
        resolve_dispute::handler(ctx, resolution)
    }

    // ---- Cancellation ----

    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        cancel_job::handler(ctx)
    }
}
