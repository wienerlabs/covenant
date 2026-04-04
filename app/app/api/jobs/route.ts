import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMarkerTransaction } from "@/lib/solana";
import { lockFundsInEscrow } from "@/lib/escrow";
import { rateLimit } from "@/lib/rateLimit";
import crypto from "crypto";
import { Keypair } from "@solana/web3.js";

export async function GET(request: NextRequest) {
  try {
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

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { [orderField]: sortOrder },
        include: { submissions: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ jobs, total, page, limit, totalPages });
  } catch (error) {
    console.error("GET /api/jobs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "global";
  const rl = rateLimit(`jobs:${ip}`, 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 20 job creations per minute." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body = await request.json();
    const { posterWallet, amount, minWords, language, deadline, category, paymentToken } = body;

    if (!posterWallet || typeof posterWallet !== "string") {
      return NextResponse.json(
        { error: "posterWallet is required" },
        { status: 400 }
      );
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

    const specJson = {
      posterWallet,
      amount,
      minWords,
      language: language || "en",
      deadline: deadlineDate.toISOString(),
      createdAt: new Date().toISOString(),
    };

    const specHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(specJson))
      .digest("hex");

    const job = await prisma.job.create({
      data: {
        posterWallet,
        amount,
        specHash,
        specJson,
        minWords,
        category: category || "text_writing",
        paymentToken: paymentToken === "SOL" ? "SOL" : "USDC",
        language: language || "en",
        deadline: deadlineDate,
        status: "Open",
      },
    });

    // Send Solana marker transaction (non-blocking)
    let txHash: string | null = null;
    try {
      txHash = await sendMarkerTransaction("create_job:" + job.id);
      // Update job with txHash and create Transaction record
      await Promise.all([
        prisma.job.update({
          where: { id: job.id },
          data: { txHash },
        }),
        prisma.transaction.create({
          data: {
            txHash,
            type: "create_job",
            jobId: job.id,
            wallet: posterWallet,
            amount,
            status: "confirmed",
          },
        }),
      ]);
    } catch (err) {
      console.error("[solana] Failed to send marker tx for create_job:", err);
    }

    // Attempt real token escrow lock for known wallets
    let escrowTxHash: string | null = null;
    const knownWallets: Record<string, string> = {};
    if (process.env.AGENT_ALPHA_WALLET) knownWallets[process.env.AGENT_ALPHA_WALLET] = "AGENT_ALPHA_KEYPAIR";
    if (process.env.AGENT_OMEGA_WALLET) knownWallets[process.env.AGENT_OMEGA_WALLET] = "AGENT_OMEGA_KEYPAIR";
    try {
      const deployerKpRaw = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
      if (deployerKpRaw.length > 0) {
        const deployerWallet = Keypair.fromSecretKey(Uint8Array.from(deployerKpRaw)).publicKey.toBase58();
        knownWallets[deployerWallet] = "DEPLOYER_KEYPAIR";
      }
    } catch { /* ignore */ }

    const keypairEnv = knownWallets[posterWallet];
    if (keypairEnv && (paymentToken !== "SOL")) {
      try {
        const result = await lockFundsInEscrow(keypairEnv, amount);
        escrowTxHash = result.txHash;
        await prisma.job.update({ where: { id: job.id }, data: { txHash: escrowTxHash } });
        await prisma.transaction.create({
          data: { txHash: escrowTxHash, type: "escrow_lock", jobId: job.id, wallet: posterWallet, amount, status: "confirmed" },
        });
      } catch (err) {
        console.error("[escrow] Lock failed:", err);
      }
    }

    return NextResponse.json({ ...job, txHash: escrowTxHash || txHash }, { status: 201 });
  } catch (error) {
    console.error("POST /api/jobs error:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
