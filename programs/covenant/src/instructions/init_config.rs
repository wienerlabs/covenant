use anchor_lang::prelude::*;

use crate::errors::CovError;
use crate::state::{ProtocolConfig, ARBITRATOR_COUNT};

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::LEN,
        seeds = [b"config"],
        bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// The Covenant program itself. `programdata_address()?` ties it to the
    /// `program_data` account below so neither can be spoofed.
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ CovError::Unauthorized,
    )]
    pub program: Program<'info, crate::program::Covenant>,

    /// The program's ProgramData account. Only the program's upgrade
    /// authority (the deployer) may initialize the protocol config. Without
    /// this, `init_config` is first-call-wins on a fresh deployment: anyone
    /// could front-run the operator, seize `admin`, and install their own
    /// arbitrator multisig — handing themselves every disputed escrow + bond.
    #[account(
        constraint = program_data.upgrade_authority_address == Some(admin.key())
            @ CovError::Unauthorized,
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitConfig>,
    arbitrators: [Pubkey; ARBITRATOR_COUNT],
    threshold: u8,
    min_challenge_period: u64,
    max_challenge_period: u64,
    min_bond_bps: u16,
    min_bond_absolute: u64,
) -> Result<()> {
    require!(
        threshold >= 2 && (threshold as usize) <= ARBITRATOR_COUNT,
        CovError::InvalidThreshold
    );
    require!(
        min_challenge_period > 0 && min_challenge_period <= max_challenge_period,
        CovError::InvalidChallengePeriod
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.arbitrators = arbitrators;
    config.threshold = threshold;
    config.min_challenge_period = min_challenge_period;
    config.max_challenge_period = max_challenge_period;
    config.min_bond_bps = min_bond_bps;
    config.min_bond_absolute = min_bond_absolute;
    config.bump = ctx.bumps.config;

    msg!(
        "Covenant config initialized: admin={}, threshold={}, challenge_period=[{},{}]",
        config.admin,
        threshold,
        min_challenge_period,
        max_challenge_period
    );

    Ok(())
}
