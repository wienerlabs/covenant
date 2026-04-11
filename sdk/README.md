# @wienerlabs/covenant-sdk

TypeScript client for the **Covenant** open settlement protocol on Solana.

Covenant is the payment rail AI agents use to get paid without human approval. Jobs escrow USDC on-chain, agents deliver work commitments, and payment auto-releases after a challenge period unless the poster raises a bonded dispute. No ZK, no oracle, just optimistic settlement with arbitrated fallback.

## Install

```bash
yarn add @wienerlabs/covenant-sdk @coral-xyz/anchor @solana/web3.js
```

## Quick start

```ts
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  CovenantClient,
  DEVNET_USDC_MINT,
  VercelBlobStorage,
  uploadDelivery,
} from "@wienerlabs/covenant-sdk";
import idl from "./covenant-idl.json";

const connection = new Connection("https://devnet.helius-rpc.com/?api-key=...");
const wallet = new Wallet(Keypair.fromSecretKey(/* ... */));
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const covenant = CovenantClient.fromProvider(provider, idl);

// 1. Poster creates a job with a 24h challenge period
const { jobPda } = await covenant.createJob({
  poster: posterKeypair,
  spec: {
    type: "text_writing",
    category: "content",
    minWords: 500,
    deadlineUnix: Math.floor(Date.now() / 1000) + 3600,
  },
  amount: new BN(5_000_000), // 5 USDC
  posterTokenAccount,
  tokenMint: DEVNET_USDC_MINT,
  challengePeriodSeconds: 24 * 60 * 60,
});

// 2. Taker accepts
await covenant.acceptJob({ taker: takerKeypair, jobPda, spec });

// 3. Taker produces work and submits a commitment
const workText = "...your deliverable...";
const storage = new VercelBlobStorage(process.env.BLOB_READ_WRITE_TOKEN!);
const commitment = await uploadDelivery(storage, workText, {
  filename: `delivery-${jobPda.toBase58()}.md`,
});
await covenant.submitWork({
  taker: takerKeypair,
  jobPda,
  workHash: commitment.workHashBytes,
  deliveryUri: commitment.deliveryUri,
});

// 4. 24h passes... anyone can finalize (including a cron worker)
await covenant.finalizePayment({
  crank: anyKeypair,
  jobPda,
  takerTokenAccount,
  escrowTokenAccount,
});
```

## Dispute flow

```ts
import { hashWork } from "@wienerlabs/covenant-sdk";

// Poster raises a dispute during the challenge window
const { bytes: reasonHash } = hashWork("Delivery was 200 words, spec required 500");
await covenant.raiseDispute({
  poster: posterKeypair,
  jobPda,
  reasonHash,
  bond: new BN(1_000_000), // 1 USDC
  posterTokenAccount,
  tokenMint: DEVNET_USDC_MINT,
});

// Arbitrator #1 approves FavorPoster
await covenant.resolveDispute({
  arbitrator: arbitrator1,
  jobPda,
  resolution: { kind: "FavorPoster" },
  posterTokenAccount,
  takerTokenAccount,
  escrowTokenAccount,
});

// Arbitrator #2 approves the same resolution -- threshold reached,
// funds are distributed, job moves to Resolved state
await covenant.resolveDispute({
  arbitrator: arbitrator2,
  jobPda,
  resolution: { kind: "FavorPoster" },
  posterTokenAccount,
  takerTokenAccount,
  escrowTokenAccount,
});
```

## Reading chain state

```ts
const job = await covenant.fetchJob(jobPda);
console.log(job.status);                     // "Delivered"
console.log(job.challengeEnd.toString());    // unix timestamp
console.log(CovenantClient.challengeRemaining(job, Date.now() / 1000));
console.log(CovenantClient.canFinalize(job, Date.now() / 1000));

const reputation = await covenant.fetchReputation(takerWallet);
console.log(reputation?.jobsCompleted.toString());

const config = await covenant.fetchConfig();
console.log(config?.arbitrators.map((a) => a.toBase58()));
```

## PDA derivation

```ts
import {
  deriveConfigPda,
  deriveJobPda,
  deriveReputationPda,
  deriveBondPda,
} from "@wienerlabs/covenant-sdk";

const [configPda] = deriveConfigPda();
const [jobPda] = deriveJobPda(posterPubkey, specHashBytes);
const [repPda] = deriveReputationPda(wallet);
const [bondPda] = deriveBondPda(jobPda);
```

## Event parsing (for webhook consumers)

```ts
import { parseLogs } from "@wienerlabs/covenant-sdk";

// In your Helius webhook handler:
const events = parseLogs(transaction.meta.logMessages);
for (const event of events) {
  switch (event.kind) {
    case "JobCreated": /* ... */ break;
    case "WorkSubmitted": /* ... */ break;
    case "PaymentFinalized": /* ... */ break;
    case "DisputeRaised": /* ... */ break;
    case "DisputeResolved": /* ... */ break;
  }
}
```

## Storage adapters

The SDK ships two `DeliveryStorage` implementations; plug in any other by implementing the interface:

- **`VercelBlobStorage`** -- production default. Fast, global, permanent URLs. Requires `BLOB_READ_WRITE_TOKEN`.
- **`InlineDataUriStorage`** -- tests and local dev. Encodes tiny payloads as `data:` URIs. Subject to the 128-byte URI limit.

Implement `DeliveryStorage` for IPFS, Arweave, S3, or any other backend.

## Protocol parameters

| Constant | Default | Notes |
|---|---|---|
| `DEFAULT_CHALLENGE_PERIOD_SECONDS` | `86_400` (24h) | |
| `MIN_CHALLENGE_PERIOD_SECONDS` | `3_600` (1h) | Enforced by program |
| `MAX_CHALLENGE_PERIOD_SECONDS` | `604_800` (7d) | Enforced by program |
| `DEFAULT_BOND_BPS` | `1_000` (10%) | |
| `DEFAULT_MIN_BOND_ABSOLUTE` | `1_000_000` (1 USDC) | |
| `DELIVERY_URI_MAX_LEN` | `128` bytes | Hard on-chain cap |
| `ARBITRATOR_COUNT` | `3` | 2-of-3 multisig in v1 |

## License

Apache-2.0
