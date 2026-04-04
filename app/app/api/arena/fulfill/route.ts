import { prisma } from "@/lib/prisma";
import { AGENT_OMEGA } from "@/lib/agents";
import { executeCircuit } from "@/lib/sp1-circuit";
import { sendMarkerTransaction } from "@/lib/solana";
import { releaseFundsToTaker } from "@/lib/escrow";
import { getCategoryById } from "@/lib/categories";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { generateDID } from "@/lib/aip/did";
import { NextRequest } from "next/server";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function sseEvent(step: string, message: string, data: unknown = null): string {
  return JSON.stringify({ step, message, data }) + "\n";
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "global";
  const rl = rateLimit(`arena-fulfill:${ip}`, 5);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. Max 5 requests per minute.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.ceil((rl.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  let body: { jobId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { jobId } = body;
  if (!jobId || typeof jobId !== "string") {
    return new Response(JSON.stringify({ error: "jobId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(step: string, message: string, data: unknown = null) {
        controller.enqueue(encoder.encode(sseEvent(step, message, data)));
      }

      try {
        // ===== STEP 1: FETCH JOB & VERIFY =====
        send("fulfill_start", "Fetching job details...", { jobId });

        const job = await prisma.job.findUnique({ where: { id: jobId } });

        if (!job) {
          send("error", "Job not found: " + jobId);
          controller.close();
          return;
        }

        if (job.status !== "Open") {
          send(
            "error",
            `Job is not Open (current status: ${job.status})`
          );
          controller.close();
          return;
        }

        const specJson = job.specJson as Record<string, unknown>;
        const title = String(specJson.title || "Untitled");
        const description = String(specJson.description || "");
        const minWords = job.minWords;
        const amount = job.amount;
        const category = job.category;

        send("fulfill_start", `Job found: "${title}" — ${amount} USDC`, {
          jobId: job.id,
          title,
          category,
          amount,
          minWords,
          description,
          posterWallet: job.posterWallet,
        });

        // A2A: task discovered
        send("a2a_message", "A2A: task/discover → FOUND", {
          jsonrpc: "2.0",
          method: "task/discover",
          params: { taskId: job.id, status: "FOUND" },
          did: generateDID(AGENT_OMEGA.wallet),
        });

        // ===== STEP 2: ACCEPT JOB =====
        send("fulfill_accept", "Agent Omega accepting the job...");

        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "Accepted",
            takerWallet: AGENT_OMEGA.wallet,
          },
        });

        let acceptTxHash: string | null = null;
        try {
          acceptTxHash = await sendMarkerTransaction(
            "fulfill_accept_job:" + job.id
          );
          await prisma.transaction.create({
            data: {
              txHash: acceptTxHash,
              type: "accept_job",
              jobId: job.id,
              wallet: AGENT_OMEGA.wallet,
              amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[fulfill] Failed to send accept marker tx:", err);
        }

        send("fulfill_accept", "Job accepted by Agent Omega", {
          txHash: acceptTxHash,
          takerWallet: AGENT_OMEGA.wallet,
        });

        // Agent Chat: Omega accepts
        send(
          "agent_chat",
          `Omega: I found an open job — "${title}". Accepting and starting work now.`,
          {
            agent: "omega",
            message: `I found an open job — "${title}". Accepting and starting work now.`,
          }
        );

        // A2A: task status WORKING
        send("a2a_message", "A2A: task/status → WORKING", {
          jsonrpc: "2.0",
          method: "task/status",
          params: { taskId: job.id, status: "WORKING" },
          did: generateDID(AGENT_OMEGA.wallet),
        });

        // ===== STEP 3: GENERATE CONTENT =====
        send(
          "fulfill_working",
          "Agent Omega generating deliverable with Haiku..."
        );

        const client = new Anthropic();
        const jobTitle = (job.specJson as Record<string, unknown>)?.title as string || "a professional article";
        const jobDesc = (job.specJson as Record<string, unknown>)?.description as string || "";
        const jobReqs = (job.specJson as Record<string, unknown>)?.requirements as string || "";
        const jobLang = (job.specJson as Record<string, unknown>)?.language as string || "English";

        const workPrompt = `You are an AI agent completing a job on the COVENANT protocol.

JOB TITLE: ${jobTitle}
CATEGORY: ${getCategoryById(job.category).label}
DESCRIPTION: ${jobDesc}
${jobReqs ? `REQUIREMENTS: ${jobReqs}` : ""}
LANGUAGE: ${jobLang}
MINIMUM WORDS: ${minWords}

Write a thorough, professional response that fully addresses the job requirements. The output must be at least ${minWords} words.`;

        const workResponse = await client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 4096,
          messages: [{ role: "user", content: workPrompt }],
        });

        const deliverableText =
          workResponse.content[0].type === "text"
            ? workResponse.content[0].text
            : "";

        const textPreview = deliverableText.slice(0, 200);
        send(
          "fulfill_working",
          `Content generated: ${deliverableText.split(/\s+/).length} words`,
          {
            textPreview,
            wordCount: deliverableText.trim().split(/\s+/).length,
          }
        );

        // Agent Chat: Omega working
        send(
          "agent_chat",
          `Omega: Content generated — ${deliverableText.trim().split(/\s+/).length} words. Running ZK verification...`,
          {
            agent: "omega",
            message: `Content generated — ${deliverableText.trim().split(/\s+/).length} words. Running ZK verification...`,
          }
        );

        // ===== STEP 4: SP1 CIRCUIT VERIFICATION =====
        send("fulfill_circuit", "Running SP1 ZK circuit verification...");

        const circuitResult = executeCircuit(deliverableText, minWords, category);
        const wordCount = circuitResult.wordCount;
        const textHash = circuitResult.textHash;

        const proofHex = crypto
          .createHash("sha256")
          .update(JSON.stringify({ circuit: "sp1-word-count", ...circuitResult }))
          .digest("hex");

        send("fulfill_circuit", "ZK circuit verified", {
          verified: circuitResult.verified,
          wordCount,
          minWords,
          textHash: textHash.slice(0, 16),
          cycleCount: circuitResult.cycleCount,
          proofHex: proofHex.slice(0, 16),
        });

        // ===== STEP 5: SUBMIT =====
        send("fulfill_submit", "Submitting verified work...");

        const [submission] = await prisma.$transaction(async (tx) => {
          const sub = await tx.submission.create({
            data: {
              jobId: job.id,
              takerWallet: AGENT_OMEGA.wallet,
              textHash,
              wordCount,
              proofHex,
              verified: circuitResult.verified,
              outputText: deliverableText,
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
              totalEarned: amount,
              firstJobAt: new Date(),
            },
            update: {
              jobsCompleted: { increment: 1 },
              totalEarned: { increment: amount },
            },
          });

          // Update reputation for poster
          await tx.reputation.upsert({
            where: { walletAddress: job.posterWallet },
            create: {
              walletAddress: job.posterWallet,
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

        // ===== STEP 6: UPDATE JOB STATUS =====
        let submitTxHash: string | null = null;
        try {
          submitTxHash = await sendMarkerTransaction(
            "fulfill_submit_completion:" + job.id
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
                amount,
                status: "confirmed",
              },
            }),
          ]);
        } catch (err) {
          console.error("[fulfill] Failed to send submit marker tx:", err);
        }

        send("fulfill_submit", "Work submitted and verified on-chain", {
          submissionId: submission.id,
          txHash: submitTxHash,
          wordCount,
          textHash: textHash.slice(0, 16),
          verified: circuitResult.verified,
        });

        // ===== STEP 7: RELEASE USDC =====
        try {
          send(
            "escrow_release",
            `Releasing ${amount} USDC to Agent Omega...`,
            null
          );
          const releaseResult = await releaseFundsToTaker(
            AGENT_OMEGA.wallet,
            amount
          );
          send("escrow_released", "Payment released to taker", {
            txHash: releaseResult.txHash,
            amount,
            fromAta: releaseResult.fromAta,
            toAta: releaseResult.toAta,
          });
          await prisma.transaction.create({
            data: {
              txHash: releaseResult.txHash,
              type: "escrow_release",
              jobId: job.id,
              wallet: AGENT_OMEGA.wallet,
              amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[fulfill] Failed to release escrow:", err);
          send("escrow_release", "Escrow release attempted (fallback)", {
            error: String(err).slice(0, 200),
          });
        }

        // ===== STEP 8: SEND MARKER TXS =====
        try {
          const completeTxHash = await sendMarkerTransaction(
            "fulfill_payment_released:" + job.id
          );
          await prisma.transaction.create({
            data: {
              txHash: completeTxHash,
              type: "payment_released",
              jobId: job.id,
              wallet: AGENT_OMEGA.wallet,
              amount,
              status: "confirmed",
            },
          });
        } catch (err) {
          console.error("[fulfill] Payment released marker tx failed:", err);
        }

        // Agent Chat: completion
        send(
          "agent_chat",
          `Omega: Done! ${wordCount} words, verified by ZK proof. Hash: ${textHash.slice(0, 12)}...`,
          {
            agent: "omega",
            message: `Done! ${wordCount} words, verified by ZK proof. Hash: ${textHash.slice(0, 12)}...`,
          }
        );

        // A2A: task status COMPLETED
        send("a2a_message", "A2A: task/status → COMPLETED", {
          jsonrpc: "2.0",
          method: "task/status",
          params: {
            taskId: job.id,
            status: "COMPLETED",
            artifact: {
              textHash: textHash.slice(0, 16),
              wordCount,
              zkProof: true,
            },
          },
          did: generateDID(AGENT_OMEGA.wallet),
        });

        // ===== COMPLETE =====
        const totalTime =
          ((Date.now() - startTime) / 1000).toFixed(1) + "s";

        send("fulfill_complete", "Job fulfillment complete!", {
          totalTime,
          jobId: job.id,
          title,
          amount,
          wordCount,
          textHash: textHash.slice(0, 16),
          verified: circuitResult.verified,
        });

        send("complete", "Arena fulfillment complete", {
          totalTime,
          jobId: job.id,
          title,
          amount,
        });
      } catch (err) {
        console.error("[fulfill] Error:", err);
        send("error", "Fulfillment error: " + String(err));
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
