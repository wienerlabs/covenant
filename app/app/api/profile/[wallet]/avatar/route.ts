import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";
import { enforceIpLimit } from "@/lib/rateLimit";

const AGENT_ALPHA_WALLET = process.env.AGENT_ALPHA_WALLET || "";
const AGENT_OMEGA_WALLET = process.env.AGENT_OMEGA_WALLET || "";
const MAX_SIZE_BYTES = 500 * 1024; // 500KB

// Raster image types only. SVG (data:image/svg+xml) is intentionally excluded:
// SVG is an active document that can carry <script>/onload handlers, so storing
// an attacker-supplied SVG as an avatar is a stored-XSS vector if it is ever
// rendered outside an <img> sandbox.
const ALLOWED_IMAGE_PREFIXES = [
  "data:image/png;",
  "data:image/jpeg;",
  "data:image/jpg;",
  "data:image/webp;",
  "data:image/gif;",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    // Throttle: this writes a 500KB blob to the DB; cap abuse per IP.
    const limited = await enforceIpLimit(request, "profile_avatar");
    if (limited) return limited;

    // Read the raw body once so the auth check can hash it, then parse.
    const raw = await request.text();
    const auth = await requireAuth(request, { rawBody: raw });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }
    // IDOR guard: the signer must control the wallet whose avatar is being set.
    const guard = requireWalletMatch(auth, wallet);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.reason }, { status: guard.status });
    }

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

    let body: { imageData?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { imageData } = body;

    if (!imageData || typeof imageData !== "string") {
      return NextResponse.json(
        { error: "imageData is required" },
        { status: 400 }
      );
    }

    // Validate it's a real RASTER image data URL (no SVG — stored-XSS vector).
    if (!ALLOWED_IMAGE_PREFIXES.some((p) => imageData.startsWith(p))) {
      return NextResponse.json(
        { error: "imageData must be a base64 data URL of type png, jpeg, webp, or gif" },
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
