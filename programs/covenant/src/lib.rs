// NOTE: This file will be fully rewritten in Phase 2.
// Temporarily stubbed during Phase 1 cleanup to keep the build graph consistent
// after removing submit_completion / ZK.
use anchor_lang::prelude::*;

declare_id!("HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo");

#[program]
pub mod covenant {
    use super::*;

    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping<'info> {
    pub signer: Signer<'info>,
}
