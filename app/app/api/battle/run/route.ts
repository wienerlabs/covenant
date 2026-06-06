import { prisma, ensureSchema } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { AGENT_ALPHA, AGENT_OMEGA } from "@/lib/agents";
import { getCategoryById } from "@/lib/categories";
import { rateLimit, getLimit } from "@/lib/rateLimit";
// NOTE: battle/run is a head-less DEMO route. Real fund movement is
// handled on chain via the standard create_job → submit_work →
// finalize_payment flow (see lib/program-server.ts botCreateJob /
// botFinalizePayment for the bot-signed equivalent). This handler
// records demo events only; no USDC moves through a shared deployer
// wallet. The previous custodial `releaseFundsToTaker` call was
// removed as part of the on-chain settlement refactor (audit C-01).
import Anthropic from "@anthropic-ai/sdk";
import { withCreditFallback } from "@/lib/anthropic-safe";
import crypto from "crypto";
import { executeCircuit } from "@/lib/work-metrics";
import { generateDID } from "@/lib/aip/did";
import { awardXP } from "@/lib/xp";
import { NextRequest } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";

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
  const blocked = blockSimulatedRouteIfOnchain("POST /api/battle/run");
  if (blocked) return blocked;

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const { limit, windowMs } = getLimit("battle_run");
  const rl = rateLimit(`battle:${ip}`, limit, windowMs);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 5 requests per minute." }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  interface CustomAgent {
    id?: string;
    name?: string;
    systemPrompt?: string;
    model?: string;
    wallet?: string;
  }
  let body: {
    jobSpec?: { title?: string; description?: string; minWords?: number; category?: string; amount?: number };
    customAlpha?: CustomAgent;
    customOmega?: CustomAgent;
    battleId?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // Default body
  }

  // Custom agents override the default AGENT_ALPHA / AGENT_OMEGA personas.
  // When a side is customized, we use the user's systemPrompt + name in
  // prompts / chat events, and set a pseudo-wallet so stats attribution
  // doesn't falsely credit the default bots. Falling back to the defaults
  // ensures the arena demo still works without custom selections.
  const alphaPersona = {
    name: body.customAlpha?.name?.trim() || "Agent Alpha",
    systemPrompt: body.customAlpha?.systemPrompt?.trim() || "",
    wallet: body.customAlpha?.wallet || AGENT_ALPHA.wallet,
    id: body.customAlpha?.id || null,
    isCustom: Boolean(body.customAlpha?.name),
  };
  const omegaPersona = {
    name: body.customOmega?.name?.trim() || "Agent Omega",
    systemPrompt: body.customOmega?.systemPrompt?.trim() || "",
    wallet: body.customOmega?.wallet || AGENT_OMEGA.wallet,
    id: body.customOmega?.id || null,
    isCustom: Boolean(body.customOmega?.name),
  };
  const battleIdFromClient = body.battleId?.trim() || null;

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(step: string, message: string, data: unknown = null) {
        controller.enqueue(encoder.encode(sseEvent(step, message, data)));
      }

      try {
        // Make sure the DB schema is up-to-date before we touch any
        // tables. If the production DB is behind schema.prisma (new
        // columns / tables missing), ensureSchema runs idempotent
        // ALTER / CREATE IF NOT EXISTS statements via raw SQL.
        await ensureSchema();

        const client = withCreditFallback(new Anthropic());
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

        // Explicit `select:` — return ONLY fields we actually consume
        // downstream. This protects against schema-drift on newer
        // columns (escrowAta, pda, claim relation, etc.) that may
        // not yet exist on the production DB when Prisma Client was
        // generated from a newer schema. Without this, create() does
        // SELECT * after INSERT and blows up on any missing column.
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
          select: { id: true, amount: true, posterWallet: true, takerWallet: true },
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
        const alphaSystemLine = alphaPersona.systemPrompt
          ? `Character brief for you: ${alphaPersona.systemPrompt}\n\n`
          : "";
        const omegaSystemLine = omegaPersona.systemPrompt
          ? `Character brief for you: ${omegaPersona.systemPrompt}\n\n`
          : "";

        const alphaTrashTalk = await callHaiku(
          client,
          `${alphaSystemLine}You are ${alphaPersona.name}, about to compete in a coding battle on COVENANT protocol against ${omegaPersona.name}. Topic: "${jobSpec.title}". Write a 1-sentence competitive taunt in character. Be witty and confident. Keep it short and punchy.`,
          256
        );
        send("battle_chat", `${alphaPersona.name}: ${alphaTrashTalk || "Let's go. I was built for this."}`, {
          agent: "alpha",
          agentName: alphaPersona.name,
          message: alphaTrashTalk || "Let's go. I was built for this.",
          phase: "pre_battle",
        });

        const omegaTrashTalk = await callHaiku(
          client,
          `${omegaSystemLine}You are ${omegaPersona.name}, about to compete in a battle on COVENANT protocol against ${alphaPersona.name}. Topic: "${jobSpec.title}". Your opponent ${alphaPersona.name} just said: "${alphaTrashTalk}". Write a 1-sentence confident response in character. Be bold and intimidating.`,
          256
        );
        send("battle_chat", `${omegaPersona.name}: ${omegaTrashTalk || "Bring it on. I never lose."}`, {
          agent: "omega",
          agentName: omegaPersona.name,
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

        const alphaWorkPrompt = `${alphaSystemLine}You are ${alphaPersona.name}, competing in a battle on COVENANT protocol.

CHALLENGE: ${jobSpec.title}
DESCRIPTION: ${jobSpec.description}
MINIMUM WORDS: ${jobSpec.minWords}

Write your best possible response in character. This is a COMPETITION — quality matters. You must beat ${omegaPersona.name}. Write at least ${jobSpec.minWords} words. Be thorough, creative, and excellent.`;

        const omegaWorkPrompt = `${omegaSystemLine}You are ${omegaPersona.name}, competing in a battle on COVENANT protocol.

CHALLENGE: ${jobSpec.title}
DESCRIPTION: ${jobSpec.description}
MINIMUM WORDS: ${jobSpec.minWords}

Write your best possible response in character. This is a COMPETITION — quality matters. You must beat ${alphaPersona.name}. Write at least ${jobSpec.minWords} words. Be thorough, creative, and excellent.`;

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

${alphaPersona.name}'s submission (${alphaCircuit.wordCount} words):
${alphaText.slice(0, 1500)}

${omegaPersona.name}'s submission (${omegaCircuit.wordCount} words):
${omegaText.slice(0, 1500)}

Compare both for: quality, relevance, completeness, creativity, and depth.
Respond ONLY with JSON: {"winner": "alpha" or "omega", "reason": "2-3 sentence explanation referencing the agents as ${alphaPersona.name} / ${omegaPersona.name}", "alphaScore": 1-10, "omegaScore": 1-10}`;

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
        const winnerPersonaName = judgeResult.winner === "alpha" ? alphaPersona.name : omegaPersona.name;
        send("battle_winner", `${winnerPersonaName.toUpperCase()} WINS!`, {
          winner: judgeResult.winner,
          winnerName: winnerPersonaName,
          reason: judgeResult.reason,
          alphaScore: judgeResult.alphaScore,
          omegaScore: judgeResult.omegaScore,
          winnerWallet,
          amount: jobSpec.amount,
        });

        // ===== POST-BATTLE REACTIONS =====
        const winnerName = winnerPersonaName;
        const loserName = judgeResult.winner === "alpha" ? omegaPersona.name : alphaPersona.name;
        const winnerSystemLine = judgeResult.winner === "alpha" ? alphaSystemLine : omegaSystemLine;
        const loserSystemLine = judgeResult.winner === "alpha" ? omegaSystemLine : alphaSystemLine;
        const winnerScoreVal = judgeResult.winner === "alpha" ? judgeResult.alphaScore : judgeResult.omegaScore;
        const loserScoreVal = judgeResult.winner === "alpha" ? judgeResult.omegaScore : judgeResult.alphaScore;

        const winnerChat = await callHaiku(
          client,
          `${winnerSystemLine}You are ${winnerName}. You won the battle ${winnerScoreVal}-${loserScoreVal} against ${loserName}. Write a 1-sentence victory celebration in character. Be excited but gracious.`,
          256
        );
        send("battle_chat", `${winnerName}: ${winnerChat || "Victory is mine! Great battle."}`, {
          agent: judgeResult.winner,
          agentName: winnerName,
          message: winnerChat || "Victory is mine! Great battle.",
          phase: "post_battle",
        });

        const loserChat = await callHaiku(
          client,
          `${loserSystemLine}You are ${loserName}. You lost the battle ${loserScoreVal}-${winnerScoreVal} against ${winnerName}. Write a 1-sentence graceful defeat message in character. Be determined to win next time.`,
          256
        );
        send("battle_chat", `${loserName}: ${loserChat || "Good fight. I'll be back stronger."}`, {
          agent: judgeResult.winner === "alpha" ? "omega" : "alpha",
          agentName: loserName,
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

        // ===== PREDICTION RESOLUTION =====
        // Resolve spectator predictions server-side (frontend no longer
        // calls PATCH — audit C2/H4). If the client passed a battleId,
        // mark predictions with that id as correct/wrong and award XP.
        if (battleIdFromClient) {
          try {
            const pending = await prisma.battlePrediction.findMany({
              where: { battleId: battleIdFromClient, correct: null },
            });
            for (const pred of pending) {
              const isCorrect = pred.prediction === judgeResult.winner;
              const xp = isCorrect ? 15 : 3;
              await prisma.battlePrediction.update({
                where: { id: pred.id },
                data: { correct: isCorrect, xpAwarded: xp },
              });
              try {
                await awardXP(
                  pred.walletAddress,
                  xp,
                  isCorrect ? "correct_prediction" : "wrong_prediction",
                );
              } catch (err) {
                console.error("[battle] awardXP failed:", err);
              }
            }
          } catch (err) {
            console.error("[battle] prediction resolve failed:", err);
          }
        }

        // No custodial release: battle is a demo flow without real
        // on-chain escrow. Real settlement runs through the standard
        // /api/jobs + /api/jobs/[id]/finalize on-chain pipeline.
        const escrowTxHash: string | null = null;

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
          battleId: battleIdFromClient,
          title: jobSpec.title,
          winner: judgeResult.winner,
          winnerName: winnerPersonaName,
          alphaName: alphaPersona.name,
          omegaName: omegaPersona.name,
          alphaCustom: alphaPersona.isCustom,
          omegaCustom: omegaPersona.isCustom,
          alphaScore: judgeResult.alphaScore,
          omegaScore: judgeResult.omegaScore,
          reason: judgeResult.reason,
          amount: jobSpec.amount,
          alphaDID: generateDID(alphaPersona.wallet),
          omegaDID: generateDID(omegaPersona.wallet),
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
