use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::create_job::*;
pub use instructions::accept_job::*;
pub use instructions::submit_completion::*;
pub use instructions::cancel_job::*;

declare_id!("9xRCMLZxk7ahcKJ8auFboQjuzp3XxfkYVKEmTDoAnU2E");

#[program]
pub mod covenant {
    use super::*;

    pub fn create_job(ctx: Context<CreateJob>, amount: u64, spec_hash: [u8; 32], deadline: i64) -> Result<()> {
        instructions::create_job::handler(ctx, amount, spec_hash, deadline)
    }

    pub fn accept_job(ctx: Context<AcceptJob>, spec_hash: [u8; 32]) -> Result<()> {
        instructions::accept_job::handler(ctx, spec_hash)
    }

    pub fn submit_completion(
        ctx: Context<SubmitCompletion>,
        proof: Vec<u8>,
        min_words: u32,
        text_hash: [u8; 32],
    ) -> Result<()> {
        instructions::submit_completion::handler(ctx, proof, min_words, text_hash)
    }

    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        instructions::cancel_job::handler(ctx)
    }
}
