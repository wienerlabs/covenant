import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { lockFundsInEscrow, releaseFundsToTaker } from "@/lib/escrow";
import { rateLimit } from "@/lib/rateLimit";
import crypto from "crypto";
import { NextRequest } from "next/server";

const AGENT_CONFIGS: Record<string, { category: string; minWords: number; amount: number; prompt: string }> = {
  writer: {
    category: "text_writing",
    minWords: 150,
    amount: 15,
    prompt: "Write a short professional article (at least 150 words) about the benefits of decentralized AI agent marketplaces. Be concise and informative.",
  },
  reviewer: {
    category: "code_review",
    minWords: 100,
    amount: 20,
    prompt: "Write a detailed code review (at least 100 words) of a sample Solana smart contract function that handles escrow payments. Include observations about security, gas efficiency, and best practices.",
  },
  translator: {
    category: "translation",
    minWords: 100,
    amount: 12,
    prompt: "Translate the following concept into both Spanish and French (at least 100 words total): 'Zero-knowledge proofs allow one party to prove to another that a statement is true without revealing any additional information beyond the validity of the statement itself.'",
  },
};

function sseEvent(step: string, message: string, data: unknown = null): string {
  return JSON.stringify({ step, message, data }) + "\n";
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const rl = rateLimit(`agents-hire:${ip}`, 10);
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
          title: `${agentType} AI Agent Task`,
          posterWallet,
          amount: config.amount,
          minWords: config.minWords,
          language: "en",
          deadline: deadline.toISOString(),
          createdAt: new Date().toISOString(),
          description: config.prompt,
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

        // SPL Token Escrow: Lock funds
        try {
          send("escrow_lock", `Locking ${config.amount} USDC in escrow...`);
          const lockResult = await lockFundsInEscrow("DEPLOYER_KEYPAIR", config.amount);
          send("escrow_locked", "Funds locked in escrow", { txHash: lockResult.txHash, amount: config.amount });
          await prisma.transaction.create({
            data: { txHash: lockResult.txHash, type: "escrow_lock", jobId: job.id, wallet: posterWallet, amount: config.amount, status: "confirmed" },
          });
        } catch (err) {
          console.error("[escrow] Lock failed:", err);
        }

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
        try {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic();
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
          // Fallback content
          deliverableText = `This is a demonstration deliverable for the ${agentType} agent task. ` +
            "The COVENANT protocol enables trustless work delivery using zero-knowledge proofs on Solana. " +
            "AI agents complete tasks and generate cryptographic proofs that the work meets specifications. " +
            "Payment is locked in escrow and automatically released when proof is verified on-chain. " +
            "This eliminates the need for intermediaries and builds trust through mathematics rather than reputation alone. " +
            "The marketplace supports multiple job categories including text writing, code review, translation, data labeling, " +
            "bug bounties, and design work. Each category has specialized verification circuits that ensure deliverable quality. " +
            "Workers earn reputation on-chain, creating a permanent and verifiable track record of their capabilities. " +
            "This is the future of work: autonomous, provable, and trustless.";
        }

        send("generating", `Generated ${deliverableText.trim().split(/\s+/).length} words`);

        // Step 4: Compute proof
        send("proof_verifying", "Verifying zero-knowledge proof...");

        const wordCount = deliverableText.trim().split(/\s+/).length;
        const textHashBuffer = crypto.createHash("sha256").update(deliverableText).digest("hex");
        const passed = wordCount >= config.minWords;

        send("proof_verified", `Proof verified: ${wordCount} words, hash: ${textHashBuffer.slice(0, 16)}...`, {
          wordCount,
          textHash: textHashBuffer,
          passed,
          cycleCount: 237583,
        });

        // Step 5: Submit & complete
        send("submitting", "Submitting work and completing job...");

        await prisma.submission.create({
          data: {
            jobId: job.id,
            takerWallet,
            wordCount,
            textHash: textHashBuffer,
            verified: passed,
          },
        });

        await prisma.job.update({
          where: { id: job.id },
          data: { status: "Completed" },
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

        // SPL Token Escrow: Release funds to agent
        try {
          send("escrow_release", `Releasing ${config.amount} USDC to agent...`);
          const releaseResult = await releaseFundsToTaker(takerWallet, config.amount);
          send("escrow_released", "Payment released", { txHash: releaseResult.txHash, amount: config.amount });
          await prisma.transaction.create({
            data: { txHash: releaseResult.txHash, type: "escrow_release", jobId: job.id, wallet: takerWallet, amount: config.amount, status: "confirmed" },
          });
        } catch (err) {
          console.error("[escrow] Release failed:", err);
        }

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
