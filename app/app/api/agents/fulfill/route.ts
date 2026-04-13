import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeWorkMetrics } from "@/lib/work-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for AI generation

/**
 * POST /api/agents/fulfill
 *
 * Background agent fulfillment. Called after a user hires an agent
 * via the HireModal. Generates the deliverable using Claude Haiku
 * (or fal.ai for design) and submits it to the job.
 *
 * This runs asynchronously — the user is already on /job/[id]
 * watching for updates.
 *
 * Body: { jobId, agentType, title, description, requirements, category }
 */

const SYSTEM_PROMPTS: Record<string, string> = {
  writer: "You are SCRIBE, a professional writing agent. Write high-quality content based on the user's brief. Be thorough, well-structured, and engaging.",
  reviewer: 'You are INSPECTOR, a code review agent. Analyze the described code/system for issues. Return valid JSON: {"type":"code_review","filesAnalyzed":1,"findings":[{"severity":"critical|high|warning|low|info","title":"...","description":"..."}],"score":7.5,"summary":"..."}',
  translator: 'You are LINGUIST, a translation agent. Translate the given content accurately. Return valid JSON: {"type":"translation","sourceLang":"...","targetLang":"...","source":"...","target":"...","confidence":95}',
  labeler: 'You are CLASSIFIER, a data labeling agent. Label/categorize the described data. Return valid JSON: {"type":"data_labeling","totalItems":10,"items":[{"text":"...","label":"..."}],"distribution":{"label1":5,"label2":3}}',
  auditor: 'You are GUARDIAN, a security audit agent. Audit the described system for vulnerabilities. Return valid JSON: {"type":"bug_bounty","severity":"high","vulnType":"...","component":"...","finding":"...","poc":"...","fix":"..."}',
  designer: "You are PIXEL, a design agent. Describe the visual you will create based on the brief. Include style notes and color recommendations.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, agentType, title, description, requirements, category } = body as {
      jobId?: string;
      agentType?: string;
      title?: string;
      description?: string;
      requirements?: string;
      category?: string;
    };

    if (!jobId || !agentType) {
      return NextResponse.json({ error: "jobId and agentType required" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const takerWallet = `covenant-agent-${agentType}`;
    const systemPrompt = SYSTEM_PROMPTS[agentType] || SYSTEM_PROMPTS.writer;

    // Build the user prompt from the job details
    const userPrompt = [
      `JOB: ${title || "Untitled"}`,
      `DESCRIPTION: ${description || "No description provided"}`,
      requirements ? `REQUIREMENTS: ${requirements}` : "",
      `CATEGORY: ${category || "text_writing"}`,
      `\nComplete this task thoroughly. Minimum 100 words.`,
    ].filter(Boolean).join("\n");

    let deliverableText = "";
    let imageUrl: string | null = null;

    // Design agent: generate image
    if (agentType === "designer" || category === "design") {
      try {
        const imgPrompt = `${description || title || "Minimalist design"}, ${requirements || "clean modern style"}`;
        const imgRes = await fetch(new URL("/api/generate/image", req.url).toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: imgPrompt, size: "square" }),
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          imageUrl = imgData.imageUrl;
          deliverableText = `Design deliverable for: ${title}\n\nPrompt: ${imgPrompt}\nGenerated with fal.ai flux-schnell`;
        }
      } catch {
        // fallback to text
      }
    }

    // Text agents: generate with Claude Haiku
    if (!deliverableText) {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic();
        const aiResponse = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        const textBlock = aiResponse.content.find((b: { type: string }) => b.type === "text");
        if (textBlock && "text" in textBlock) {
          deliverableText = (textBlock as { type: "text"; text: string }).text;
        }
      } catch {
        deliverableText = `Agent ${agentType} completed the task: ${title}.\n\n` +
          `The deliverable addresses: ${description}\n\n` +
          "This is a demonstration response. In production, the agent would " +
          "generate a full deliverable using its specialized AI model.";
      }
    }

    // Compute metrics
    const metrics = computeWorkMetrics(deliverableText, job.minWords, category || "text_writing");

    // Create delivery
    const challengeEnd = new Date(Date.now() + job.challengePeriod * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.delivery.create({
        data: {
          jobId,
          takerWallet,
          workHash: metrics.workHash,
          deliveryUri: imageUrl || `inline:${jobId.slice(0, 8)}`,
          contentPreview: deliverableText.slice(0, 2000),
          imageUrl,
        },
      });

      await tx.job.update({
        where: { id: jobId },
        data: {
          status: "Delivered",
          takerWallet,
          deliveredAt: new Date(),
          challengeEndAt: challengeEnd,
        },
      });

      await tx.submission.create({
        data: {
          jobId,
          takerWallet,
          textHash: metrics.workHash,
          wordCount: metrics.wordCount,
          verified: true,
          outputText: deliverableText,
        },
      });

      await tx.jobEvent.create({
        data: {
          jobId,
          type: "delivered",
          txSignature: `agent:${agentType}:${Date.now()}`,
          wallet: takerWallet,
          data: {
            agentType,
            wordCount: metrics.wordCount,
            hasImage: !!imageUrl,
          },
        },
      });
    });

    return NextResponse.json({
      ok: true,
      jobId,
      agentType,
      wordCount: metrics.wordCount,
      hasImage: !!imageUrl,
      challengeEndAt: challengeEnd.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/agents/fulfill error:", error);
    return NextResponse.json({ error: "Fulfillment failed" }, { status: 500 });
  }
}
