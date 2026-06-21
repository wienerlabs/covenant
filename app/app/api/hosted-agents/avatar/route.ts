import { NextRequest, NextResponse } from "next/server";
import { enforceIpLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Raster-only allowlist. SVG is intentionally excluded: it can carry inline
// <script>, and this route returns a data: URL that may later be rendered in a
// script-executing context — so accepting SVG would be a stored-XSS foot-gun.
const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** Verify the leading magic bytes match a supported raster type. */
function sniffRasterType(
  buf: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  if (buf.length >= 6 && buf.toString("ascii", 0, 4) === "GIF8")
    return "image/gif";
  return null;
}

export async function POST(req: NextRequest) {
  // Per-IP durable rate limit — the endpoint is anonymous and returns an
  // inlined base64 data URL, so without a cap it is an unbounded storage/CPU
  // abuse vector.
  const limited = await enforceIpLimit(req, "avatar_upload");
  if (limited) return limited;

  const formData = await req.formData();
  const file = formData.get("avatar") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, WebP or GIF images are allowed" },
      { status: 400 },
    );
  }

  // Enforce the size limit on the ACTUAL decoded bytes before storing —
  // File.size is client-supplied metadata and must not be trusted alone.
  const bytes = await file.arrayBuffer();
  const buf = Buffer.from(bytes);
  if (buf.byteLength > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Max 2MB" }, { status: 400 });
  }

  // Verify magic bytes and build the data URL from the sniffed type, so a
  // spoofed Content-Type cannot smuggle a different payload into the URL.
  const sniffed = sniffRasterType(buf);
  if (!sniffed) {
    return NextResponse.json(
      { error: "File content is not a valid raster image" },
      { status: 400 },
    );
  }

  const base64 = buf.toString("base64");
  const dataUrl = `data:${sniffed};base64,${base64}`;

  return NextResponse.json({ url: dataUrl });
}
