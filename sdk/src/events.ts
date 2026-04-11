import { PublicKey } from "@solana/web3.js";

/**
 * A parsed Covenant protocol event, extracted from a transaction's logs
 * or from a Helius webhook payload. The SDK doesn't own the Helius
 * transport — callers feed raw log lines and we return typed events.
 */
export type CovenantEvent =
  | { kind: "JobCreated"; jobPda: PublicKey; poster: PublicKey; amount: bigint; challengePeriod: bigint }
  | { kind: "JobAccepted"; jobPda: PublicKey; taker: PublicKey }
  | { kind: "WorkSubmitted"; jobPda: PublicKey; taker: PublicKey; workHash: string; challengeEnd: bigint }
  | { kind: "PaymentFinalized"; jobPda: PublicKey; taker: PublicKey; amount: bigint; crank: PublicKey }
  | { kind: "DisputeRaised"; jobPda: PublicKey; challenger: PublicKey; bond: bigint; reasonHash: string }
  | { kind: "DisputeResolved"; jobPda: PublicKey; resolution: string; escrowToTaker: bigint; escrowToPoster: bigint }
  | { kind: "JobCancelled"; jobPda: PublicKey; signer: PublicKey };

/**
 * Parse a single program log line and extract an event if it matches
 * the Covenant program's `msg!` format. Returns `null` for unrecognized lines.
 *
 * Note: this is a pragmatic stringly-typed parser designed to consume
 * Helius's parsed log stream. A more robust implementation would use
 * Anchor's event discriminators via `EventParser`; for v1 we use string
 * matching because it's simpler and easier to evolve.
 */
export function parseLogLine(line: string): Partial<CovenantEvent> | null {
  // "Program log: Job created: poster=..., amount=..., challenge_period=...s"
  if (line.includes("Job created:")) {
    const poster = line.match(/poster=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    const amount = line.match(/amount=(\d+)/)?.[1];
    const cp = line.match(/challenge_period=(\d+)s/)?.[1];
    if (poster && amount && cp) {
      return {
        kind: "JobCreated",
        poster: new PublicKey(poster),
        amount: BigInt(amount),
        challengePeriod: BigInt(cp),
      };
    }
  }
  if (line.includes("Job accepted by taker=")) {
    const taker = line.match(/taker=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    if (taker) return { kind: "JobAccepted", taker: new PublicKey(taker) };
  }
  if (line.includes("Work submitted:")) {
    const taker = line.match(/taker=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    const challengeEnd = line.match(/challenge_end=(\d+)/)?.[1];
    if (taker && challengeEnd) {
      return {
        kind: "WorkSubmitted",
        taker: new PublicKey(taker),
        challengeEnd: BigInt(challengeEnd),
        workHash: "", // hash is in the tx data, not logs
      };
    }
  }
  if (line.includes("Payment finalized:")) {
    const taker = line.match(/taker=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    const amount = line.match(/amount=(\d+)/)?.[1];
    const crank = line.match(/crank=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    if (taker && amount && crank) {
      return {
        kind: "PaymentFinalized",
        taker: new PublicKey(taker),
        amount: BigInt(amount),
        crank: new PublicKey(crank),
      };
    }
  }
  if (line.includes("Dispute raised:")) {
    const challenger = line.match(/challenger=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    const bond = line.match(/bond=(\d+)/)?.[1];
    if (challenger && bond) {
      return {
        kind: "DisputeRaised",
        challenger: new PublicKey(challenger),
        bond: BigInt(bond),
        reasonHash: "",
      };
    }
  }
  if (line.includes("Dispute resolved:")) {
    const resolution = line.match(/resolution=(\w+)/)?.[1] ?? "Unknown";
    const toTaker = line.match(/escrow_to_taker=(\d+)/)?.[1] ?? "0";
    const toPoster = line.match(/escrow_to_poster=(\d+)/)?.[1] ?? "0";
    return {
      kind: "DisputeResolved",
      resolution,
      escrowToTaker: BigInt(toTaker),
      escrowToPoster: BigInt(toPoster),
    };
  }
  if (line.includes("Job cancelled:")) {
    const signer = line.match(/signer=([1-9A-HJ-NP-Za-km-z]+)/)?.[1];
    if (signer) return { kind: "JobCancelled", signer: new PublicKey(signer) };
  }
  return null;
}

/**
 * Parse a full array of log lines from a Solana transaction into
 * structured events. Useful for reconciliation crons and webhook handlers.
 */
export function parseLogs(lines: string[]): Partial<CovenantEvent>[] {
  return lines.map(parseLogLine).filter((e): e is Partial<CovenantEvent> => e !== null);
}
