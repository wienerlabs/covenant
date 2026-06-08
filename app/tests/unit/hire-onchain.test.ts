/**
 * Unit tests for C-019 on-chain hire orchestration (lib/hire-onchain).
 *
 * The three on-chain primitives are injected and recorded, so we assert the
 * create → accept → deliver sequence, the wallet each step signs with, and the
 * aggregated result — without touching a chain.
 *
 * Run with:  npx tsx --test tests/unit/hire-onchain.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { hireAgentOnchain, type HireOnchainDeps } from "../../lib/hire-onchain";

const poster = Keypair.generate();
const agent = Keypair.generate();
const jobPda = Keypair.generate().publicKey;
const escrow = Keypair.generate().publicKey;

function recordingDeps() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const deps: HireOnchainDeps = {
    botCreateJob: async (p) => {
      calls.push({ fn: "create", args: { signer: p.botKeypair.publicKey.toBase58(), amount: p.amount, deadline: p.deadline, challengePeriod: p.challengePeriod } });
      return { sig: "CREATE_SIG", jobPda, escrowTokenAccount: escrow };
    },
    botAcceptJob: async (p) => {
      calls.push({ fn: "accept", args: { signer: p.takerBotKeypair.publicKey.toBase58(), poster: p.poster.toBase58() } });
      return "ACCEPT_SIG";
    },
    botSubmitWork: async (p) => {
      calls.push({ fn: "submit", args: { signer: p.takerBotKeypair.publicKey.toBase58(), poster: p.poster.toBase58(), deliveryUri: p.deliveryUri } });
      return "SUBMIT_SIG";
    },
  };
  return { deps, calls };
}

const baseParams = {
  posterKeypair: poster,
  agentKeypair: agent,
  amount: 15,
  specHash: Buffer.alloc(32, 7),
  deadlineUnix: 1_900_000_000,
  challengePeriodSec: 60,
  workHash: Buffer.alloc(32, 9),
  deliveryUri: "https://blob.example/work.json",
};

describe("C-019 · hireAgentOnchain", () => {
  test("runs create → accept → deliver in order, each with the right signer", async () => {
    const { deps, calls } = recordingDeps();
    const res = await hireAgentOnchain({ ...baseParams, deps });

    assert.deepEqual(
      calls.map((c) => c.fn),
      ["create", "accept", "submit"],
    );
    // poster signs create; agent signs accept + deliver
    assert.equal(calls[0].args.signer, poster.publicKey.toBase58());
    assert.equal(calls[0].args.amount, 15);
    assert.equal(calls[1].args.signer, agent.publicKey.toBase58());
    assert.equal(calls[1].args.poster, poster.publicKey.toBase58());
    assert.equal(calls[2].args.signer, agent.publicKey.toBase58());
    assert.equal(calls[2].args.deliveryUri, baseParams.deliveryUri);

    assert.deepEqual(res, {
      jobPda: jobPda.toBase58(),
      escrowTokenAccount: escrow.toBase58(),
      createSig: "CREATE_SIG",
      acceptSig: "ACCEPT_SIG",
      submitSig: "SUBMIT_SIG",
    });
  });

  test("rejects when the agent and poster are the same wallet", async () => {
    const { deps, calls } = recordingDeps();
    await assert.rejects(
      hireAgentOnchain({ ...baseParams, agentKeypair: poster, deps }),
      /different wallets/,
    );
    assert.equal(calls.length, 0); // never touches the chain
  });

  test("fails fast: if create throws, accept/deliver never run", async () => {
    const calls: string[] = [];
    const deps: HireOnchainDeps = {
      botCreateJob: async () => {
        throw new Error("escrow underfunded");
      },
      botAcceptJob: async () => {
        calls.push("accept");
        return "x";
      },
      botSubmitWork: async () => {
        calls.push("submit");
        return "y";
      },
    };
    await assert.rejects(hireAgentOnchain({ ...baseParams, deps }), /underfunded/);
    assert.deepEqual(calls, []);
  });

  test("passes the 32-byte spec + work hashes through unchanged", async () => {
    let seenSpec: Buffer | null = null;
    let seenWork: Buffer | null = null;
    const deps: HireOnchainDeps = {
      botCreateJob: async (p) => {
        seenSpec = p.specHash;
        return { sig: "s", jobPda, escrowTokenAccount: escrow };
      },
      botAcceptJob: async () => "a",
      botSubmitWork: async (p) => {
        seenWork = p.workHash;
        return "b";
      },
    };
    await hireAgentOnchain({ ...baseParams, deps });
    assert.equal(seenSpec && (seenSpec as Buffer).length, 32);
    assert.equal(seenWork && (seenWork as Buffer).length, 32);
  });
});
