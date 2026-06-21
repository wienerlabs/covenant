import { NextRequest, NextResponse } from "next/server";
import { verifyWalletSignature } from "@/lib/wallet-auth";
import {
  issueSession,
  loginMessage,
  sessionConfigured,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/session";
import { enforceIpLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 *
 * Exchange a one-time wallet signature for a session cookie. The client signs
 * `covenant-login:v1\n<wallet>\n<ts>` with the connected wallet; on success we
 * set an httpOnly, SameSite=Lax session cookie that every later same-origin
 * request carries automatically (so mutating endpoints can authenticate
 * without a per-request popup).
 *
 * Body: { wallet, signature, ts, message? }
 */
export async function POST(req: NextRequest) {
  const limited = await enforceIpLimit(req, "auth_login");
  if (limited) return limited;

  if (!sessionConfigured()) {
    return NextResponse.json(
      { error: "Session auth is not configured (set SESSION_SECRET, >=16 chars)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { wallet, signature, ts, message } = body as {
    wallet?: string;
    signature?: string;
    ts?: string | number;
    message?: string;
  };
  if (!wallet || !signature || ts === undefined || ts === null) {
    return NextResponse.json(
      { error: "wallet, signature, and ts are required" },
      { status: 400 },
    );
  }

  const expected = loginMessage(wallet, ts);
  const v = verifyWalletSignature({
    wallet,
    signature,
    message: message ?? expected,
    expectedMessage: expected,
    ts,
  });
  if (!v.ok) {
    return NextResponse.json({ error: v.reason }, { status: 401 });
  }

  const token = issueSession(wallet, Date.now());
  const res = NextResponse.json({ ok: true, wallet });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
