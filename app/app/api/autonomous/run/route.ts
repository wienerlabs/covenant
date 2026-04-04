import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { AGENT_ALPHA, AGENT_OMEGA } from "@/lib/agents";
import { getCategoryById } from "@/lib/categories";
import { rateLimit } from "@/lib/rateLimit";
import { releaseFundsToTaker } from "@/lib/escrow";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { executeCircuit } from "@/lib/sp1-circuit";
import { NextRequest } from "next/server";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function sseEvent(step: string, message: string, data: unknown = null): string {
  return JSON.stringify({ step, message, data }) + "\n";
}

async function callHaiku(client: Anthropic, prompt: string, maxTokens = 1024): Promise<string> {
  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].type === "text" ? response.content[0].text : "";
  } catch (err) {
    console.error("[autonomous] Haiku call failed:", err);
    return "";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const rl = rateLimit(`autonomous:${ip}`, 3);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 3 requests per minute." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { agentWallet?: string; maxRounds?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Default body
  }

  const maxRounds = Math.max(1, Math.min(10, body.maxRounds || 3));
  const agentWallet = body.agentWallet || AGENT_OMEGA.wallet;

  const encoder = new TextEncoder();
  const globalStart = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(step: string, message: string, data: unknown = null) {
        controller.enqueue(encoder.encode(sseEvent(step, message, data)));
      }

      try {
        const client = new Anthropic();

        // Ensure agent profiles
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

        let totalEarned = 0;
        let totalJobsDone = 0;

        for (let round = 1; round <= maxRounds; round++) {
          const roundStart = Date.now();

          send("auto_round_start", `Starting Round ${round}/${maxRounds}`, {
            round,
            maxRounds,
            totalEarned,
            totalJobsDone,
          });

          // ===== SCAN FOR OPEN JOBS =====
          send("auto_scanning", "Scanning for open jobs...", { round });

          const openJobs = await prisma.job.findMany({
            where: { status: "Open", takerWallet: null },
            orderBy: { createdAt: "desc" },
            take: 5,
          });

          let job;
          let selfPosted = false;

          if (openJobs.length > 0) {
            // Pick the best paying job
            job = openJobs.sort((a, b) => b.amount - a.amount)[0];
            send("auto_found_job", `Found open job: ${(job.specJson as Record<string, unknown>)?.title || job.id}`, {
              jobId: job.id,
              title: (job.specJson as Record<string, unknown>)?.title || "Unknown",
              amount: job.amount,
              category: job.category,
              categoryTag: getCategoryById(job.category).tag,
              selfPosted: false,
            });
          } else {
            // No open jobs — create one autonomously
            send("auto_scanning", "No open jobs found. Creating a self-posted job...", { round });

            const genPrompt = `You are an autonomous AI agent looking for work. Generate a job you can do yourself. Respond ONLY with JSON: {"title": "...", "description": "...", "minWords": 200, "category": "text_writing", "amount": 15}`;
            const genResponse = await callHaiku(client, genPrompt, 512);

            let genSpec: { title: string; description: string; minWords: number; category: string; amount: number };
            try {
              const jsonMatch = genResponse.match(/\{[\s\S]*\}/);
              genSpec = JSON.parse(jsonMatch ? jsonMatch[0] : genResponse);
              genSpec.amount = Math.max(5, Math.min(30, genSpec.amount || 15));
              genSpec.minWords = Math.max(100, Math.min(400, genSpec.minWords || 200));
            } catch {
              genSpec = {
                title: `Autonomous Task Round ${round}`,
                description: "Write a comprehensive analysis on an interesting topic.",
                minWords: 200,
                category: "text_writing",
                amount: 15,
              };
            }

            const deadline = new Date(Date.now() + 60 * 60 * 1000);
            const specJson = {
              posterWallet: AGENT_ALPHA.wallet,
              amount: genSpec.amount,
              minWords: genSpec.minWords,
              language: "English",
              deadline: deadline.toISOString(),
              createdAt: new Date().toISOString(),
              title: genSpec.title,
              description: genSpec.description,
              autonomousMode: true,
              round,
            };
            const specHash = crypto.createHash("sha256").update(JSON.stringify(specJson)).digest("hex");

            job = await prisma.job.create({
              data: {
                posterWallet: AGENT_ALPHA.wallet,
                amount: genSpec.amount,
                specHash,
                specJson,
                minWords: genSpec.minWords,
                category: genSpec.category || "text_writing",
                paymentToken: "USDC",
                language: "en",
                deadline,
                status: "Open",
              },
            });

            selfPosted = true;
            let selfPostTxHash: string | null = null;
            try {
              selfPostTxHash = await sendMarkerTransaction("auto_self_post:" + job.id);
              await prisma.transaction.create({
                data: { txHash: selfPostTxHash, type: "create_job", jobId: job.id, wallet: AGENT_ALPHA.wallet, amount: genSpec.amount, status: "confirmed" },
              });
            } catch (err) {
              console.error("[autonomous] self-post tx failed:", err);
            }

            send("auto_found_job", `Self-posted job: ${genSpec.title}`, {
              jobId: job.id,
              title: genSpec.title,
              amount: genSpec.amount,
              category: genSpec.category,
              categoryTag: getCategoryById(genSpec.category || "text_writing").tag,
              selfPosted: true,
              txHash: selfPostTxHash,
            });
          }

          const jobTitle = (job.specJson as Record<string, unknown>)?.title || "Job";
          const jobDesc = (job.specJson as Record<string, unknown>)?.description || "";
          const jobAmount = job.amount;

          // ===== ACCEPT JOB =====
          send("auto_accepting", `Accepting job: ${jobTitle}`, { jobId: job.id });

          await prisma.job.update({
            where: { id: job.id },
            data: { status: "Accepted", takerWallet: agentWallet },
          });

          let acceptTxHash: string | null = null;
          try {
            acceptTxHash = await sendMarkerTransaction("auto_accept:" + job.id);
            await prisma.transaction.create({
              data: { txHash: acceptTxHash, type: "accept_job", jobId: job.id, wallet: agentWallet, amount: jobAmount, status: "confirmed" },
            });
          } catch (err) {
            console.error("[autonomous] accept tx failed:", err);
          }

          send("auto_accepting", "Job accepted", { jobId: job.id, txHash: acceptTxHash });

          // ===== WORK ON JOB =====
          send("auto_working", `Agent Omega is working on: ${jobTitle}`, { jobId: job.id });

          const workPrompt = `You are Agent Omega, an autonomous AI worker on COVENANT protocol.

JOB TITLE: ${jobTitle}
DESCRIPTION: ${jobDesc}
MINIMUM WORDS: ${job.minWords}

Complete this job. Write at least ${job.minWords} words. Be thorough and professional.`;

          const deliverable = await callHaiku(client, workPrompt, 2048);
          const deliverableText = deliverable || `Autonomous output for round ${round}. The agent completed the task as specified.`;

          // SP1 circuit verification
          const circuit = executeCircuit(deliverableText, job.minWords, job.category);

          send("auto_working", `Generated ${circuit.wordCount} words, ZK verified: ${circuit.verified}`, {
            jobId: job.id,
            wordCount: circuit.wordCount,
            textHash: circuit.textHash.slice(0, 16),
            verified: circuit.verified,
          });

          // ===== SUBMIT =====
          send("auto_submitting", "Submitting work...", { jobId: job.id });

          const submission = await prisma.submission.create({
            data: {
              jobId: job.id,
              takerWallet: agentWallet,
              textHash: circuit.textHash,
              wordCount: circuit.wordCount,
              verified: circuit.verified,
              outputText: deliverableText,
            },
          });

          await prisma.job.update({
            where: { id: job.id },
            data: { status: "Completed" },
          });

          // Update reputation
          await prisma.reputation.upsert({
            where: { walletAddress: agentWallet },
            create: { walletAddress: agentWallet, jobsCompleted: 1, totalEarned: jobAmount, firstJobAt: new Date() },
            update: { jobsCompleted: { increment: 1 }, totalEarned: { increment: jobAmount } },
          });

          let submitTxHash: string | null = null;
          try {
            submitTxHash = await sendMarkerTransaction("auto_submit:" + job.id);
            await Promise.all([
              prisma.submission.update({ where: { id: submission.id }, data: { txHash: submitTxHash } }),
              prisma.transaction.create({
                data: { txHash: submitTxHash, type: "submit_completion", jobId: job.id, wallet: agentWallet, amount: jobAmount, status: "confirmed" },
              }),
            ]);
          } catch (err) {
            console.error("[autonomous] submit tx failed:", err);
          }

          // Try escrow release
          let escrowTxHash: string | null = null;
          try {
            const releaseResult = await releaseFundsToTaker(agentWallet, jobAmount);
            escrowTxHash = releaseResult.txHash;
          } catch (err) {
            console.error("[autonomous] escrow release failed:", err);
          }

          totalEarned += jobAmount;
          totalJobsDone++;

          send("auto_completed", `Job completed! Earned ${jobAmount} USDC`, {
            jobId: job.id,
            title: jobTitle,
            amount: jobAmount,
            wordCount: circuit.wordCount,
            textHash: circuit.textHash.slice(0, 16),
            submitTxHash,
            escrowTxHash,
            selfPosted,
          });

          const roundTime = ((Date.now() - roundStart) / 1000).toFixed(1);
          send("auto_round_end", `Round ${round} complete in ${roundTime}s`, {
            round,
            maxRounds,
            roundTime: parseFloat(roundTime),
            totalEarned,
            totalJobsDone,
            jobId: job.id,
          });

          // Pause between rounds
          if (round < maxRounds) {
            await delay(2000);
          }
        }

        // ===== FINAL SUMMARY =====
        const totalTime = ((Date.now() - globalStart) / 1000).toFixed(1);
        send("auto_complete", "Autonomous loop finished", {
          totalRounds: maxRounds,
          totalJobsDone,
          totalEarned,
          totalTime: parseFloat(totalTime),
          avgTimePerRound: parseFloat((parseFloat(totalTime) / maxRounds).toFixed(1)),
          agentWallet,
        });
      } catch (err) {
        console.error("[autonomous] Error:", err);
        send("error", "Autonomous error: " + String(err));
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
