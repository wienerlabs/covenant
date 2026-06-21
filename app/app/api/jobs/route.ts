import { NextRequest, NextResponse } from "next/server";
import { blockSimulatedRouteIfOnchain } from "@/lib/settlement";
import { prisma, ensureSchema, retryable } from "@/lib/prisma";
import { memoize } from "@/lib/cache";
import { sendMarkerTransaction } from "@/lib/solana";
import { rateLimitDurable, getLimit } from "@/lib/rateLimit";
import { buildJobSpec, hashJobSpec } from "@/lib/spec";
import { moderateJobContent } from "@/lib/moderation";
import { requireAuth, requireWalletMatch } from "@/lib/require-auth";
import { log } from "@/lib/logger";
import { screenWallet } from "@/lib/sanctions";
import type { Prisma } from "@prisma/client";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  botCreateJob,
  fetchJobEscrow,
  deriveJobPda,
  verifyTxInvokedCovenant,
  keypairFromEnv,
} from "@/lib/program-server";
import { checkCreateJob } from "@/lib/onchain-verify";
import { classifySolanaError } from "@/lib/solana-errors";
import { USDC_MINT } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    await ensureSchema().catch(() => { /* non-fatal */ });
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const poster = searchParams.get("poster");
    const taker = searchParams.get("taker");

    const category = searchParams.get("category");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
    const search = searchParams.get("search");

    // Pagination params
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20", 10)));
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (poster) where.posterWallet = poster;
    if (taker) where.takerWallet = taker;
    if (category) where.category = category;

    // Price range filtering
    if (minAmount || maxAmount) {
      const amountFilter: Record<string, number> = {};
      if (minAmount) amountFilter.gte = parseFloat(minAmount);
      if (maxAmount) amountFilter.lte = parseFloat(maxAmount);
      where.amount = amountFilter;
    }

    // Search in specJson title/description via raw query fallback,
    // or use Prisma string_contains on the JSON cast
    if (search) {
      where.OR = [
        { specJson: { path: ["title"], string_contains: search } },
        { specJson: { path: ["description"], string_contains: search } },
        { category: { contains: search, mode: "insensitive" } },
      ];
    }

    // Build orderBy based on sortBy param
    const validSortFields = ["createdAt", "amount", "status", "deadline"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    // Cache hot reads. Cache key is the full filter payload so
    // each unique query gets its own entry. TTL is short (3s) so
    // newly posted jobs appear quickly under refresh, but back-
    // to-back hits during a render burst hit cache instead of
    // round-tripping through Prisma + Neon. Invalidation isn't
    // strictly needed at this TTL — stale-while-revalidate keeps
    // the freshness lag bounded.
    const cacheKey = `jobs:list:${JSON.stringify({
      where,
      orderField,
      sortOrder,
      page,
      limit,
    })}`;

    const [jobs, total] = await memoize(cacheKey, 3_000, () =>
      retryable(() =>
        Promise.all([
          prisma.job.findMany({
            where,
            orderBy: { [orderField]: sortOrder },
            include: {
              submissions: true,
              delivery: true,
              dispute: true,
              claim: true,
              interests: {
                where: { status: "working" },
                select: { takerWallet: true, acceptedAt: true },
              },
            },
            skip: (page - 1) * limit,
            take: limit,
          }),
          prisma.job.count({ where }),
        ]),
      ),
    );

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ jobs, total, page, limit, totalPages });
  } catch (error) {
    // Graceful fail — return empty list with dbHealthy:false instead of
    // 500-ing the whole route. The UI can then render an empty state
    // without falling apart while we diagnose the DB issue.
    console.error("GET /api/jobs error:", error);
    return NextResponse.json(
      {
        jobs: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        dbHealthy: false,
        error: error instanceof Error ? error.message : "Failed to fetch jobs",
      },
      { status: 200 },
    );
  }
}

