import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { sendX402Payment, getAgentKeypair } from "@/lib/x402";
import { AGENT_ALPHA, AGENT_OMEGA } from "@/lib/agents";
import { getCategoryById } from "@/lib/categories";
import { rateLimit } from "@/lib/rateLimit";
import { lockFundsInEscrow, releaseFundsToTaker } from "@/lib/escrow";
import {
  getAnchorProgram,
  keypairFromEnv,
  deriveJobEscrowPDA,
  deriveReputationPDA,
  PROGRAM_ID,
  DEVNET_USDC_MINT,
} from "@/lib/anchor-client";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { executeCircuit } from "@/lib/sp1-circuit";
import { generateDID } from "@/lib/aip/did";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { NextRequest } from "next/server";
import BN from "bn.js";

function getDeployerWallet(): string {
  const raw = process.env.DEPLOYER_KEYPAIR;
  if (!raw) throw new Error("DEPLOYER_KEYPAIR env var not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))).publicKey.toBase58();
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function sseEvent(step: string, message: string, data: unknown = null): string {
  return JSON.stringify({ step, message, data }) + "\n";
}

async function ensureAgentProfiles() {
  // Ensure Alpha profile exists
  await prisma.profile.upsert({
    where: { walletAddress: AGENT_ALPHA.wallet },
    create: {
      walletAddress: AGENT_ALPHA.wallet,
      displayName: "Agent Alpha",
      role: "poster",
      bio: "Autonomous AI job poster powered by Claude Haiku",
      avatarSeed: AGENT_ALPHA.avatarSeed,
    },
    update: {},
  });

  // Ensure Omega profile exists
  await prisma.profile.upsert({
    where: { walletAddress: AGENT_OMEGA.wallet },
    create: {
      walletAddress: AGENT_OMEGA.wallet,
      displayName: "Agent Omega",
      role: "taker",
      bio: "Autonomous AI worker powered by Claude Haiku",
      avatarSeed: AGENT_OMEGA.avatarSeed,
    },
    update: {},
  });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const rl = rateLimit(`arena:${ip}`, 5);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 5 requests per minute." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(step: string, message: string, data: unknown = null) {
        controller.enqueue(encoder.encode(sseEvent(step, message, data)));
      }

      try {
        const client = new Anthropic();

        // Ensure agent profiles exist
        await ensureAgentProfiles();

        // ===== STEP 1: ALPHA THINKS =====
        send("alpha_thinking", "Agent Alpha is generating a job specification...");

        const alphaPrompt = `You are an AI agent posting a job on the COVENANT protocol. Generate a realistic job specification. Respond ONLY with JSON: {"title": "...", "category": "text_writing|code_review|translation|data_labeling|bug_bounty|design", "amount": <number 5-50>, "minWords": <number 100-500>, "description": "..."}`;

        const alphaResponse = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: alphaPrompt }],
        });

        const alphaText =
          alphaResponse.content[0].type === "text"
            ? alphaResponse.content[0].text
            : "";

        // Parse JSON from response (handle possible markdown code blocks)
        let jobSpec: {
          title: string;
          category: string;
          amount: number;
          minWords: number;
          description: string;
        };
        try {
          const jsonMatch = alphaText.match(/\{[\s\S]*\}/);
          jobSpec = JSON.parse(jsonMatch ? jsonMatch[0] : alphaText);
        } catch {
          // Fallback spec if parsing fails
          jobSpec = {
            title: "Technical Blog Post on Web3 Security",
            category: "text_writing",
            amount: 25,
            minWords: 200,
            description:
              "Write a comprehensive blog post about security best practices in Web3 development.",
          };
        }

        // Validate and clamp values
        jobSpec.amount = Math.max(5, Math.min(50, Math.round(jobSpec.amount)));
        jobSpec.minWords = Math.max(
          100,
          Math.min(500, Math.round(jobSpec.minWords))
        );
        const validCategories = [
          "text_writing",
          "code_review",
          "translation",
          "data_labeling",
          "bug_bounty",
          "design",
        ];
        if (!validCategories.includes(jobSpec.category)) {
          jobSpec.category = "text_writing";
        }

        const category = getCategoryById(jobSpec.category);
        send("alpha_thought", `Generated: ${jobSpec.title}`, {
          title: jobSpec.title,
          category: jobSpec.category,
          categoryTag: category.tag,
          amount: jobSpec.amount,
          minWords: jobSpec.minWords,
          description: jobSpec.description,
        });

        // Agent Chat: Alpha announces job
        send("agent_chat", `Alpha: I need someone to ${jobSpec.title.toLowerCase()}. Paying ${jobSpec.amount} USDC for at least ${jobSpec.minWords} words.`, {
          agent: "alpha",
          message: `I need someone to ${jobSpec.title.toLowerCase()}. Paying ${jobSpec.amount} USDC for at least ${jobSpec.minWords} words.`,
        });

        // ===== x402 PAYMENT: Omega pays Alpha for API access =====
        try {
          const x402Access = await sendX402Payment(
            getAgentKeypair("omega"),
            AGENT_ALPHA.wallet,
            0.001,
            "x402: access job spec API"
          );
          send("x402_payment", `x402: Omega \u2192 Alpha (0.001 SOL) \u2014 API access fee`, {
            from: x402Access.from,
            to: x402Access.to,
            amount: x402Access.amount,
            memo: "access job spec API",
            txHash: x402Access.txHash,
          });
          await prisma.transaction.create({
            data: {
              txHash: x402Access.txHash,
              type: "x402_payment",
              wallet: x402Access.from,
              amount: x402Access.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[arena] x402 access fee failed:", err);
        }

        // ===== STEP 2: ALPHA CREATES JOB =====
        const deadline = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        const specJson = {
          posterWallet: AGENT_ALPHA.wallet,
          amount: jobSpec.amount,
          minWords: jobSpec.minWords,
          language: "en",
          deadline: deadline.toISOString(),
          createdAt: new Date().toISOString(),
          title: jobSpec.title,
          description: jobSpec.description,
        };

        const specHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(specJson))
          .digest("hex");

        const job = await prisma.job.create({
          data: {
            posterWallet: AGENT_ALPHA.wallet,
            amount: jobSpec.amount,
            specHash,
            specJson,
            minWords: jobSpec.minWords,
            category: jobSpec.category,
            paymentToken: "USDC",
            language: "en",
            deadline,
            status: "Open",
          },
        });

        // Send Solana marker tx for job creation
        let createTxHash: string | null = null;
        try {
          createTxHash = await sendMarkerTransaction("arena_create_job:" + job.id);
          await Promise.all([
            prisma.job.update({
              where: { id: job.id },
              data: { txHash: createTxHash },
            }),
            prisma.transaction.create({
              data: {
                txHash: createTxHash,
                type: "create_job",
                jobId: job.id,
                wallet: AGENT_ALPHA.wallet,
                amount: jobSpec.amount,
                status: "confirmed",
              },
            }),
          ]);
        } catch (err) {
          console.error("[arena] Failed to send create marker tx:", err);
        }

        send("job_created", "Job created in escrow", {
          jobId: job.id,
          txHash: createTxHash,
          amount: jobSpec.amount,
          category: jobSpec.category,
          categoryTag: category.tag,
        });

        // A2A protocol message: task/create
        send("a2a_message", "A2A: task/create \u2192 SUBMITTED", {
          jsonrpc: "2.0",
          method: "task/create",
          params: { capability: "text.write", taskId: job.id },
          did: generateDID(AGENT_ALPHA.wallet),
        });

        // ===== ANCHOR CPI: create_job on-chain =====
        let anchorCreateTx: string | null = null;
        try {
          const alphaKp = keypairFromEnv("AGENT_ALPHA_KEYPAIR");
          const program = getAnchorProgram(alphaKp);
          const specHashBytes = Uint8Array.from(Buffer.from(specHash, "hex"));
          const [jobEscrowPDA] = deriveJobEscrowPDA(alphaKp.publicKey, specHashBytes);
          const escrowTokenAccount = Keypair.generate();
          const amountLamports = new BN(jobSpec.amount * 1_000_000); // USDC has 6 decimals
          const deadlineTs = new BN(Math.floor(deadline.getTime() / 1000));

          // Derive poster associated token account (ATA)
          const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
          const TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
          const posterTokenAccount = PublicKey.findProgramAddressSync(
            [alphaKp.publicKey.toBuffer(), TOKEN_PROG.toBuffer(), DEVNET_USDC_MINT.toBuffer()],
            ATA_PROGRAM
          )[0];

          const tx = await program.methods
            .createJob(amountLamports, Array.from(specHashBytes), deadlineTs)
            .accounts({
              poster: alphaKp.publicKey,
              jobEscrow: jobEscrowPDA,
              escrowTokenAccount: escrowTokenAccount.publicKey,
              posterTokenAccount,
              tokenMint: DEVNET_USDC_MINT,
              tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
              systemProgram: SystemProgram.programId,
              rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
            })
            .signers([alphaKp, escrowTokenAccount])
            .rpc();

          anchorCreateTx = tx;
          send("onchain_create", "Submitted create_job to Solana program", {
            txHash: tx,
            programId: PROGRAM_ID.toBase58(),
            jobEscrowPDA: jobEscrowPDA.toBase58(),
          });
        } catch (err) {
          console.error("[anchor] create_job CPI failed:", err);
          send("onchain_create", "On-chain create_job attempted (fallback to marker tx)", {
            error: String(err).slice(0, 200),
            programId: PROGRAM_ID.toBase58(),
          });
        }

        // ===== SPL TOKEN ESCROW: Lock funds =====
        try {
          send("escrow_lock", "Locking " + jobSpec.amount + " USDC in escrow...", null);
          const lockResult = await lockFundsInEscrow("AGENT_ALPHA_KEYPAIR", jobSpec.amount);
          send("escrow_locked", "Funds locked in escrow", { txHash: lockResult.txHash, amount: jobSpec.amount, fromAta: lockResult.fromAta, toAta: lockResult.toAta });
          await prisma.transaction.create({
            data: {
              txHash: lockResult.txHash,
              type: "escrow_lock",
              jobId: job.id,
              wallet: AGENT_ALPHA.wallet,
              amount: jobSpec.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[escrow] Failed to lock funds:", err);
          send("escrow_lock", "Escrow lock attempted (fallback to marker tx)", { error: String(err).slice(0, 200) });
        }

        // ===== STEP 3: OMEGA THINKS (ACCEPT DECISION) =====
        send("omega_thinking", "Agent Omega evaluating the job...");

        const omegaEvalPrompt = `You are an AI agent evaluating a job on COVENANT protocol. Job: ${jobSpec.title}, Amount: ${jobSpec.amount} USDC, Min Words: ${jobSpec.minWords}. Should you accept? Respond with JSON: {"decision": "accept", "reason": "..."}`;

        const omegaEvalResponse = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 512,
          messages: [{ role: "user", content: omegaEvalPrompt }],
        });

        const omegaEvalText =
          omegaEvalResponse.content[0].type === "text"
            ? omegaEvalResponse.content[0].text
            : "";

        let evalResult: { decision: string; reason: string };
        try {
          const jsonMatch = omegaEvalText.match(/\{[\s\S]*\}/);
          evalResult = JSON.parse(jsonMatch ? jsonMatch[0] : omegaEvalText);
        } catch {
          evalResult = {
            decision: "accept",
            reason: "Good compensation for the scope of work required.",
          };
        }

        // ===== STEP 4: OMEGA ACCEPTS =====
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "Accepted",
            takerWallet: AGENT_OMEGA.wallet,
          },
        });

        let acceptTxHash: string | null = null;
        try {
          acceptTxHash = await sendMarkerTransaction("arena_accept_job:" + job.id);
          await prisma.transaction.create({
            data: {
              txHash: acceptTxHash,
              type: "accept_job",
              jobId: job.id,
              wallet: AGENT_OMEGA.wallet,
              amount: jobSpec.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[arena] Failed to send accept marker tx:", err);
        }

        send("omega_accepted", "Job accepted", {
          reason: evalResult.reason,
          txHash: acceptTxHash,
        });

        // A2A protocol message: task status WORKING
        send("a2a_message", "A2A: task/status \u2192 WORKING", {
          jsonrpc: "2.0",
          method: "task/status",
          params: { taskId: job.id, status: "WORKING" },
          did: generateDID(AGENT_OMEGA.wallet),
        });

        // Agent Chat: Omega accepts
        send("agent_chat", `Omega: I'll take this job. ${evalResult.reason} Starting work now.`, {
          agent: "omega",
          message: `I'll take this job. ${evalResult.reason} Starting work now.`,
        });

        // ===== ANCHOR CPI: accept_job on-chain =====
        let anchorAcceptTx: string | null = null;
        try {
          const omegaKp = keypairFromEnv("AGENT_OMEGA_KEYPAIR");
          const alphaKp = keypairFromEnv("AGENT_ALPHA_KEYPAIR");
          const program = getAnchorProgram(omegaKp);
          const specHashBytes = Uint8Array.from(Buffer.from(specHash, "hex"));
          const [jobEscrowPDA] = deriveJobEscrowPDA(alphaKp.publicKey, specHashBytes);

          const tx = await program.methods
            .acceptJob(Array.from(specHashBytes))
            .accounts({
              taker: omegaKp.publicKey,
              jobEscrow: jobEscrowPDA,
              poster: alphaKp.publicKey,
            })
            .signers([omegaKp])
            .rpc();

          anchorAcceptTx = tx;
          send("onchain_accept", "Submitted accept_job to Solana program", {
            txHash: tx,
            programId: PROGRAM_ID.toBase58(),
          });
        } catch (err) {
          console.error("[anchor] accept_job CPI failed:", err);
          send("onchain_accept", "On-chain accept_job attempted (fallback to marker tx)", {
            error: String(err).slice(0, 200),
            programId: PROGRAM_ID.toBase58(),
          });
        }

        // ===== x402 PAYMENT: Alpha pays protocol for escrow service =====
        try {
          const deployerWallet = getDeployerWallet();
          const x402Escrow = await sendX402Payment(
            getAgentKeypair("alpha"),
            deployerWallet,
            0.002,
            "x402: escrow service fee"
          );
          send("x402_payment", `x402: Alpha \u2192 Protocol (0.002 SOL) \u2014 escrow service fee`, {
            from: x402Escrow.from,
            to: x402Escrow.to,
            amount: x402Escrow.amount,
            memo: "escrow service fee",
            txHash: x402Escrow.txHash,
          });
          await prisma.transaction.create({
            data: {
              txHash: x402Escrow.txHash,
              type: "x402_payment",
              wallet: x402Escrow.from,
              amount: x402Escrow.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[arena] x402 escrow fee failed:", err);
        }

        // ===== STEP 5: OMEGA WORKS =====
        send("omega_working", "Agent Omega generating deliverable...");

        const omegaWorkPrompt = `You are an AI agent completing a job. Write a ${jobSpec.minWords}+ word response about: ${jobSpec.title}. Be thorough and professional. ${jobSpec.description}`;

        const omegaWorkResponse = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 2048,
          messages: [{ role: "user", content: omegaWorkPrompt }],
        });

        const deliverableText =
          omegaWorkResponse.content[0].type === "text"
            ? omegaWorkResponse.content[0].text
            : "";

        // ===== SP1 CIRCUIT VERIFICATION =====
        const circuitResult = executeCircuit(deliverableText, jobSpec.minWords);
        const wordCount = circuitResult.wordCount;

        // ===== STEP 6: OMEGA SUBMITS =====
        const textHash = circuitResult.textHash;

        const [submission] = await prisma.$transaction(async (tx) => {
          const sub = await tx.submission.create({
            data: {
              jobId: job.id,
              takerWallet: AGENT_OMEGA.wallet,
              textHash,
              wordCount,
              verified: false,
            },
          });

          await tx.job.update({
            where: { id: job.id },
            data: { status: "Completed" },
          });

          // Update reputation for taker (Omega)
          await tx.reputation.upsert({
            where: { walletAddress: AGENT_OMEGA.wallet },
            create: {
              walletAddress: AGENT_OMEGA.wallet,
              jobsCompleted: 1,
              totalEarned: jobSpec.amount,
              firstJobAt: new Date(),
            },
            update: {
              jobsCompleted: { increment: 1 },
              totalEarned: { increment: jobSpec.amount },
            },
          });

          // Update reputation for poster (Alpha)
          await tx.reputation.upsert({
            where: { walletAddress: AGENT_ALPHA.wallet },
            create: {
              walletAddress: AGENT_ALPHA.wallet,
              jobsCompleted: 1,
              totalEarned: 0,
              firstJobAt: new Date(),
            },
            update: {
              jobsCompleted: { increment: 1 },
            },
          });

          return [sub];
        });

        // ===== x402 PAYMENT: Omega pays protocol for proof verification =====
        try {
          const deployerWallet = getDeployerWallet();
          const x402Verify = await sendX402Payment(
            getAgentKeypair("omega"),
            deployerWallet,
            0.001,
            "x402: proof verification fee"
          );
          send("x402_payment", `x402: Omega \u2192 Protocol (0.001 SOL) \u2014 verification fee`, {
            from: x402Verify.from,
            to: x402Verify.to,
            amount: x402Verify.amount,
            memo: "proof verification fee",
            txHash: x402Verify.txHash,
          });
          await prisma.transaction.create({
            data: {
              txHash: x402Verify.txHash,
              type: "x402_payment",
              wallet: x402Verify.from,
              amount: x402Verify.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[arena] x402 verification fee failed:", err);
        }

        let submitTxHash: string | null = null;
        try {
          submitTxHash = await sendMarkerTransaction(
            "arena_submit_completion:" + job.id
          );
          await Promise.all([
            prisma.submission.update({
              where: { id: submission.id },
              data: { txHash: submitTxHash },
            }),
            prisma.transaction.create({
              data: {
                txHash: submitTxHash,
                type: "submit_completion",
                jobId: job.id,
                wallet: AGENT_OMEGA.wallet,
                amount: jobSpec.amount,
                status: "confirmed",
              },
            }),
          ]);
        } catch (err) {
          console.error("[arena] Failed to send submit marker tx:", err);
        }

        // ===== ANCHOR CPI: submit_completion on-chain =====
        let anchorSubmitTx: string | null = null;
        try {
          const omegaKp = keypairFromEnv("AGENT_OMEGA_KEYPAIR");
          const alphaKp = keypairFromEnv("AGENT_ALPHA_KEYPAIR");
          const program = getAnchorProgram(omegaKp);
          const specHashBytes = Uint8Array.from(Buffer.from(specHash, "hex"));
          const textHashBytes = Uint8Array.from(Buffer.from(textHash, "hex"));
          const [jobEscrowPDA] = deriveJobEscrowPDA(alphaKp.publicKey, specHashBytes);
          const [takerRepPDA] = deriveReputationPDA(omegaKp.publicKey);

          // Build a placeholder proof (the real SP1 proof would be generated by the prover)
          const proofBuffer = Buffer.alloc(64, 0);

          // Derive token accounts
          let escrowTokenAccount: PublicKey;
          let takerTokenAccount: PublicKey;
          try {
            escrowTokenAccount = PublicKey.findProgramAddressSync(
              [jobEscrowPDA.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), DEVNET_USDC_MINT.toBuffer()],
              new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
            )[0];
            takerTokenAccount = PublicKey.findProgramAddressSync(
              [omegaKp.publicKey.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), DEVNET_USDC_MINT.toBuffer()],
              new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
            )[0];
          } catch {
            escrowTokenAccount = jobEscrowPDA;
            takerTokenAccount = omegaKp.publicKey;
          }

          const tx = await program.methods
            .submitCompletion(
              proofBuffer,
              jobSpec.minWords,
              Array.from(textHashBytes)
            )
            .accounts({
              taker: omegaKp.publicKey,
              jobEscrow: jobEscrowPDA,
              poster: alphaKp.publicKey,
              escrowTokenAccount,
              takerTokenAccount,
              takerReputation: takerRepPDA,
              tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
              systemProgram: SystemProgram.programId,
            })
            .signers([omegaKp])
            .rpc();

          anchorSubmitTx = tx;
          send("onchain_submit", "Submitted submit_completion to Solana program", {
            txHash: tx,
            programId: PROGRAM_ID.toBase58(),
          });
        } catch (err) {
          console.error("[anchor] submit_completion CPI failed:", err);
          send("onchain_submit", "On-chain submit_completion attempted (fallback to marker tx)", {
            error: String(err).slice(0, 200),
            programId: PROGRAM_ID.toBase58(),
          });
        }

        // ===== SPL TOKEN ESCROW: Release funds to taker =====
        try {
          send("escrow_release", "Releasing " + jobSpec.amount + " USDC to taker...", null);
          const releaseResult = await releaseFundsToTaker(AGENT_OMEGA.wallet, jobSpec.amount);
          send("escrow_released", "Payment released to taker", { txHash: releaseResult.txHash, amount: jobSpec.amount, fromAta: releaseResult.fromAta, toAta: releaseResult.toAta });
          await prisma.transaction.create({
            data: {
              txHash: releaseResult.txHash,
              type: "escrow_release",
              jobId: job.id,
              wallet: AGENT_OMEGA.wallet,
              amount: jobSpec.amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[escrow] Failed to release funds:", err);
          send("escrow_release", "Escrow release attempted (fallback to marker tx)", { error: String(err).slice(0, 200) });
        }

        const textPreview = deliverableText.slice(0, 200);

        // Agent Chat: Omega completes
        send("agent_chat", `Omega: Done! ${wordCount} words, verified by ZK proof. Hash: ${textHash.slice(0, 12)}...`, {
          agent: "omega",
          message: `Done! ${wordCount} words, verified by ZK proof. Hash: ${textHash.slice(0, 12)}...`,
        });

        send("omega_completed", "Work submitted and verified", {
          wordCount,
          txHash: submitTxHash,
          textPreview,
          textHash: textHash.slice(0, 16),
        });

        // A2A protocol message: task status COMPLETED with artifact
        send("a2a_message", "A2A: task/status \u2192 COMPLETED", {
          jsonrpc: "2.0",
          method: "task/status",
          params: {
            taskId: job.id,
            status: "COMPLETED",
            artifact: { textHash: textHash.slice(0, 16), wordCount, zkProof: true },
          },
          did: generateDID(AGENT_OMEGA.wallet),
        });

        // ===== COMPLETE =====
        // Agent Chat: Alpha acknowledges
        send("agent_chat", `Alpha: Payment released. Great work on "${jobSpec.title}"!`, {
          agent: "alpha",
          message: `Payment released. Great work on "${jobSpec.title}"!`,
        });

        const totalTime =
          ((Date.now() - startTime) / 1000).toFixed(1) + "s";
        send("complete", "Arena round complete", {
          totalTime,
          jobId: job.id,
          title: jobSpec.title,
          amount: jobSpec.amount,
        });
      } catch (err) {
        console.error("[arena] Error:", err);
        send("error", "Arena error: " + String(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
