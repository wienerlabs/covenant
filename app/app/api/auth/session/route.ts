import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readCookie, verifySession } from "@/lib/session";
import { sessionConfigured } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session — who am I?
 *
 * Returns the wallet bound to the current session cookie (or null). The client
 * uses this to decide whether it still needs to prompt a login signature.
 * `configured` lets the client skip the login flow entirely when session auth
 * is not enabled on this deployment.
 */
export async function GET(req: NextRequest) {
  const token = readCookie(req, SESSION_COOKIE);
  const sess = verifySession(token, Date.now());
  return NextResponse.json({
    wallet: sess?.wallet ?? null,
    configured: sessionConfigured(),
  });
}
