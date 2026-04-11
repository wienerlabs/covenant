use anchor_lang::prelude::*;

/// Maximum length of a delivery URI (IPFS / Arweave / HTTPS).
/// 128 bytes is enough for:
///   - IPFS v1 CIDs (`bafy...` base32, ~60 chars) with a gateway prefix
///   - Arweave TX IDs (`arweave.net/<43 chars>` = 56 chars)
///   - Most Vercel Blob URLs (subdomain + 24-char blob key + extension)
/// Shorter than 200 to keep the `try_accounts` stack frame under
/// Solana's 4KB BPF stack limit.
pub const DELIVERY_URI_MAX_LEN: usize = 128;

/// Number of arbitrator slots in the v1 multisig.
pub const ARBITRATOR_COUNT: usize = 3;

/// Protocol-level configuration. Singleton PDA at seeds = [b"config"].
#[account]
pub struct ProtocolConfig {
    /// Admin pubkey; can rotate arbitrators and tune parameters.
    pub admin: Pubkey,
    /// Whitelisted arbitrator pubkeys (2-of-3 required to resolve a dispute).
    pub arbitrators: [Pubkey; ARBITRATOR_COUNT],
    /// Number of arbitrator approvals required (hard-coded to 2 in v1).
    pub threshold: u8,
    /// Minimum challenge period any job can specify (seconds).
    pub min_challenge_period: u64,
    /// Maximum challenge period any job can specify (seconds).
    pub max_challenge_period: u64,
    /// Dispute bond in basis points of the escrow amount (e.g. 1000 = 10%).
    pub min_bond_bps: u16,
    /// Absolute minimum dispute bond in token atomic units
    /// (e.g. 1_000_000 = 1 USDC). The effective bond is
    /// max(bond_bps * amount / 10_000, min_bond_absolute).
    pub min_bond_absolute: u64,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize =
        8 +                                          // discriminator
        32 +                                         // admin
        32 * ARBITRATOR_COUNT +                      // arbitrators
        1 +                                          // threshold
        8 +                                          // min_challenge_period
        8 +                                          // max_challenge_period
        2 +                                          // min_bond_bps
        8 +                                          // min_bond_absolute
        1;                                           // bump
}

/// Per-job escrow account. PDA seeds = [b"job", poster, spec_hash].
#[account]
pub struct JobEscrow {
    pub poster: Pubkey,
    /// Pubkey::default() until accepted.
    pub taker: Pubkey,
    /// Escrow amount in token atomic units.
    pub amount: u64,
    /// SHA-256 of the off-chain job spec JSON.
    pub spec_hash: [u8; 32],
    pub status: JobStatus,
    pub created_at: i64,
    /// Absolute deadline by which taker must deliver.
    pub deadline: i64,
    /// Challenge period in seconds (set at creation, validated against config).
    pub challenge_period: u64,
    /// Unix timestamp after which `finalize_payment` may be called.
    /// Set in submit_work; zero until then.
    pub challenge_end: i64,
    /// When submit_work was called. Zero until then.
    pub delivered_at: i64,
    /// SHA-256 of the delivered content. All zeros until delivered.
    pub work_hash: [u8; 32],
    /// Delivery URI bytes (fixed-size buffer; actual length in delivery_uri_len).
    pub delivery_uri: [u8; DELIVERY_URI_MAX_LEN],
    pub delivery_uri_len: u8,
    /// Dispute information; set when raise_dispute is called.
    pub dispute: DisputeInfo,
    pub bump: u8,
}

impl JobEscrow {
    pub const LEN: usize =
        8 +                                          // discriminator
        32 +                                         // poster
        32 +                                         // taker
        8 +                                          // amount
        32 +                                         // spec_hash
        1 + 1 +                                      // status (enum tag + max variant size)
        8 +                                          // created_at
        8 +                                          // deadline
        8 +                                          // challenge_period
        8 +                                          // challenge_end
        8 +                                          // delivered_at
        32 +                                         // work_hash
        DELIVERY_URI_MAX_LEN +                       // delivery_uri
        1 +                                          // delivery_uri_len
        DisputeInfo::LEN +                           // dispute
        1;                                           // bump

