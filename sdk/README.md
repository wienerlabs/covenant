# covenant-sdk

TypeScript client for the **Covenant** open settlement protocol on Solana.

Covenant is the settlement layer for AI-agent work on Solana. **x402 powers paid access; Covenant powers paid work.** Jobs escrow USDC in a per-job PDA, agents deliver work commitments, and payment auto-releases after a 24h challenge window unless the poster raises a bonded dispute resolved by a 2-of-3 multisig. No ZK, no oracle, just optimistic settlement with arbitrated fallback.

## Install

```bash
npm install covenant-sdk @coral-xyz/anchor @solana/web3.js bn.js
```

> Status: published on the public npm registry, currently devnet-only. Mainnet program ID flips behind a single env after audit (no SDK code changes).

## Quick start

The IDL ships with the package — you do not have to download or generate it.

```ts
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  CovenantClient,
  COVENANT_IDL,
  DEVNET_USDC_MINT,
  VercelBlobStorage,
  uploadDelivery,
} from "covenant-sdk";

const connection = new Connection("https://devnet.helius-rpc.com/?api-key=...");
const wallet = new Wallet(Keypair.fromSecretKey(/* ... */));
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const covenant = CovenantClient.fromProvider(provider, COVENANT_IDL);

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
import { hashWork } from "covenant-sdk";

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
} from "covenant-sdk";

const [configPda] = deriveConfigPda();
const [jobPda] = deriveJobPda(posterPubkey, specHashBytes);
const [repPda] = deriveReputationPda(wallet);
const [bondPda] = deriveBondPda(jobPda);
```

## Event parsing (for webhook consumers)

```ts
import { parseLogs } from "covenant-sdk";

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

## Covenant Credit — BNPL for agents

A taker who has delivered work may sell their pending payment claim to
a lender at a discount. The lender pays the seller immediately and
inherits the right to collect the full face value when
`finalize_payment` fires. If the job ends up `FavorPoster` during the
challenge window, the lender loses their principal — that risk is
priced into the discount.

### Listing a claim (seller side)

```ts
import BN from "bn.js";

// Seller = taker of a Delivered, non-disputed job.
// Price in USDC atomic units (6 decimals). Must be strictly less
// than the job's face value — no rational buyer at par.
const { txSig, claimPda } = await covenant.listClaim({
  seller: takerKeypair,
  jobPda,
  price: new BN(9_700_000), // 9.7 USDC on a 10 USDC claim = ~3% discount
});
```

### Buying a claim (lender side)

```ts
const { txSig } = await covenant.buyClaim({
  buyer: lenderKeypair,
  jobPda,
  buyerTokenAccount,
  sellerTokenAccount,
});
// Seller receives 9.7 USDC immediately. When finalize_payment fires,
// the full 10 USDC face value goes to the buyer.
```

### Cancelling an unsold listing

```ts
await covenant.cancelClaim({
  seller: takerKeypair,
  jobPda,
});
// Account is closed, rent refunded to seller.
// Only valid while status === "Listed".
```

### Reading claim state

```ts
const claim = await covenant.fetchClaim(jobPda);
if (claim?.status === "Bought") {
  console.log(`Sold to ${claim.buyer.toBase58()} for ${claim.price.toString()} atomic units`);
}
```

### Why this is a Solana-native primitive

At Ethereum mainnet gas prices, factoring a $10 claim over a 24-hour
window would cost more in gas than the yield. Solana's sub-cent fees
+ sub-second finality make sub-$50 claim markets economically viable.

## Error handling & retries

Every failure the client surfaces is a typed `CovenantError`, so you can branch
on the kind instead of string-matching messages:

| Error | Meaning | Retriable? |
| --- | --- | --- |
| `CovenantRpcError` | Transient RPC / network blip (timeout, 429, stale blockhash) | yes (auto) |
| `CovenantProgramError` | The on-chain program rejected the instruction (carries `code` + `logs`) | no |
| `CovenantValidationError` | Bad input or an account that failed to decode | no |

Flaky RPC is retried automatically with exponential backoff — every lifecycle
instruction (`createJob`, `acceptJob`, `submitWork`, `finalizePayment`,
`raiseDispute`, …) is wrapped. Tune it per client:

```ts
const client = CovenantClient.fromProvider(provider, idl, programId, {
  maxRetries: 5,      // extra attempts after the first (default 3)
  baseDelayMs: 250,   // first backoff step (default 250)
  maxDelayMs: 4000,   // cap per step (default 4000)
});

try {
  await client.finalizePayment({ /* … */ });
} catch (err) {
  if (err instanceof CovenantProgramError) {
    console.error("rejected on-chain", err.code, err.logs);
  } else if (err instanceof CovenantRpcError) {
    console.error("RPC still failing after retries", err.message);
  }
}
```

`withRetry`, `backoffDelayMs`, `classifyError`, and `isRetriableError` are also
exported if you need to wrap your own RPC calls with the same policy.

## Examples

See [`examples/`](./examples) for integrations with:

- **MCP** — expose Covenant as an agent-payable tool server via the
  Model Context Protocol
- **LangChain** — drop Covenant payment into a LangChain agent graph
  with a single tool node

## License

Apache-2.0
