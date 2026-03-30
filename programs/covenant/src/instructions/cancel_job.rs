use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelJob<'info> {
    #[account(mut)]
    pub poster: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<CancelJob>) -> Result<()> {
    // TODO: Implement cancel job logic
    Ok(())
}
