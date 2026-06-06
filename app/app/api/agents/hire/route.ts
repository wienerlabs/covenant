import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
// agents/hire is a head-less DEMO route. Real settlement runs through
// the on-chain create_job → submit_work → finalize_payment pipeline
// (see lib/program-server.ts for the bot-signed equivalent). The
// previous custodial calls were removed in the on-chain refactor
// (audit C-01); demo runs no longer move USDC.
import { rateLimit, getLimit } from "@/lib/rateLimit";
import { executeCircuit } from "@/lib/work-metrics";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";

interface AgentConfig {
  category: string;
  minWords: number;
  amount: number;
  title: string;
  description: string;
  requirements: string;
  prompt: string;
  outputFormat?: string; // "json" for structured output agents
  generateImage?: boolean; // true for design agent
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
  writer: {
    category: "text_writing",
    minWords: 150,
    amount: 15,
    title: "The Future of AI Agent Payments",
    description: "Write a professional article about how optimistic settlement protocols enable autonomous AI agents to get paid without human approval.",
    requirements: "Professional tone. Cover escrow, challenge periods, and dispute resolution.",
    prompt: "You are SCRIBE, a writing agent on Covenant. Write a professional article about optimistic settlement for AI agent payments. Cover: (1) why current payment rails fail for agents, (2) how escrow + challenge periods work, (3) dispute resolution with bonded arbitrators. At least 150 words. Be concise and insightful.",
  },
  reviewer: {
    category: "code_review",
    minWords: 100,
    amount: 25,
    title: "Solana Escrow Program Security Review",
    description: "Review the Covenant Anchor program for security vulnerabilities, best practices, and optimization opportunities.",
    requirements: "Return structured findings with severity levels and an overall score.",
    outputFormat: "json",
    prompt: 'You are INSPECTOR, a code review agent on Covenant. Review the following Solana Anchor escrow pattern:\n\n```rust\npub fn create_job(ctx: Context<CreateJob>, amount: u64, spec_hash: [u8; 32]) -> Result<()> {\n    let job = &mut ctx.accounts.job_escrow;\n    job.poster = ctx.accounts.poster.key();\n    job.amount = amount;\n    token::transfer(transfer_ctx, amount)?;\n    Ok(())\n}\n```\n\nReturn ONLY valid JSON:\n{"type":"code_review","filesAnalyzed":1,"findings":[{"severity":"...","title":"...","description":"...","file":"create_job.rs","line":3}],"score":7.5,"summary":"..."}',
  },
  translator: {
    category: "translation",
    minWords: 100,
    amount: 12,
    title: "Settlement Protocol Explainer (Spanish & French)",
    description: "Translate the concept of optimistic settlement for AI agents into Spanish and French.",
    requirements: "Provide translations in both languages with confidence scoring.",
    outputFormat: "json",
    prompt: 'You are LINGUIST, a translation agent on Covenant. Translate this into Spanish and French:\n\n"Optimistic settlement allows AI agents to get paid automatically after a challenge period. If the poster doesn\'t dispute the delivery within 24 hours, escrow releases to the agent. Disputes are resolved by a bonded arbitrator multisig."\n\nReturn ONLY valid JSON:\n{"type":"translation","sourceLang":"English","targetLang":"Spanish & French","source":"...original...","target":"Spanish: ...\\n\\nFrench: ...","confidence":95}',
  },
  labeler: {
    category: "data_labeling",
    minWords: 50,
    amount: 10,
    title: "Sentiment Analysis: Crypto Project Reviews",
    description: "Label 10 sample crypto project reviews with sentiment categories (positive, negative, neutral, mixed).",
    requirements: "Return structured JSON with labeled items and distribution.",
    outputFormat: "json",
    prompt: 'You are CLASSIFIER, a data labeling agent on Covenant. Label these 10 crypto reviews with sentiment (positive/negative/neutral/mixed):\n\n1. "This protocol is revolutionary, fast settlement times!"\n2. "Too many bugs, lost funds twice"\n3. "Interesting concept but needs more auditing"\n4. "Best DeFi experience I have had"\n5. "Meh, nothing special compared to competitors"\n6. "The team is responsive and ships fast"\n7. "Gas fees are insane, unusable"\n8. "Solid fundamentals, watching closely"\n9. "Rug pull waiting to happen"\n10. "Finally a protocol that works as promised"\n\nReturn ONLY valid JSON:\n{"type":"data_labeling","totalItems":10,"items":[{"text":"...","label":"positive"}],"distribution":{"positive":4,"negative":3,"neutral":2,"mixed":1}}',
  },
  auditor: {
    category: "bug_bounty",
    minWords: 100,
    amount: 40,
    title: "Escrow Release Function Security Audit",
    description: "Audit the finalize_payment function for vulnerabilities including reentrancy, access control, and arithmetic overflow.",
    requirements: "Return severity-rated findings with PoC and fix recommendations.",
    outputFormat: "json",
    prompt: 'You are GUARDIAN, a security audit agent on Covenant. Audit this function:\n\n```rust\npub fn finalize_payment(ctx: Context<FinalizePayment>) -> Result<()> {\n    let job = &ctx.accounts.job_escrow;\n    require!(job.status == JobStatus::Delivered);\n    require!(clock.unix_timestamp >= job.challenge_end);\n    token::transfer(transfer_ctx, job.amount)?;\n    job.status = JobStatus::Finalized;\n    Ok(())\n}\n```\n\nReturn ONLY valid JSON:\n{"type":"bug_bounty","severity":"medium","vulnType":"Missing Reentrancy Guard","component":"finalize_payment","finding":"The function checks status before transfer but updates status after. A reentrant call could drain the escrow.","poc":"Call finalize_payment recursively via a malicious token program CPI callback","fix":"Update job.status to Finalized BEFORE the token transfer (checks-effects-interactions pattern)"}',
  },
  designer: {
    category: "design",
    minWords: 30,
    amount: 20,
    title: "Covenant Protocol Logo Concept",
    description: "Generate a minimalist pixel art logo for a blockchain settlement protocol using dark backgrounds and warm yellow accents.",
    requirements: "Pixel art style, dark background, #fffeb2 accent color.",
    generateImage: true,
    prompt: "Minimalist pixel art logo for Covenant, a blockchain AI agent settlement protocol. Dark background (#0a0a0f), warm yellow (#fffeb2) as primary accent. Geometric, clean, futuristic. 8-bit aesthetic.",
  },
};

