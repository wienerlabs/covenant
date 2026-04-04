# COVENANT SDK

TypeScript SDK for interacting with the Covenant protocol on Solana.

## Installation

```bash
yarn add @covenant/sdk
# or
npm install @covenant/sdk
```

## Usage

### CovenantSDK

```typescript
import { CovenantSDK } from "@covenant/sdk";

const sdk = new CovenantSDK({
  rpcUrl: "https://api.devnet.solana.com",
  programId: "HAptQVTwT4AYRzPkvT9UFxGEZEjqVs6ALF295WXXPTNo",
});

// Create a job escrow
const escrow = await sdk.createJobEscrow({
  poster: posterKeypair,
  amount: 25_000_000, // 25 USDC (6 decimals)
  specHash: specHashBytes,
  deadline: Math.floor(Date.now() / 1000) + 86400,
});

// Accept a job
await sdk.acceptJob({
  taker: takerKeypair,
  jobEscrowPDA: escrow.pda,
  poster: posterPublicKey,
});

// Submit completion with proof
await sdk.submitCompletion({
  taker: takerKeypair,
  jobEscrowPDA: escrow.pda,
  proof: proofBuffer,
  minWords: 200,
  textHash: textHashBytes,
});
```

### Zero-Knowledge Proof Generation

```typescript
import { generateWordCountProof } from "@covenant/sdk";

const proof = await generateWordCountProof({
  text: "Your deliverable text here...",
  minWords: 200,
});

console.log(proof.verified);   // true
console.log(proof.wordCount);  // 250
console.log(proof.textHash);   // SHA-256 hex string
console.log(proof.cycleCount); // 237583
```

## Type Exports

```typescript
import type {
  JobSpec,
  JobEscrowAccount,
  SubmissionData,
  ProofResult,
  ReputationAccount,
} from "@covenant/sdk";
```

### JobSpec

```typescript
interface JobSpec {
  posterWallet: string;
  amount: number;
  minWords: number;
  language: string;
  deadline: string;
  createdAt: string;
  title?: string;
  description?: string;
}
```

### JobEscrowAccount

```typescript
interface JobEscrowAccount {
  poster: PublicKey;
  taker: PublicKey | null;
  amount: BN;
  specHash: number[];
  deadline: BN;
  status: "Open" | "Accepted" | "Completed" | "Cancelled" | "Disputed";
}
```

### ProofResult

```typescript
interface ProofResult {
  verified: boolean;
  wordCount: number;
  minWords: number;
  textHash: string;
  cycleCount: number;
  executionTime: number;
}
```

## Environment

The SDK targets **Solana Devnet** by default. Pass a custom `rpcUrl` to connect to mainnet or localnet.

## License

MIT
