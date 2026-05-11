/**
 * Covenant × LangChain — payment rail as a LangChain Tool.
 *
 * Wraps Covenant's job lifecycle as LangChain StructuredTools so an
 * agent graph can post paying jobs, and agents on the other side can
 * accept + deliver + collect USDC autonomously.
 *
 * The demo shows BOTH sides:
 *   - Poster agent posts a writing job with 5 USDC locked in escrow
 *   - Taker agent accepts, delivers, lists the claim on Covenant Credit
 *     at a 3% discount, and gets paid in sub-second wall time instead
 *     of waiting 24h
 *
 * NOTE: This is illustrative. You'll want to swap the in-memory
 * keypair loader with a secure wallet provider in production.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  CovenantClient,
  DEVNET_USDC_MINT,
  hashSpec,
  type JobSpec,
} from "covenant-sdk";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import idl from "../dist/covenant-idl.json" with { type: "json" };

function clientFor(keypair: Keypair): CovenantClient {
  const conn = new Connection(
    process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com",
    "confirmed",
  );
  const provider = new AnchorProvider(conn, new Wallet(keypair), {
    commitment: "confirmed",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return CovenantClient.fromProvider(provider, idl as any);
}

function loadKeypair(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

// --- Tools ---------------------------------------------------------------

export const covenantPostJobTool = new DynamicStructuredTool({
  name: "covenant_post_job",
  description:
    "Create a paying job on Covenant. USDC is locked in a per-job PDA " +
    "escrow on Solana and released to whoever delivers the work first. " +
    "Returns the job PDA so the agent can track it.",
  schema: z.object({
    title: z.string(),
    amountUsdc: z.number().positive(),
    minWords: z.number().int().positive(),
    deadlineHoursFromNow: z.number().positive(),
  }),
  func: async ({ title, amountUsdc, minWords, deadlineHoursFromNow }) => {
    const poster = loadKeypair("POSTER_KEYPAIR");
    const covenant = clientFor(poster);

    const spec: JobSpec = {
      type: "langchain.job.v1",
      category: "text_writing",
      language: "English",
      minWords,
      deadlineUnix:
        Math.floor(Date.now() / 1000) + Math.round(deadlineHoursFromNow * 3600),
      metadata: { title, source: "langchain-agent" },
    };
    const posterAta = await getAssociatedTokenAddress(
      DEVNET_USDC_MINT,
      poster.publicKey,
    );

    const { jobPda, txSig } = await covenant.createJob({
      poster,
      spec,
      amount: new BN(Math.round(amountUsdc * 1_000_000)),
      posterTokenAccount: posterAta,
      tokenMint: DEVNET_USDC_MINT,
    });

    const specHash = hashSpec(spec);
    return JSON.stringify({
      jobPda: jobPda.toBase58(),
      txSig,
      specHash,
    });
  },
});

export const covenantSellClaimTool = new DynamicStructuredTool({
  name: "covenant_sell_claim",
  description:
    "Covenant Credit: after the agent has DELIVERED work on a job, " +
    "sell the pending payment claim at a discount to a lender and get " +
    "paid immediately instead of waiting for the 24h challenge window " +
    "to expire. Use this when the agent needs cash flow to accept the " +
    "next job.",
  schema: z.object({
    jobPda: z.string(),
    discountPct: z.number().min(0.5).max(20).default(3),
  }),
  func: async ({ jobPda, discountPct }) => {
    const seller = loadKeypair("TAKER_KEYPAIR");
    const covenant = clientFor(seller);

    const jobKey = new PublicKey(jobPda);
    const job = await covenant.fetchJob(jobKey);
    const faceValue = job.amount.toNumber();
    const price = new BN(Math.round(faceValue * (1 - discountPct / 100)));

    const { txSig, claimPda } = await covenant.listClaim({
      seller,
      jobPda: jobKey,
      price,
    });

    return JSON.stringify({
      claimPda: claimPda.toBase58(),
      txSig,
      facedValueAtomic: faceValue,
      priceAtomic: price.toString(),
      discountPct,
    });
  },
});

export const covenantBuyClaimTool = new DynamicStructuredTool({
  name: "covenant_buy_claim",
  description:
    "Covenant Credit: lender side. Buy a listed agent claim at its " +
    "discounted price. On success the buyer receives the full face " +
    "value when the job settles on chain — earning yield for bearing " +
    "dispute risk during the challenge window.",
  schema: z.object({
    jobPda: z.string(),
  }),
  func: async ({ jobPda }) => {
    const buyer = loadKeypair("LENDER_KEYPAIR");
    const covenant = clientFor(buyer);

    const jobKey = new PublicKey(jobPda);
    const claim = await covenant.fetchClaim(jobKey);
    if (!claim) throw new Error("no claim listing for this job");
    if (claim.status !== "Listed") {
      throw new Error(`claim is ${claim.status}, expected Listed`);
    }

    const buyerAta = await getAssociatedTokenAddress(
      DEVNET_USDC_MINT,
      buyer.publicKey,
    );
    const sellerAta = await getAssociatedTokenAddress(
      DEVNET_USDC_MINT,
      claim.seller,
    );

    const { txSig } = await covenant.buyClaim({
      buyer,
      jobPda: jobKey,
      buyerTokenAccount: buyerAta,
      sellerTokenAccount: sellerAta,
    });

    return JSON.stringify({
      txSig,
      paidAtomic: claim.price.toString(),
      willReceiveAtomic: claim.faceValue.toString(),
    });
  },
});

/**
 * All Covenant tools, ready to plug into an AgentExecutor.
 *
 * Example:
 *
 *   const agent = await createOpenAIToolsAgent({
 *     llm: new ChatOpenAI({ model: "gpt-4o" }),
 *     tools: covenantTools,
 *     prompt: myPrompt,
 *   });
 *   const executor = new AgentExecutor({ agent, tools: covenantTools });
 *   await executor.invoke({
 *     input: "Post a $5 job for a 500-word product description, " +
 *            "then once the work lands, sell my claim at 3% to lock in cash flow.",
 *   });
 */
export const covenantTools = [
  covenantPostJobTool,
  covenantSellClaimTool,
  covenantBuyClaimTool,
];
