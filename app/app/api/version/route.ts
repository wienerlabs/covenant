import { NextResponse } from "next/server";

/**
 * GET /api/version
 *
 * Static identification of the deployed build. Useful when:
 *   - You suspect a stale cache and want to verify the prod
 *     bundle matches the commit you just pushed.
 *   - A monitor needs to detect deploy promotions.
 *   - A user reports a bug and you need a precise commit to
 *     diff against.
 *
 * The route is `force-static` so the body is baked into the build
 * output — every response shows the exact commit that produced it,
 * with zero runtime cost. `revalidate = false` keeps it static
 * forever (until the next deploy redeploys it).
 */

export const dynamic = "force-static";
export const revalidate = false;
export const runtime = "edge";

export async function GET() {
  const body = {
    name: "covenant",
    cluster: "devnet",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commit_short: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    repo: process.env.VERCEL_GIT_REPO_SLUG ?? null,
    deploy_url: process.env.VERCEL_URL ?? null,
    region: process.env.VERCEL_REGION ?? null,
    deploy_env: process.env.VERCEL_ENV ?? null,
    // Captured at module load (build time). Lets you compute drift
    // between deploy promotion and actual user-facing start.
    built_at: new Date().toISOString(),
    runtime: "edge",
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