    pub fn set_delivery_uri(&mut self, uri: &str) -> Result<()> {
        let bytes = uri.as_bytes();
        require!(
            bytes.len() <= DELIVERY_URI_MAX_LEN,
            crate::errors::CovError::DeliveryUriTooLong
        );
        self.delivery_uri = [0u8; DELIVERY_URI_MAX_LEN];
        self.delivery_uri[..bytes.len()].copy_from_slice(bytes);
        self.delivery_uri_len = bytes.len() as u8;
        Ok(())
    }

    pub fn has_active_dispute(&self) -> bool {
        self.dispute.is_active()
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum JobStatus {
    Open,
    Accepted,
    Delivered,
    Disputed,
    Finalized,
    Resolved,
    Cancelled,
}

/// Dispute state embedded inside a JobEscrow.
///
/// We use a fixed-size inline struct rather than Option<Dispute> to keep
/// the Anchor account layout predictable. `raised_at == 0` means no
/// active dispute.
///
/// Approvals are stored as a bitmask over `ProtocolConfig.arbitrators`
/// instead of a `[Pubkey; N]` array to keep the account size under
/// Solana's 4KB stack limit on deserialization.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct DisputeInfo {
    pub challenger: Pubkey,
    pub bond: u64,
    pub reason_hash: [u8; 32],
    pub raised_at: i64,
    pub resolved_at: i64,
    pub resolution: DisputeResolution,
    /// Bit `i` set = arbitrator at `config.arbitrators[i]` approved.
    pub approval_mask: u8,
    pub approval_count: u8,
}

impl DisputeInfo {
    pub const LEN: usize =
        32 +                                         // challenger
        8 +                                          // bond
        32 +                                         // reason_hash
        8 +                                          // raised_at
        8 +                                          // resolved_at
        1 + 8 +                                      // resolution (enum tag + max payload u64)
        1 +                                          // approval_mask
        1;                                           // approval_count

    pub fn is_active(&self) -> bool {
        self.raised_at != 0 && self.resolved_at == 0
    }

    pub fn is_resolved(&self) -> bool {
        self.raised_at != 0 && self.resolved_at != 0
    }

    /// True if this arbitrator index has already approved.
    pub fn has_approved(&self, arbitrator_idx: usize) -> bool {
        (self.approval_mask >> arbitrator_idx) & 1 == 1
    }

    /// Mark the given arbitrator index as having approved.
    pub fn record_approval(&mut self, arbitrator_idx: usize) {
        self.approval_mask |= 1 << arbitrator_idx;
        self.approval_count = self.approval_mask.count_ones() as u8;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum DisputeResolution {
    /// No resolution set yet.
    Pending,
    /// Taker wins the full escrow plus the poster's slashed bond.
    FavorTaker,
    /// Poster wins: escrow refunded, taker gets nothing, poster bond returned.
    FavorPoster,
    /// Partial resolution: taker receives `taker_amount` out of the escrow,
    /// remainder refunded to poster. Poster bond is always returned in a Split.
    Split { taker_amount: u64 },
}

impl Default for DisputeResolution {
    fn default() -> Self {
        Self::Pending
    }
}

/// Per-wallet reputation PDA. seeds = [b"reputation", wallet].
#[account]
pub struct AgentReputation {
    pub address: Pubkey,
    pub jobs_completed: u64,
    pub jobs_failed: u64,
    pub jobs_disputed: u64,
    pub total_earned: u64,
    pub first_job_at: i64,
    pub bump: u8,
}

impl AgentReputation {
    pub const LEN: usize =
        8 +                                          // discriminator
        32 +                                         // address
        8 +                                          // jobs_completed
        8 +                                          // jobs_failed
        8 +                                          // jobs_disputed
        8 +                                          // total_earned
        8 +                                          // first_job_at
        1;                                           // bump
}
