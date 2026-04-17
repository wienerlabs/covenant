import { PublicKey } from "@solana/web3.js";
import { COVENANT_PROGRAM_ID, PDA_SEEDS } from "./constants";

/** Derive the singleton ProtocolConfig PDA. */
export function deriveConfigPda(
  programId: PublicKey = COVENANT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PDA_SEEDS.config], programId);
}

/** Derive a JobEscrow PDA from poster + spec hash. */
export function deriveJobPda(
  poster: PublicKey,
  specHash: Uint8Array | Buffer,
  programId: PublicKey = COVENANT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS.job, poster.toBuffer(), Buffer.from(specHash)],
    programId,
  );
}

/** Derive an AgentReputation PDA for a wallet. */
export function deriveReputationPda(
  wallet: PublicKey,
  programId: PublicKey = COVENANT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS.reputation, wallet.toBuffer()],
    programId,
  );
}

/** Derive a dispute bond token account PDA for a job. */
export function deriveBondPda(
  job: PublicKey,
  programId: PublicKey = COVENANT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS.bond, job.toBuffer()],
    programId,
  );
}

/** Derive the ClaimListing PDA for a job (Covenant Credit). */
export function deriveClaimPda(
  job: PublicKey,
  programId: PublicKey = COVENANT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PDA_SEEDS.claim, job.toBuffer()],
    programId,
  );
}
