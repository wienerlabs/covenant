import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware.
 *
 * Responsibilities:
 *   1. Stamp every request with an `x-request-id` header (preserved
 *      from upstream if already present, e.g. Vercel sets x-vercel-id).
 *      The same id is echoed back to the client + bound into our
 *      structured logs so a single log line can be traced from
 *      browser through Vercel edge through serverless function.
 *
 *   2. Add baseline security headers that aren't worth handling at
 *      the route level: strict referrer policy, X-Content-Type-
 *      Options nosniff, Permissions-Policy locking down apis we
 *      don't use, etc.
 *
 *   3. CORS preflight pass-through for /api/openapi so SDK
 *      generators can fetch the spec from any origin.
 */

const STATIC_PATTERNS = [
  /^\/_next\//,
  /^\/static\//,
  /^\/favicon\.ico$/,
  /^\/.*\.(png|jpg|jpeg|webp|svg|gif|ico|css|js|map|woff2?|ttf|otf)$/,
];

function shouldSkip(pathname: string): boolean {
  return STATIC_PATTERNS.some((re) => re.test(pathname));
}

function makeRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return (
    "req_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (shouldSkip(pathname)) return NextResponse.next();

  const incoming =
    req.headers.get("x-request-id") || req.headers.get("x-vercel-id");
  const requestId = incoming || makeRequestId();

  // Pass the id forward into the route handler.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-request-id", requestId);

  const res = NextResponse.next({ request: { headers: reqHeaders } });

  // Echo the id back so the client can correlate.
  res.headers.set("x-request-id", requestId);

  // Baseline security headers.
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  // Block framing only on non-marketing routes; embeddable widgets
  // (faucet pill on partner sites, etc.) are not in scope yet.
  res.headers.set("X-Frame-Options", "SAMEORIGIN");

  // CORS for the public spec endpoint.
  if (pathname === "/api/openapi") {
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }

  return res;
}

/**
 * Run on every request EXCEPT the static-asset patterns the matcher
 * already excludes. The function-level guard above stays as a safety
 * net but the matcher gives us better edge-cache behavior.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|css|js|woff2?|ttf|otf)).*)",
  ],
};
