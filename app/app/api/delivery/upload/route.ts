import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/delivery/upload
 *
 * Upload a work deliverable to Vercel Blob and return a
 * `{ workHash, deliveryUri }` pair ready for on-chain `submit_work`.
 *
 * The frontend's SubmitWorkModal calls this endpoint, then uses the
 * returned data to build the Anchor transaction.
 *
 * Body: multipart/form-data with `file` field, or JSON `{ content: string }`
 *
 * Requires: BLOB_READ_WRITE_TOKEN env var.
 */
export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN not configured. Set it in Vercel env vars.",
      },
      { status: 500 },
    );
  }

  let content: Buffer;
  let filename: string;
  let contentType = "application/octet-stream";

  const contentTypeHeader = req.headers.get("content-type") ?? "";
  try {
    if (contentTypeHeader.includes("application/json")) {
      const body = await req.json();
      const text = body.content ?? body.text ?? "";
      if (typeof text !== "string" || !text) {
        return NextResponse.json(
          { error: "JSON body requires a non-empty `content` or `text` field" },
          { status: 400 },
        );
      }
      content = Buffer.from(text, "utf8");
      filename = body.filename ?? `delivery-${Date.now()}.txt`;
      contentType = "text/plain; charset=utf-8";
    } else if (contentTypeHeader.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "multipart body requires a `file` field" },
          { status: 400 },
        );
      }
      content = Buffer.from(await file.arrayBuffer());
      filename = file.name || `delivery-${Date.now()}`;
      contentType = file.type || contentType;
    } else {
      return NextResponse.json(
        {
          error:
            "Unsupported Content-Type. Use application/json or multipart/form-data.",
        },
        { status: 415 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to parse request body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  if (content.byteLength > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Content exceeds 5MB limit" },
      { status: 413 },
    );
  }

  const workHash = crypto.createHash("sha256").update(content).digest("hex");
  const blobFilename = `covenant/${workHash.slice(0, 8)}-${filename}`;

  const uploadRes = await fetch(
    `https://blob.vercel-storage.com/${encodeURIComponent(blobFilename)}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": contentType,
        "x-api-version": "7",
      },
      body: content,
    },
  );
  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Vercel Blob upload failed",
        status: uploadRes.status,
        detail: detail.slice(0, 500),
      },
      { status: 502 },
    );
  }
  const json = (await uploadRes.json()) as { url?: string };
  if (!json.url) {
    return NextResponse.json(
      { error: "Vercel Blob response missing URL" },
      { status: 502 },
    );
  }

  // Ensure the URL fits in the on-chain 128-byte limit
  const uriBytes = Buffer.byteLength(json.url, "utf8");
  if (uriBytes > 128) {
    return NextResponse.json(
      {
        error: `Returned blob URL is ${uriBytes} bytes; exceeds on-chain 128 byte limit. Consider a shorter filename.`,
        url: json.url,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    workHash,
    deliveryUri: json.url,
    size: content.byteLength,
    contentType,
  });
}
