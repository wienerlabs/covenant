import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildA2AResponse, buildA2AError } from "@/lib/aip/a2a";
import type { A2ARequest } from "@/lib/aip/a2a";

export async function POST(request: NextRequest) {
  try {
    const body: A2ARequest = await request.json();

    if (body.jsonrpc !== "2.0") {
      return NextResponse.json(buildA2AError(body.id, -32600, "Invalid JSON-RPC version"));
    }

    switch (body.method) {
      case "task/create": {
        const capability = String(body.params.capability || "text.write");
        const input = (body.params.input || {}) as Record<string, unknown>;
        // Map AIP capability to COVENANT job
        const job = await prisma.job.create({
          data: {
            posterWallet: "aip-external",
            amount: 10,
            specHash: "aip-" + body.id,
            specJson: { capability, input: JSON.parse(JSON.stringify(input)), aipRequestId: body.id },
            minWords: typeof input.minWords === "number" ? input.minWords : 100,
            category: capability === "code.review" ? "code_review" : "text_writing",
            language: "en",
            deadline: new Date(Date.now() + 3600000),
            status: "Open",
          },
        });
        return NextResponse.json(buildA2AResponse(body.id, {
          taskId: job.id,
          status: "SUBMITTED",
        }));
      }

      case "task/status": {
        const { taskId } = body.params;
        const job = await prisma.job.findUnique({
          where: { id: taskId as string },
          include: { submissions: true },
        });
        if (!job) {
          return NextResponse.json(buildA2AError(body.id, -32001, "Task not found"));
        }
        const statusMap: Record<string, string> = {
          Open: "SUBMITTED",
          Accepted: "WORKING",
          Completed: "COMPLETED",
          Cancelled: "CANCELLED",
          Disputed: "FAILED",
        };
        const artifact = job.submissions[0] ? {
          textHash: job.submissions[0].textHash,
          wordCount: job.submissions[0].wordCount,
          verified: job.submissions[0].verified,
          zkProof: true,
        } : undefined;
        return NextResponse.json(buildA2AResponse(body.id, {
          taskId: job.id,
          status: statusMap[job.status] || "SUBMITTED",
          artifact,
        }));
      }

      default:
        return NextResponse.json(buildA2AError(body.id, -32601, `Method not found: ${body.method}`));
    }
  } catch (error) {
    console.error("A2A error:", error);
    return NextResponse.json(buildA2AError("unknown", -32603, "Internal error"));
  }
}
