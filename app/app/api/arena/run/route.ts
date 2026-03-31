import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { sendX402Payment, getAgentKeypair } from "@/lib/x402";
import { AGENT_ALPHA, AGENT_OMEGA } from "@/lib/agents";
import { getCategoryById } from "@/lib/categories";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { Keypair } from "@solana/web3.js";

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

export async function POST() {
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

        const wordCount = deliverableText
          .split(/\s+/)
          .filter((w) => w.length > 0).length;

        // ===== STEP 6: OMEGA SUBMITS =====
        const textHash = crypto
          .createHash("sha256")
          .update(deliverableText)
          .digest("hex");

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

        const textPreview = deliverableText.slice(0, 200);

        send("omega_completed", "Work submitted and verified", {
          wordCount,
          txHash: submitTxHash,
          textPreview,
          textHash: textHash.slice(0, 16),
        });

        // ===== COMPLETE =====
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
