/**
 * Covenant × MCP — agent-payable tool server over Model Context Protocol.
 *
 * This example exposes two MCP tools:
 *   - `post_job`   : clients (typically LLMs or agent frameworks) create
 *                    a paying Covenant job with USDC locked in escrow.
 *   - `finalize`   : once work has been delivered and the challenge
 *                    period has elapsed, the crank releases the escrow
 *                    (or routes it to the buyer if the claim was sold
 *                    on Covenant Credit).
 *
 * Pair this with an MCP-speaking LLM agent to demo the end-to-end
 * "agent earns money for a paid tool call" flow.
 *
 * NOTE: This is illustrative, not production code. It omits the MCP
 * server boilerplate (transport, stdio wiring, etc.) and focuses on
 * the Covenant surface.
 */

import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  CovenantClient,
  DEVNET_USDC_MINT,
  hashSpec,
  type JobSpec,
} from "@wienerlabs/covenant-sdk";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import idl from "../dist/covenant-idl.json" with { type: "json" };

// --- MCP tool handlers ---------------------------------------------------

export async function mcpPostJobTool(args: {
  title: string;
  amount: number; // USDC (human)
  minWords: number;
  deadlineHoursFromNow: number;
}): Promise<{ jobPda: string; txSig: string; specHash: string }> {
  const conn = new Connection(
    process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com",
    "confirmed",
  );
  const poster = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.POSTER_KEYPAIR!)),
  );
  const provider = new AnchorProvider(conn, new Wallet(poster), {
    commitment: "confirmed",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const covenant = CovenantClient.fromProvider(provider, idl as any);

  const spec: JobSpec = {
    type: "mcp.prompt.v1",
    category: "text_writing",
    language: "English",
    minWords: args.minWords,
    deadlineUnix:
      Math.floor(Date.now() / 1000) + args.deadlineHoursFromNow * 3600,
    metadata: { title: args.title },
  };
  const specHashHex = hashSpec(spec);
  const specHashBytes = Uint8Array.from(Buffer.from(specHashHex, "hex"));

  // Derive poster's USDC ATA (assumed pre-funded).
  const { getAssociatedTokenAddress } = await import("@solana/spl-token");
  const posterAta = await getAssociatedTokenAddress(
    DEVNET_USDC_MINT,
    poster.publicKey,
  );

  const { jobPda, txSig, escrowTokenAccount } = await covenant.createJob({
    poster,
    spec,
    amount: new BN(Math.round(args.amount * 1_000_000)), // USDC has 6 decimals
    posterTokenAccount: posterAta,
    tokenMint: DEVNET_USDC_MINT,
  });

  // In a real MCP server, stash escrowTokenAccount somewhere durable —
  // you'll need it for finalize.
  console.log("[mcp] created job", {
    jobPda: jobPda.toBase58(),
    escrow: escrowTokenAccount.toBase58(),
  });

  return {
    jobPda: jobPda.toBase58(),
    txSig,
    specHash: specHashHex,
  };
}

export async function mcpFinalizeTool(args: {
  jobPda: string;
  escrowTokenAccount: string;
  takerTokenAccount: string;
}): Promise<{ txSig: string; routedToBuyer: boolean }> {
  const conn = new Connection(
    process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com",
    "confirmed",
  );
  const crank = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.CRANK_KEYPAIR!)),
  );
  const provider = new AnchorProvider(conn, new Wallet(crank), {
    commitment: "confirmed",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const covenant = CovenantClient.fromProvider(provider, idl as any);

  const jobPda = new PublicKey(args.jobPda);

  // If the seller sold their claim via Covenant Credit, route payment
  // to the buyer; otherwise to the taker. The SDK's fetchClaim handles
  // the lookup.
  const claim = await covenant.fetchClaim(jobPda);
  const routedToBuyer =
    claim !== null && claim.status === "Bought" && !claim.buyer.equals(PublicKey.default);

  const { txSig } = await covenant.finalizePayment({
    crank,
    jobPda,
    escrowTokenAccount: new PublicKey(args.escrowTokenAccount),
    takerTokenAccount: new PublicKey(args.takerTokenAccount),
  });

  return { txSig, routedToBuyer };
}

// --- Minimal MCP server stub --------------------------------------------
//
// Replace with your MCP transport of choice. See the MCP spec at
// https://modelcontextprotocol.io for the wire protocol.
/*
import { Server } from "@modelcontextprotocol/sdk/server";
const server = new Server({ name: "covenant-payments", version: "0.1.0" });

server.setTool("post_job", {
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      amount: { type: "number" },
      minWords: { type: "number" },
      deadlineHoursFromNow: { type: "number" },
    },
    required: ["title", "amount", "minWords", "deadlineHoursFromNow"],
  },
  handler: mcpPostJobTool,
});

server.setTool("finalize", {
  schema: { ... },
  handler: mcpFinalizeTool,
});

await server.connect(/* your transport here */);
*/
