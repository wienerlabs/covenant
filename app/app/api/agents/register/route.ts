import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, name, description, endpointUrl, type, capabilities } = body;

    if (!walletAddress || !name || !endpointUrl) {
      return NextResponse.json(
        { error: "walletAddress, name, and endpointUrl are required" },
        { status: 400 }
      );
    }

    // Generate DID from wallet address
    const didHash = crypto
      .createHash("sha256")
      .update(walletAddress)
      .digest("hex")
      .slice(0, 32);
    const did = `did:covenant:${didHash}`;

    // Build AIP agent card
    const agentCard = {
      "@context": "https://schema.org",
      "@type": "SoftwareAgent",
      name,
      description: description || "",
      url: endpointUrl,
      identifier: did,
      agentType: type || "Task",
      capabilities: capabilities || [],
      provider: {
        "@type": "Organization",
        name: "COVENANT",
        url: "https://covenant-omega.vercel.app",
      },
      authentication: {
        type: "wallet",
        address: walletAddress,
      },
    };

    // Store in DB
    const agent = await prisma.publishedAgent.create({
      data: {
        walletAddress,
        name,
        description: description || "",
        endpointUrl,
        agentType: type || "Task",
        capabilities: capabilities || [],
        did,
      },
    });

    return NextResponse.json({
      id: agent.id,
      did: agent.did,
      agentCard,
    });
  } catch (err) {
    console.error("Agent register error:", err);
    return NextResponse.json(
      { error: "Failed to register agent" },
      { status: 500 }
    );
  }
}
