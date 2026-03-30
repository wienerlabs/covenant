use anchor_lang::prelude::*;

#[account]
pub struct JobEscrow {
    pub poster: Pubkey,
    pub taker: Pubkey,
    pub amount: u64,
    pub spec_hash: [u8; 32],
    pub status: JobStatus,
    pub created_at: i64,
    pub deadline: i64,
    pub bump: u8,
}

impl JobEscrow {
    pub const LEN: usize = 8  // discriminator
        + 32  // poster
        + 32  // taker
        + 8   // amount
        + 32  // spec_hash
        + 1   // status
        + 8   // created_at
        + 8   // deadline
        + 1;  // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum JobStatus {
    Open,
    Accepted,
    Completed,
    Cancelled,
}

#[account]
pub struct AgentReputation {
    pub address: Pubkey,
    pub jobs_completed: u32,
    pub jobs_failed: u32,
    pub total_earned: u64,
    pub first_job_at: i64,
    pub bump: u8,
}

impl AgentReputation {
    pub const LEN: usize = 8  // discriminator
        + 32  // address
        + 4   // jobs_completed
        + 4   // jobs_failed
        + 8   // total_earned
        + 8   // first_job_at
        + 1;  // bump
}