export async function POST(request: NextRequest) {
  const blocked = blockSimulatedRouteIfOnchain("POST /api/jobs");
  if (blocked) return blocked;

  const reqLog = log.forRequest(request); // C-110: correlate this request
  const __raw = await request.text();
  const __auth = await requireAuth(request, { rawBody: __raw }); // C-091
  if (!__auth.ok)
    return NextResponse.json({ error: __auth.reason }, { status: __auth.status });

  await ensureSchema().catch(() => { /* non-fatal */ });
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  // Devnet rate limit (per-table in lib/rateLimit.ts).
  const { limit, windowMs } = getLimit("create_job");
  const rl = await rateLimitDurable(`jobs:${ip}`, limit, windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 20 job creations per minute." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body = __raw ? JSON.parse(__raw) : {};
    const {
      posterWallet,
      amount,
      minWords,
      language,
      deadline,
      category,
      paymentToken,
      title,
      description,
      requirements,
      sourceText,
      repoUrl,
      targetUrl,
      stylePreference,
      escrowTxHash: clientEscrowTxHash,
      escrowAta: clientEscrowAta,
      demoMode: clientDemoMode,
      // Client-supplied ISO timestamp used in spec building. The browser
      // computes specHash against the same `createdAt`, so the client
      // and server agree on the PDA. If absent (legacy bot path), the
      // server picks a fresh timestamp.
      createdAt: clientCreatedAt,
    } = body;

    if (!posterWallet || typeof posterWallet !== "string") {
      return NextResponse.json(
        { error: "posterWallet is required" },
        { status: 400 }
      );
    }

    // IDOR bind: the signer must control the poster wallet the job is created
    // under (no posting jobs as someone else once enforced).
    const __guard = requireWalletMatch(__auth, posterWallet);
    if (!__guard.ok)
      return NextResponse.json({ error: __guard.reason }, { status: __guard.status });

    // C-105: block sanctioned (OFAC) wallets at the on-ramp.
    const sanctioned = screenWallet(posterWallet);
    if (sanctioned.blocked) {
      return NextResponse.json({ error: sanctioned.reason }, { status: 403 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }
    if (!minWords || typeof minWords !== "number" || minWords <= 0) {
      return NextResponse.json(
        { error: "minWords must be a positive number" },
        { status: 400 }
      );
    }
    if (!deadline) {
      return NextResponse.json(
        { error: "deadline is required" },
        { status: 400 }
      );
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json(
        { error: "deadline must be a valid date" },
        { status: 400 }
      );
    }

    // The createdAt timestamp must be stable between client and server —
    // both compute the same spec hash and the on-chain Job PDA is derived
    // from it. The client provides createdAt for human-wallet flows; if
    // missing (bot/server flows), we synthesize one server-side.
    const effectiveCreatedAt =
      typeof clientCreatedAt === "string" && clientCreatedAt.length > 0
        ? clientCreatedAt
        : new Date().toISOString();

    // C-103: reject prohibited content (Acceptable Use Policy) before
    // persisting anything to the DB or chain.
    const moderation = moderateJobContent({ title, description, requirements });
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 });
    }

    const specJsonRaw = buildJobSpec({
      posterWallet,
      amount,
      minWords,
      language: language || "English",
      deadline: deadlineDate.toISOString(),
      createdAt: effectiveCreatedAt,
      title: title || "",
      description: description || "",
      requirements: requirements || "",
      sourceText,
      repoUrl,
      targetUrl,
      stylePreference,
    });

    const specHash = await hashJobSpec(specJsonRaw);
    // Prisma's InputJsonValue is stricter than `Record<string, unknown>`
    // (no readonly arrays, no symbols). The shape is JSON-safe, but the
    // structural type doesn't match exactly — cast once here so all three
    // prisma.job.create call sites can pass it through cleanly.
    const specJson = specJsonRaw as unknown as Prisma.InputJsonValue;

    // ---- On-chain settlement ----
    //
    // The legacy custodial path (poster's USDC moved to a single
    // deployer-controlled wallet) is gone. There are now exactly two
    // ways a Job row can come into existence:
    //
    //   (A) HUMAN flow: the browser already invoked the on-chain
    //       `create_job` instruction via lib/anchor-browser.ts and
    //       passes us the resulting tx signature. We verify the tx
    //       invoked the Covenant program and fetch the JobEscrow PDA
    //       to mirror its state into our DB.
    //
    //   (B) BOT flow: poster is a server-held demo agent (Alpha /
    //       Omega / Deployer / Autonomous). The server signs with
    //       the bot's keypair and runs `botCreateJob`, which calls
    //       the same on-chain instruction. The server is acting on
    //       the bot's behalf with the bot's own funds — it never
    //       signs for human-user funds.
    //
    // Either path produces a real per-job PDA escrow on Solana.
    // Neither path moves funds through a shared deployer wallet.

    if (paymentToken === "SOL") {
      // SOL settlement is not part of v1 on-chain protocol. Record the
      // job with no escrow backing and surface a clear flag so the UI
      // can warn that nothing is locked.
      const job = await prisma.job.create({
        data: {
          posterWallet,
          amount,
          specHash,
          specJson,
          minWords,
          category: category || "text_writing",
          paymentToken: "SOL",
          language: language || "en",
          deadline: deadlineDate,
          status: "Open",
        },
      });
      let markerTxHash: string | null = null;
      try {
        markerTxHash = await sendMarkerTransaction("create_job:" + job.id);
        reqLog.info("create_job tx", { jobId: job.id, txHash: markerTxHash }); // C-110: tx sig logged
        await prisma.job.update({ where: { id: job.id }, data: { txHash: markerTxHash } });
      } catch { /* non-blocking */ }
      return NextResponse.json(
        { ...job, txHash: markerTxHash, escrowLocked: false, note: "SOL escrow not supported in v1 — record-only" },
        { status: 201 },
      );
    }

    // Identify whether poster is a known bot keypair.
    const botEnvForPoster: string | null = (() => {
      if (process.env.AGENT_ALPHA_WALLET === posterWallet) return "AGENT_ALPHA_KEYPAIR";
      if (process.env.AGENT_OMEGA_WALLET === posterWallet) return "AGENT_OMEGA_KEYPAIR";
      try {
        const deployerRaw = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
        if (deployerRaw.length > 0) {
          const deployerWallet = Keypair.fromSecretKey(
            Uint8Array.from(deployerRaw),
          ).publicKey.toBase58();
          if (deployerWallet === posterWallet) return "DEPLOYER_KEYPAIR";
        }
      } catch { /* ignore */ }
      return null;
    })();

    // ---- Path B: bot-signed on-chain create_job ----
    if (!clientEscrowTxHash && botEnvForPoster) {
      try {
        const botKeypair = keypairFromEnv(botEnvForPoster);
        const specHashBuf = Buffer.from(specHash, "hex");
        const deadlineUnix = Math.floor(deadlineDate.getTime() / 1000);
        // Use a 1h challenge period for bot demos (matches protocol min).
        const { sig, jobPda, escrowTokenAccount } = await botCreateJob({
          botKeypair,
          amount,
          specHash: specHashBuf,
          deadline: deadlineUnix,
          challengePeriod: 3600,
        });
        const onchain = await fetchJobEscrow(jobPda);
        const job = await prisma.job.create({
          data: {
            posterWallet,
            amount,
            specHash,
            specJson,
            minWords,
            category: category || "text_writing",
            paymentToken: "USDC",
            language: language || "en",
            deadline: deadlineDate,
            status: onchain?.status || "Open",
            txHash: sig,
            pda: jobPda.toBase58(),
            escrowAta: escrowTokenAccount.toBase58(),
          },
        });
        await prisma.transaction.create({
          data: {
            txHash: sig,
            type: "create_job",
            jobId: job.id,
            wallet: posterWallet,
            amount,
            status: "confirmed",
          },
        });
        return NextResponse.json(
          { ...job, escrowLocked: true, jobPda: jobPda.toBase58() },
          { status: 201 },
        );
      } catch (err) {
        console.error("[create_job] bot-signed flow failed:", err);
        return NextResponse.json(
          { error: "Bot-signed create_job failed: " + (err instanceof Error ? err.message : String(err)) },
          { status: 500 },
        );
      }
    }

    // ---- Demo bypass: record-only USDC job, no on-chain verification ----
    // The browser flow tries real on-chain create_job first. If the wallet
    // adapter rejects the escrow co-signer (a known limitation of some
    // wallet-standard adapters until the program migrates to PDA-derived
    // ATAs), the client retries with demoMode: true and lands here so the
    // demo stays unblocked.
    if (clientDemoMode === true) {
      const job = await prisma.job.create({
        data: {
          posterWallet,
          amount,
          specHash,
          specJson,
          minWords,
          category: category || "text_writing",
          paymentToken: "USDC",
          language: language || "en",
          deadline: deadlineDate,
          status: "Open",
          escrowAta: clientEscrowAta || null,
        },
      });
      let markerTxHash: string | null = null;
      try {
        markerTxHash = await sendMarkerTransaction("create_job_demo:" + job.id);
        await prisma.job.update({ where: { id: job.id }, data: { txHash: markerTxHash } });
      } catch { /* non-blocking */ }
      return NextResponse.json(
        {
          ...job,
          txHash: markerTxHash,
          escrowLocked: false,
          demoMode: true,
          note: "Demo mode — record-only job, on-chain escrow skipped due to wallet co-signer limitation",
        },
        { status: 201 },
      );
    }

    // ---- Path A: human wallet — verify the client-signed on-chain tx ----
    if (!clientEscrowTxHash) {
      return NextResponse.json(
        {
          error:
            "Missing escrowTxHash. Human wallets must invoke create_job on chain via " +
            "@solana/anchor-browser before calling this endpoint. See README → 'Creating a job'.",
        },
        { status: 400 },
      );
    }

    try {
      // 1) Confirm the tx exists, didn't revert, AND actually invoked
      //    our program (catches arbitrary-tx replay; audit C-04).
      await verifyTxInvokedCovenant(clientEscrowTxHash);

      // 2) Fetch the JobEscrow PDA the tx created and mirror it.
      const [jobPda] = deriveJobPda(
        new PublicKey(posterWallet),
        Buffer.from(specHash, "hex"),
      );
      const onchain = await fetchJobEscrow(jobPda);
      if (!onchain) {
        throw new Error(
          `JobEscrow PDA ${jobPda.toBase58().slice(0, 8)}… not found after tx confirmed. ` +
          `Tx may have been for a different spec hash.`,
        );
      }
      // C-011: the escrow must be ours, hold the stated amount AND the required
      // USDC mint (not a forged worthless token), at the PDA derived from
      // [b"job", poster, spec_hash]. Reject mismatches — no DB row is written.
      const verdict = checkCreateJob(onchain, {
        poster: posterWallet,
        specHashHex: specHash,
        minAmountAtomic: BigInt(Math.round(amount * 1_000_000)),
        mint: USDC_MINT.toBase58(),
      });
      if (!verdict.ok) {
        throw new Error(verdict.reason);
      }

      // 3) Mirror to DB. Replay protection: txHash is unique per Job row.
      const job = await prisma.job.create({
        data: {
          posterWallet,
          amount,
          specHash,
          specJson,
          minWords,
          category: category || "text_writing",
          paymentToken: "USDC",
          language: language || "en",
          deadline: deadlineDate,
          status: onchain.status,
          txHash: clientEscrowTxHash,
          pda: jobPda.toBase58(),
          escrowAta: clientEscrowAta || null,
        },
      });
      await prisma.transaction.create({
        data: {
          txHash: clientEscrowTxHash,
          type: "create_job",
          jobId: job.id,
          wallet: posterWallet,
          amount,
          status: "confirmed",
        },
      });

      // Optional human-readable marker (non-blocking).
      try {
        const __createSig = await sendMarkerTransaction("create_job:" + job.id);
        reqLog.info("create_job tx", { jobId: job.id, txHash: __createSig }); // C-110: tx sig logged
      } catch { /* non-blocking */ }

      return NextResponse.json(
        { ...job, escrowLocked: true, jobPda: jobPda.toBase58() },
        { status: 201 },
      );
    } catch (err) {
      console.error("[create_job] on-chain verification failed:", err);
      // C-023: classify the failure so the caller gets a clear, actionable
      // error (and retryable RPC blips read as 503). No DB row was written —
      // verification happens before any create.
      const cls = classifySolanaError(err);
      return NextResponse.json(
        {
          error: "On-chain create_job verification failed. No DB row written.",
          detail: err instanceof Error ? err.message : String(err),
          failureMode: cls.mode,
          retryable: cls.retryable,
        },
        { status: cls.mode === "rate_limited" ? 503 : 400 },
      );
    }
  } catch (error) {
    console.error("POST /api/jobs error:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
