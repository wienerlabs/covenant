use anchor_lang::prelude::*;

use crate::errors::CovError;
use crate::state::{ProtocolConfig, ARBITRATOR_COUNT};

#[derive(Accounts)]
pub struct UpdateArbitrators<'info> {
    #[account(
        constraint = admin.key() == config.admin @ CovError::Unauthorized,
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,
}

pub fn handler(
    ctx: Context<UpdateArbitrators>,
    arbitrators: [Pubkey; ARBITRATOR_COUNT],
    threshold: u8,
) -> Result<()> {
    require!(
        threshold >= 1 && (threshold as usize) <= ARBITRATOR_COUNT,
        CovError::InvalidThreshold
    );

    let config = &mut ctx.accounts.config;
    config.arbitrators = arbitrators;
    config.threshold = threshold;

    msg!("Arbitrators rotated; new threshold = {}", threshold);

    Ok(())
}
