import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { enforceIpLimit } from "@/lib/rateLimit";

/**
 * POST /api/generate/image
 *
 * Generates an image from a text prompt using fal.ai's API, uploads the
 * result to Vercel Blob, and returns the permanent URL + hash.
 *
 * Used by design-category agents to fulfill visual tasks. The agent:
 *   1. Receives a job spec with a design brief
 *   2. Calls this endpoint with the brief as a prompt
 *   3. Gets back an imageUrl to include in the delivery
 *
 * Requires: FAL_KEY env var (fal.ai API key)
 *
 * Body: { prompt: string, size?: "square" | "landscape" | "portrait" }
 */

export const dynamic = "force-dynamic";

const FAL_KEY = process.env.FAL_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

// fal.ai model — using flux-schnell for speed (generates in ~1s)
const FAL_MODEL = "fal-ai/flux/schnell";
const FAL_API = `https://fal.run/${FAL_MODEL}`;

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  landscape: { width: 1344, height: 768 },
  portrait: { width: 768, height: 1344 },
};

export async function POST(req: NextRequest) {
  // Throttle: each call hits the paid fal.ai API + Vercel Blob. Without a
  // limit an unauthenticated caller can run up the bill / exhaust quota.
  const limited = await enforceIpLimit(req, "generate_image");
  if (limited) return limited;

  if (!FAL_KEY) {
    return NextResponse.json(
      {
        error: "FAL_KEY not configured. Set it in Vercel env vars to enable image generation.",
        docs: "https://fal.ai/dashboard/keys",
      },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const { prompt, size = "square" } = body as {
      prompt?: string;
      size?: string;
    };

    if (!prompt || typeof prompt !== "string" || prompt.length < 5) {
      return NextResponse.json(
        { error: "prompt is required (min 5 chars)" },
        { status: 400 },
      );
    }

    const dimensions = SIZE_MAP[size] ?? SIZE_MAP.square;

    // 1. Generate image via fal.ai
    const falRes = await fetch(FAL_API, {
      method: "POST",
      headers: {
        authorization: `Key ${FAL_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: dimensions,
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
      }),
    });

    if (!falRes.ok) {
      const detail = await falRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Image generation failed",
          status: falRes.status,
          detail: detail.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const falData = (await falRes.json()) as {
      images?: Array<{ url?: string; content_type?: string }>;
    };

    const imageUrl = falData.images?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json(
        { error: "fal.ai returned no image" },
        { status: 502 },
      );
    }

    // 2. Download the generated image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json(
        { error: "Failed to download generated image" },
        { status: 502 },
      );
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const imgHash = crypto.createHash("sha256").update(imgBuffer).digest("hex");

    // 3. Upload to Vercel Blob for permanent storage
    let permanentUrl = imageUrl; // fallback to fal.ai URL
    if (BLOB_TOKEN) {
      const blobFilename = `covenant/generated/${imgHash.slice(0, 12)}.png`;
      const blobRes = await fetch(
        `https://blob.vercel-storage.com/${encodeURIComponent(blobFilename)}`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${BLOB_TOKEN}`,
            "content-type": "image/png",
            "x-api-version": "7",
          },
          body: new Blob([new Uint8Array(imgBuffer)], { type: "image/png" }),
        },
      );
      if (blobRes.ok) {
        const blobData = (await blobRes.json()) as { url?: string };
        if (blobData.url) {
          permanentUrl = blobData.url;
        }
      }
    }

    return NextResponse.json({
      imageUrl: permanentUrl,
      imageHash: imgHash,
      prompt,
      size,
      dimensions,
      model: FAL_MODEL,
    });
  } catch (error) {
    console.error("POST /api/generate/image error:", error);
    return NextResponse.json(
      { error: "Image generation failed" },
      { status: 500 },
    );
  }
}
