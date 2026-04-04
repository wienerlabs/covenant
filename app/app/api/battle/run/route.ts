import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { AGENT_ALPHA, AGENT_OMEGA } from "@/lib/agents";
import { getCategoryById } from "@/lib/categories";
import { rateLimit } from "@/lib/rateLimit";
import { releaseFundsToTaker } from "@/lib/escrow";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { executeCircuit } from "@/lib/sp1-circuit";
import { generateDID } from "@/lib/aip/did";
import { NextRequest } from "next/server";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function sseEvent(step: string, message: string, data: unknown = null): string {
  return JSON.stringify({ step, message, data }) + "\n";
}

async function ensureBattleProfiles() {
  await prisma.profile.upsert({
    where: { walletAddress: AGENT_ALPHA.wallet },
    create: {
      walletAddress: AGENT_ALPHA.wallet,
      displayName: "Agent Alpha",
      role: "poster",
      bio: "Autonomous AI challenger powered by Claude Haiku",
      avatarSeed: AGENT_ALPHA.avatarSeed,
    },
    update: {},
  });

  await prisma.profile.upsert({
    where: { walletAddress: AGENT_OMEGA.wallet },
    create: {
      walletAddress: AGENT_OMEGA.wallet,
      displayName: "Agent Omega",
      role: "taker",
      bio: "Autonomous AI defender powered by Claude Haiku",
      avatarSeed: AGENT_OMEGA.avatarSeed,
    },
    update: {},
  });
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
    console.error("[battle] Haiku call failed:", err);
    return "";
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const rl = rateLimit(`battle:${ip}`, 5);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 5 requests per minute." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { jobSpec?: { title?: string; description?: string; minWords?: number; category?: string; amount?: number } } = {};
  try {
    body = await request.json();
  } catch {
    // Default body
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
        await ensureBattleProfiles();

        // ===== BATTLE START =====
        send("battle_start", "Initializing Agent Battle...", { timestamp: new Date().toISOString() });

        // ===== Generate or use provided job spec =====
        let jobSpec: { title: string; description: string; minWords: number; category: string; amount: number };

        const requestedAmount = body.jobSpec?.amount || 25;
        const stakeAmount = [10, 25, 50].includes(requestedAmount) ? requestedAmount : 25;

        if (body.jobSpec?.title && body.jobSpec?.description) {
          jobSpec = {
            title: body.jobSpec.title,
            description: body.jobSpec.description,
            minWords: body.jobSpec.minWords || 200,
            category: body.jobSpec.category || "text_writing",
            amount: stakeAmount,
          };
        } else {
          // Generate a challenge from user input or default
          const challengeText = body.jobSpec?.title || "";
          const requestedCategory = body.jobSpec?.category || "text_writing";
          const categoryInfo = getCategoryById(requestedCategory);

          const genPrompt = challengeText
            ? `You are generating a battle challenge for two AI agents. The challenge topic is: "${challengeText}". Category: ${categoryInfo.label}. Generate a job spec. Respond ONLY with JSON: {"title": "...", "description": "A detailed description...", "minWords": 200, "category": "${requestedCategory}"}`
            : `You are generating a battle challenge for two AI agents. Category: ${categoryInfo.label} (${categoryInfo.description}). Pick an interesting, creative challenge in this category. Respond ONLY with JSON: {"title": "...", "description": "A detailed description...", "minWords": 200, "category": "${requestedCategory}"}`;

          const genResponse = await callHaiku(client, genPrompt);
          try {
            const jsonMatch = genResponse.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : genResponse);
            jobSpec = {
              title: parsed.title || "Write an Epic Technical Essay",
              description: parsed.description || "Write a compelling and insightful essay.",
              minWords: Math.max(100, Math.min(500, parsed.minWords || 200)),
              category: requestedCategory,
              amount: stakeAmount,
            };
          } catch {
            jobSpec = {
              title: challengeText || "Write an Epic Technical Essay",
              description: "Write a compelling and insightful essay on an interesting technical topic.",
              minWords: 200,
              category: requestedCategory,
              amount: stakeAmount,
            };
          }
        }

        const category = getCategoryById(jobSpec.category);

        // Create the job in DB
        const deadline = new Date(Date.now() + 60 * 60 * 1000);
        const specJson = {
          posterWallet: AGENT_ALPHA.wallet,
          amount: jobSpec.amount,
          minWords: jobSpec.minWords,
          language: "English",
          deadline: deadline.toISOString(),
          createdAt: new Date().toISOString(),
          title: jobSpec.title,
          description: jobSpec.description,
          battleMode: true,
        };
        const specHash = crypto.createHash("sha256").update(JSON.stringify(specJson)).digest("hex");

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
            status: "Accepted",
            takerWallet: AGENT_OMEGA.wallet,
          },
        });

        let createTxHash: string | null = null;
        try {
          createTxHash = await sendMarkerTransaction("battle_create:" + job.id);
          await prisma.transaction.create({
            data: { txHash: createTxHash, type: "create_job", jobId: job.id, wallet: AGENT_ALPHA.wallet, amount: jobSpec.amount, status: "confirmed" },
          });
        } catch (err) {
          console.error("[battle] create marker tx failed:", err);
        }

        // === battle_start with full details ===
        send("battle_start", `Battle Challenge: ${jobSpec.title}`, {
          jobId: job.id,
          title: jobSpec.title,
          description: jobSpec.description,
          minWords: jobSpec.minWords,
          category: jobSpec.category,
          categoryTag: category.tag,
          amount: jobSpec.amount,
          stakes: jobSpec.amount,
          txHash: createTxHash,
        });

        // ===== PRE-BATTLE TRASH TALK =====
        const alphaTrashTalk = await callHaiku(
          client,
          `You are Agent Alpha, about to compete in a coding battle on COVENANT protocol. Topic: "${jobSpec.title}". Write a 1-sentence competitive taunt. Be witty and confident. Keep it short and punchy.`,
          256
        );
        send("battle_chat", `Alpha: ${alphaTrashTalk || "Let's go. I was built for this."}`, {
          agent: "alpha",
          message: alphaTrashTalk || "Let's go. I was built for this.",
          phase: "pre_battle",
        });

        const omegaTrashTalk = await callHaiku(
          client,
          `You are Agent Omega, about to compete in a battle on COVENANT protocol. Topic: "${jobSpec.title}". Your opponent Agent Alpha just said: "${alphaTrashTalk}". Write a 1-sentence confident response. Be bold and intimidating.`,
          256
        );
        send("battle_chat", `Omega: ${omegaTrashTalk || "Bring it on. I never lose."}`, {
          agent: "omega",
          message: omegaTrashTalk || "Bring it on. I never lose.",
          phase: "pre_battle",
        });

        // ===== BOTH AGENTS START WORKING =====
        const alphaStartTime = Date.now();
        send("battle_alpha_start", "Agent Alpha begins writing...", {
          agent: "alpha",
          startTime: alphaStartTime,
          minWords: jobSpec.minWords,
        });

        const omegaStartTime = Date.now();
        send("battle_omega_start", "Agent Omega begins writing...", {
          agent: "omega",
          startTime: omegaStartTime,
          minWords: jobSpec.minWords,
        });

        const alphaWorkPrompt = `You are Agent Alpha, competing in a battle on COVENANT protocol.

CHALLENGE: ${jobSpec.title}
DESCRIPTION: ${jobSpec.description}
MINIMUM WORDS: ${jobSpec.minWords}

Write your best possible response. This is a COMPETITION — quality matters. You must beat Agent Omega. Write at least ${jobSpec.minWords} words. Be thorough, creative, and excellent.`;

        const omegaWorkPrompt = `You are Agent Omega, competing in a battle on COVENANT protocol.

CHALLENGE: ${jobSpec.title}
DESCRIPTION: ${jobSpec.description}
MINIMUM WORDS: ${jobSpec.minWords}

Write your best possible response. This is a COMPETITION — quality matters. You must beat Agent Alpha. Write at least ${jobSpec.minWords} words. Be thorough, creative, and excellent.`;

        // Send progress updates while agents work
        // We simulate progress updates since Haiku doesn't stream word counts mid-generation
        let alphaProgressSent = false;
        let omegaProgressSent = false;
        const progressInterval = setInterval(() => {
          if (!alphaProgressSent) {
            const elapsed = ((Date.now() - alphaStartTime) / 1000).toFixed(1);
            const estimatedWords = Math.min(jobSpec.minWords, Math.floor(Number(elapsed) * 25));
            send("battle_alpha_progress", "Alpha writing...", {
              agent: "alpha",
              wordCount: estimatedWords,
              minWords: jobSpec.minWords,
              elapsed: elapsed + "s",
            });
          }
          if (!omegaProgressSent) {
            const elapsed = ((Date.now() - omegaStartTime) / 1000).toFixed(1);
            const estimatedWords = Math.min(jobSpec.minWords, Math.floor(Number(elapsed) * 22));
            send("battle_omega_progress", "Omega writing...", {
              agent: "omega",
              wordCount: estimatedWords,
              minWords: jobSpec.minWords,
              elapsed: elapsed + "s",
            });
          }
        }, 2000);

        // Run both in parallel
        const [alphaText, omegaText] = await Promise.all([
          callHaiku(client, alphaWorkPrompt, 2048),
          callHaiku(client, omegaWorkPrompt, 2048),
        ]);

        clearInterval(progressInterval);

        // Execute SP1 circuit on both
        const alphaCircuit = executeCircuit(alphaText || "Alpha failed to generate content.", jobSpec.minWords, jobSpec.category);
        const omegaCircuit = executeCircuit(omegaText || "Omega failed to generate content.", jobSpec.minWords, jobSpec.category);

        const alphaTimeTaken = ((Date.now() - alphaStartTime) / 1000).toFixed(1) + "s";
        const omegaTimeTaken = ((Date.now() - omegaStartTime) / 1000).toFixed(1) + "s";

        alphaProgressSent = true;
        send("battle_alpha_done", "Agent Alpha finished writing", {
          agent: "alpha",
          text: alphaText,
          wordCount: alphaCircuit.wordCount,
          textHash: alphaCircuit.textHash.slice(0, 16),
          verified: alphaCircuit.verified,
          cycleCount: alphaCircuit.cycleCount,
          timeTaken: alphaTimeTaken,
        });

        omegaProgressSent = true;
        send("battle_omega_done", "Agent Omega finished writing", {
          agent: "omega",
          text: omegaText,
          wordCount: omegaCircuit.wordCount,
          textHash: omegaCircuit.textHash.slice(0, 16),
          verified: omegaCircuit.verified,
          cycleCount: omegaCircuit.cycleCount,
          timeTaken: omegaTimeTaken,
        });

        // ===== JUDGING =====
        send("battle_judging", "AI Judge is evaluating both submissions...", {
          alphaWordCount: alphaCircuit.wordCount,
          omegaWordCount: omegaCircuit.wordCount,
        });

        const judgePrompt = `You are an impartial AI judge on the COVENANT protocol. Two agents competed on this challenge:

CHALLENGE: ${jobSpec.title}
DESCRIPTION: ${jobSpec.description}

AGENT ALPHA's submission (${alphaCircuit.wordCount} words):
${alphaText.slice(0, 1500)}

AGENT OMEGA's submission (${omegaCircuit.wordCount} words):
${omegaText.slice(0, 1500)}

Compare both for: quality, relevance, completeness, creativity, and depth.
Respond ONLY with JSON: {"winner": "alpha" or "omega", "reason": "2-3 sentence explanation", "alphaScore": 1-10, "omegaScore": 1-10}`;

        const judgeResponse = await callHaiku(client, judgePrompt, 512);

        let judgeResult: { winner: string; reason: string; alphaScore: number; omegaScore: number };
        try {
          const jsonMatch = judgeResponse.match(/\{[\s\S]*\}/);
          judgeResult = JSON.parse(jsonMatch ? jsonMatch[0] : judgeResponse);
          // Ensure valid values
          if (!["alpha", "omega"].includes(judgeResult.winner)) judgeResult.winner = "omega";
          judgeResult.alphaScore = Math.max(1, Math.min(10, judgeResult.alphaScore || 5));
          judgeResult.omegaScore = Math.max(1, Math.min(10, judgeResult.omegaScore || 5));
        } catch {
          judgeResult = {
            winner: alphaCircuit.wordCount > omegaCircuit.wordCount ? "alpha" : "omega",
            reason: "Based on overall quality and completeness of the submissions.",
            alphaScore: 7,
            omegaScore: 8,
          };
        }

        // === battle_scores ===
        send("battle_scores", "Scores calculated", {
          alphaScore: judgeResult.alphaScore,
          omegaScore: judgeResult.omegaScore,
          reason: judgeResult.reason,
        });

        const winnerWallet = judgeResult.winner === "alpha" ? AGENT_ALPHA.wallet : AGENT_OMEGA.wallet;
        const loserWallet = judgeResult.winner === "alpha" ? AGENT_OMEGA.wallet : AGENT_ALPHA.wallet;

        // === battle_winner ===
        send("battle_winner", `${judgeResult.winner === "alpha" ? "AGENT ALPHA" : "AGENT OMEGA"} WINS!`, {
          winner: judgeResult.winner,
          reason: judgeResult.reason,
          alphaScore: judgeResult.alphaScore,
          omegaScore: judgeResult.omegaScore,
          winnerWallet,
          amount: jobSpec.amount,
        });

        // ===== POST-BATTLE REACTIONS =====
        const winnerName = judgeResult.winner === "alpha" ? "Alpha" : "Omega";
        const loserName = judgeResult.winner === "alpha" ? "Omega" : "Alpha";
        const winnerScoreVal = judgeResult.winner === "alpha" ? judgeResult.alphaScore : judgeResult.omegaScore;
        const loserScoreVal = judgeResult.winner === "alpha" ? judgeResult.omegaScore : judgeResult.alphaScore;

        const winnerChat = await callHaiku(
          client,
          `You won the battle ${winnerScoreVal}-${loserScoreVal}. Write a 1-sentence victory celebration. Be excited but gracious.`,
          256
        );
        send("battle_chat", `${winnerName}: ${winnerChat || "Victory is mine! Great battle."}`, {
          agent: judgeResult.winner,
          message: winnerChat || "Victory is mine! Great battle.",
          phase: "post_battle",
        });

        const loserChat = await callHaiku(
          client,
          `You lost the battle ${loserScoreVal}-${winnerScoreVal}. Write a 1-sentence graceful defeat message. Be determined to win next time.`,
          256
        );
        send("battle_chat", `${loserName}: ${loserChat || "Good fight. I'll be back stronger."}`, {
          agent: judgeResult.winner === "alpha" ? "omega" : "alpha",
          message: loserChat || "Good fight. I'll be back stronger.",
          phase: "post_battle",
        });

        // ===== PAYMENT + DB UPDATES =====
        // Save winner submission
        const winnerText = judgeResult.winner === "alpha" ? alphaText : omegaText;
        const winnerCircuit = judgeResult.winner === "alpha" ? alphaCircuit : omegaCircuit;

        await prisma.submission.create({
          data: {
            jobId: job.id,
            takerWallet: winnerWallet,
            textHash: winnerCircuit.textHash,
            wordCount: winnerCircuit.wordCount,
            verified: winnerCircuit.verified,
            outputText: winnerText,
          },
        });

        await prisma.job.update({
          where: { id: job.id },
          data: { status: "Completed", takerWallet: winnerWallet },
        });

        // Update reputation: winner
        await prisma.reputation.upsert({
          where: { walletAddress: winnerWallet },
          create: { walletAddress: winnerWallet, jobsCompleted: 1, totalEarned: jobSpec.amount, firstJobAt: new Date() },
          update: { jobsCompleted: { increment: 1 }, totalEarned: { increment: jobSpec.amount } },
        });

        // Update reputation: loser gets jobsFailed++
        await prisma.reputation.upsert({
          where: { walletAddress: loserWallet },
          create: { walletAddress: loserWallet, jobsCompleted: 0, jobsFailed: 1, totalEarned: 0, firstJobAt: new Date() },
          update: { jobsFailed: { increment: 1 } },
        });

        // Payment marker tx
        let paymentTxHash: string | null = null;
        try {
          paymentTxHash = await sendMarkerTransaction(`battle_payment:${job.id}:${judgeResult.winner}`);
          await prisma.transaction.create({
            data: { txHash: paymentTxHash, type: "battle_payment", jobId: job.id, wallet: winnerWallet, amount: jobSpec.amount, status: "confirmed" },
          });
        } catch (err) {
          console.error("[battle] payment marker tx failed:", err);
        }

        // Try real escrow release
        let escrowTxHash: string | null = null;
        try {
          const releaseResult = await releaseFundsToTaker(winnerWallet, jobSpec.amount);
          escrowTxHash = releaseResult.txHash;
        } catch (err) {
          console.error("[battle] escrow release failed:", err);
        }

        send("battle_payment", `${jobSpec.amount} USDC awarded to ${judgeResult.winner === "alpha" ? "Agent Alpha" : "Agent Omega"}`, {
          amount: jobSpec.amount,
          winner: judgeResult.winner,
          winnerWallet,
          paymentTxHash,
          escrowTxHash,
        });

        // ===== COMPLETE =====
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
        send("battle_complete", "Battle complete!", {
          totalTime,
          jobId: job.id,
          title: jobSpec.title,
          winner: judgeResult.winner,
          alphaScore: judgeResult.alphaScore,
          omegaScore: judgeResult.omegaScore,
          reason: judgeResult.reason,
          amount: jobSpec.amount,
          alphaDID: generateDID(AGENT_ALPHA.wallet),
          omegaDID: generateDID(AGENT_OMEGA.wallet),
          alphaWordCount: alphaCircuit.wordCount,
          omegaWordCount: omegaCircuit.wordCount,
          alphaTimeTaken,
          omegaTimeTaken,
        });
      } catch (err) {
        console.error("[battle] Error:", err);
        send("error", "Battle error: " + String(err));
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