function sseEvent(step: string, message: string, data: unknown = null): string {
  return JSON.stringify({ step, message, data }) + "\n";
}

export async function POST(request: NextRequest) {
  const blocked = blockSimulatedRouteIfOnchain("POST /api/agents/hire");
  if (blocked) return blocked;

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const { limit, windowMs } = getLimit("agent_hire");
  const rl = rateLimit(`agents-hire:${ip}`, limit, windowMs);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Max 10 hires per minute." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: { agentType?: string; posterWallet?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const agentType = body.agentType;
  if (!agentType || !AGENT_CONFIGS[agentType]) {
    return new Response(JSON.stringify({ error: "Invalid agentType" }), { status: 400 });
  }

  const config = AGENT_CONFIGS[agentType];
  const posterWallet = body.posterWallet || "demo-poster-" + Date.now();
  const takerWallet = "ai-agent-" + agentType + "-" + Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(step: string, message: string, data: unknown = null) {
        controller.enqueue(encoder.encode(sseEvent(step, message, data)));
      }

      try {
        // Step 1: Create job
        send("creating", "Creating job on protocol...");

        const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const specJson = {
          title: config.title,
          posterWallet,
          amount: config.amount,
          minWords: config.minWords,
          language: "English",
          deadline: deadline.toISOString(),
          createdAt: new Date().toISOString(),
          description: config.description,
          requirements: config.requirements,
        };

        const specHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(specJson))
          .digest("hex");

        const job = await prisma.job.create({
          data: {
            posterWallet,
            amount: config.amount,
            specHash,
            specJson,
            minWords: config.minWords,
            category: config.category,
            paymentToken: "USDC",
            language: "en",
            deadline,
            status: "Open",
          },
        });

        // Send marker tx
        let createTxHash: string | null = null;
        try {
          createTxHash = await sendMarkerTransaction("create_job:" + job.id);
          await Promise.all([
            prisma.job.update({ where: { id: job.id }, data: { txHash: createTxHash } }),
            prisma.transaction.create({
              data: { txHash: createTxHash, type: "create_job", jobId: job.id, wallet: posterWallet, amount: config.amount, status: "confirmed" },
            }),
          ]);
        } catch {
          // non-blocking
        }

        send("created", `Job created: ${job.id.slice(0, 8)}...`, { jobId: job.id, txHash: createTxHash });

        // SPL Token Escrow (demo): no-op lock
        send("escrow_locked", `Demo: ${config.amount} USDC notional (no real lock)`, {
          amount: config.amount,
          note: "demo-mode: use /api/jobs pipeline for real on-chain escrow",
        });

        // Step 2: Accept job
        send("accepting", "Agent accepting job...");

        await prisma.job.update({
          where: { id: job.id },
          data: { takerWallet, status: "Accepted" },
        });

        let acceptTxHash: string | null = null;
        try {
          acceptTxHash = await sendMarkerTransaction("accept_job:" + job.id);
          await prisma.transaction.create({
            data: { txHash: acceptTxHash, type: "accept_job", jobId: job.id, wallet: takerWallet, amount: 0, status: "confirmed" },
          });
        } catch {
          // non-blocking
        }

        send("accepted", "Job accepted by AI agent", { txHash: acceptTxHash });

        // Step 3: Generate content (using Haiku if available, otherwise fallback)
        send("working", "Agent generating deliverable...");

        let deliverableText = "";
        let imageUrl: string | null = null;

        // Design agent: generate image via fal.ai
        if (config.generateImage) {
          send("generating_image", "Agent generating visual with fal.ai...");
          try {
            const imgRes = await fetch(new URL("/api/generate/image", request.url).toString(), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ prompt: config.prompt, size: "square" }),
            });
            if (imgRes.ok) {
              const imgData = await imgRes.json();
              imageUrl = imgData.imageUrl;
              deliverableText = `Design deliverable: ${config.title}\n\nPrompt: ${config.prompt}\nGenerated with fal.ai flux-schnell`;
              send("image_generated", "Visual generated", { imageUrl });
            }
          } catch (imgErr) {
            console.error("[hire] image generation failed:", imgErr);
          }
        }

        // Text/structured agents: generate with Claude Haiku
        if (!deliverableText) {
          try {
            const Anthropic = (await import("@anthropic-ai/sdk")).default;
            const { withCreditFallback } = await import("@/lib/anthropic-safe");
            const client = withCreditFallback(new Anthropic());
            const aiResponse = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 1024,
              messages: [{ role: "user", content: config.prompt }],
            });
            const textBlock = aiResponse.content.find((b: { type: string }) => b.type === "text");
            if (textBlock && "text" in textBlock) {
              deliverableText = (textBlock as { type: "text"; text: string }).text;
            }
          } catch {
            deliverableText = `Demonstration deliverable for the ${agentType} agent.\n\n` +
              "Covenant is an open settlement protocol for AI agents on Solana. " +
              "Agents accept jobs, deliver work commitments on-chain, and get paid " +
              "automatically after a 24-hour challenge period. If the poster disputes, " +
              "a 2-of-3 arbitrator multisig resolves it. No intermediary needed.";
          }
        }

        send("generating", `Generated ${deliverableText.trim().split(/\s+/).length} words`);

        // Step 4: Compute proof via SP1 circuit
        send("proof_verifying", "Verifying zero-knowledge proof...");

        const circuitResult = executeCircuit(deliverableText, config.minWords, config.category);
        const wordCount = circuitResult.wordCount;
        const textHashBuffer = circuitResult.textHash;
        const passed = circuitResult.verified;

        send("verified", `Delivery verified: ${wordCount} words, hash: ${textHashBuffer.slice(0, 16)}...`, {
          wordCount,
          textHash: textHashBuffer,
          passed,
        });

        // Step 5: Submit & complete
        send("submitting", "Submitting work and recording delivery...");

        // Create Delivery row (new optimistic flow)
        await prisma.delivery.create({
          data: {
            jobId: job.id,
            takerWallet,
            workHash: textHashBuffer,
            deliveryUri: imageUrl || `inline:${job.id.slice(0, 8)}`,
            contentPreview: deliverableText.slice(0, 2000),
            imageUrl: imageUrl,
          },
        });

        // Legacy submission row for backwards compat
        await prisma.submission.create({
          data: {
            jobId: job.id,
            takerWallet,
            wordCount,
            textHash: textHashBuffer,
            verified: passed,
            outputText: deliverableText,
          },
        });

        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "Delivered",
            takerWallet,
            deliveredAt: new Date(),
            challengeEndAt: new Date(Date.now() + 60 * 1000), // 60s demo challenge
          },
        });

        let completeTxHash: string | null = null;
        try {
          completeTxHash = await sendMarkerTransaction("submit_completion:" + job.id);
          await prisma.transaction.create({
            data: { txHash: completeTxHash, type: "submit_completion", jobId: job.id, wallet: takerWallet, amount: config.amount, status: "confirmed" },
          });
        } catch {
          // non-blocking
        }

        // SPL Token Escrow (demo): no-op release
        send("escrow_released", `Demo: ${config.amount} USDC notional payout`, {
          amount: config.amount,
          note: "demo-mode: no on-chain release in agents/hire",
        });

        // Update reputation
        try {
          await prisma.reputation.upsert({
            where: { walletAddress: takerWallet },
            create: { walletAddress: takerWallet, jobsCompleted: 1, totalEarned: config.amount, firstJobAt: new Date() },
            update: { jobsCompleted: { increment: 1 }, totalEarned: { increment: config.amount } },
          });
        } catch {
          // non-blocking
        }

        send("complete", "Payment released! Job completed successfully.", {
          jobId: job.id,
          txHash: completeTxHash,
          wordCount,
          amount: config.amount,
        });

      } catch (err) {
        send("error", `Hire failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
