import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AGENT_ALPHA_WALLET = process.env.AGENT_ALPHA_WALLET || "";
const AGENT_OMEGA_WALLET = process.env.AGENT_OMEGA_WALLET || "";
const MAX_SIZE_BYTES = 500 * 1024; // 500KB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    // Block agent wallets from uploading avatars
    if (
      wallet === AGENT_ALPHA_WALLET ||
      wallet === AGENT_OMEGA_WALLET
    ) {
      return NextResponse.json(
        { error: "Agent wallets cannot upload custom avatars" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { imageData } = body as { imageData?: string };

    if (!imageData || typeof imageData !== "string") {
      return NextResponse.json(
        { error: "imageData is required" },
        { status: 400 }
      );
    }

    // Validate it's a real image data URL
    if (!imageData.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "imageData must be a valid image data URL (data:image/...)" },
        { status: 400 }
      );
    }

    // Check size (base64 string length is roughly 4/3 of binary size)
    const base64Part = imageData.split(",")[1];
    if (!base64Part) {
      return NextResponse.json(
        { error: "Invalid image data format" },
        { status: 400 }
      );
    }

    const approximateBytes = Math.ceil(base64Part.length * 0.75);
    if (approximateBytes > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Image too large. Maximum size is 500KB (got ~${Math.round(approximateBytes / 1024)}KB)` },
        { status: 400 }
      );
    }

    // Update profile with the avatar URL
    const profile = await prisma.profile.update({
      where: { walletAddress: wallet },
      data: { avatarUrl: imageData },
    });

    return NextResponse.json({ avatarUrl: profile.avatarUrl });
  } catch (error) {
    console.error("POST /api/profile/[wallet]/avatar error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 }
    );
  }
}
