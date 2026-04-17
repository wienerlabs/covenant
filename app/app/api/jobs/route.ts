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
    } = body;

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
      language: language || "English",
      deadline: deadlineDate.toISOString(),
      createdAt: new Date().toISOString(),
      title: title || "",
      description: description || "",
      requirements: requirements || "",
      ...(sourceText ? { sourceText } : {}),
      ...(repoUrl ? { repoUrl } : {}),
      ...(targetUrl ? { targetUrl } : {}),
      ...(stylePreference ? { stylePreference } : {}),
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

    // --- Escrow lock ---
    // Two paths depending on who the poster is:
    //
    // 1. Human user (has a connected wallet)
    //    The client already built + signed + broadcast the SPL transfer
    //    via the user's wallet. It passes the resulting `escrowTxHash`
    //    in the request body. We only need to verify it exists on chain
    //    (we trust Solana to have validated the actual transfer).
    //
    // 2. Server-held agent wallet (arena, battle, autonomous flows)
    //    The poster is AGENT_ALPHA / AGENT_OMEGA / DEPLOYER, all held as
    //    env keypairs. Fall back to `lockFundsInEscrow` so the server
    //    signs with the env keypair. This path is NOT used by the
    //    human-facing CreateJobForm any more.
    let escrowTxHash: string | null = null;
    if (paymentToken !== "SOL") {
      if (typeof clientEscrowTxHash === "string" && clientEscrowTxHash.length > 0) {
        // Path 1: verify the user-signed tx on chain.
        try {
          const { Connection } = await import("@solana/web3.js");
          const rpc =
            process.env.HELIUS_RPC_URL ||
            process.env.NEXT_PUBLIC_RPC_URL ||
            "https://api.devnet.solana.com";
          const connection = new Connection(rpc, "confirmed");
          const tx = await connection.getTransaction(clientEscrowTxHash, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
          if (!tx) {
            throw new Error(
              `Escrow tx ${clientEscrowTxHash.slice(0, 8)}... not found on chain`,
            );
          }
          if (tx.meta?.err) {
            throw new Error(
              `Escrow tx reverted: ${JSON.stringify(tx.meta.err)}`,
            );
          }
          escrowTxHash = clientEscrowTxHash;
          await prisma.job.update({
            where: { id: job.id },
            data: { txHash: escrowTxHash },
          });
          await prisma.transaction.create({
            data: {
              txHash: escrowTxHash,
              type: "escrow_lock",
              jobId: job.id,
              wallet: posterWallet,
              amount,
              status: "confirmed",
            },
          });
          console.log("[escrow] verified client-signed lock:", clientEscrowTxHash);
        } catch (err) {
          console.error("[escrow] client tx verification failed:", err);
          // Rollback the Job row since the escrow didn't actually lock.
          await prisma.job.delete({ where: { id: job.id } }).catch(() => undefined);
          return NextResponse.json(
            {
              error:
                "Escrow transaction could not be verified on chain. No funds were locked. " +
                (err instanceof Error ? err.message : String(err)),
            },
            { status: 400 },
          );
        }
      } else {
        // Path 2: server-side agent flow (arena/battle/autonomous only)
        const knownWallets: Record<string, string> = {};
        if (process.env.AGENT_ALPHA_WALLET)
          knownWallets[process.env.AGENT_ALPHA_WALLET] = "AGENT_ALPHA_KEYPAIR";
        if (process.env.AGENT_OMEGA_WALLET)
          knownWallets[process.env.AGENT_OMEGA_WALLET] = "AGENT_OMEGA_KEYPAIR";
        try {
          const deployerKpRaw = JSON.parse(process.env.DEPLOYER_KEYPAIR || "[]");
          if (deployerKpRaw.length > 0) {
            const deployerWallet = Keypair.fromSecretKey(
              Uint8Array.from(deployerKpRaw),
            ).publicKey.toBase58();
            knownWallets[deployerWallet] = "DEPLOYER_KEYPAIR";
          }
        } catch {
          /* ignore */
        }

        const keypairEnv = knownWallets[posterWallet];
        if (keypairEnv) {
          try {
            const result = await lockFundsInEscrow(keypairEnv, amount);
            escrowTxHash = result.txHash;
            await prisma.job.update({
              where: { id: job.id },
              data: { txHash: escrowTxHash },
            });
            await prisma.transaction.create({
              data: {
                txHash: escrowTxHash,
                type: "escrow_lock",
                jobId: job.id,
                wallet: posterWallet,
                amount,
                status: "confirmed",
              },
            });
          } catch (err) {
            console.error("[escrow] server-keypair lock failed:", err);
          }
        } else {
          // Unknown wallet without a client-signed tx -- reject so we
          // don't end up with a job that has no escrow backing.
          await prisma.job.delete({ where: { id: job.id } }).catch(() => undefined);
          return NextResponse.json(
            {
              error:
                "Missing escrowTxHash. Human wallets must sign the escrow lock client-side.",
            },
            { status: 400 },
          );
        }
      }
    }

    // Keep clientEscrowAta reference alive for forward compatibility.
    if (clientEscrowAta) {
      console.log("[escrow] escrowAta reported by client:", clientEscrowAta);
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
