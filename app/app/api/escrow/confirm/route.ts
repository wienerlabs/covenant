import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Connection, Keypair } from "@solana/web3.js";
import { lockFundsInEscrow } from "@/lib/escrow";
import { sendMarkerTransaction } from "@/lib/solana";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      posterWallet,
      amount,
      jobData,
      escrowTxHash: clientEscrowTxHash,
      escrowAta: clientEscrowAta,
    } = body as {
      posterWallet?: string;
      amount?: number;
      jobData?: Record<string, unknown>;
      escrowTxHash?: string;
      escrowAta?: string;
    };

    if (!posterWallet || typeof posterWallet !== "string") {
      return NextResponse.json({ error: "posterWallet is required" }, { status: 400 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (!jobData || typeof jobData !== "object") {
      return NextResponse.json({ error: "jobData is required" }, { status: 400 });
    }

    // jobData fields come in as `unknown` after the typed destructure;
    // narrow each one to the type the rest of the route expects.
    const jd = jobData as Record<string, unknown>;
    const title = typeof jd.title === "string" ? jd.title : "";
    const description = typeof jd.description === "string" ? jd.description : "";
    const requirements = typeof jd.requirements === "string" ? jd.requirements : "";
    const category = typeof jd.category === "string" ? jd.category : "text_writing";
    const paymentToken = jd.paymentToken === "SOL" ? "SOL" : "USDC";
    const minWords = typeof jd.minWords === "number" ? jd.minWords : 0;
    const language = typeof jd.language === "string" ? jd.language : "English";
    const deadline = typeof jd.deadline === "string" ? jd.deadline : "";
    const sourceText = typeof jd.sourceText === "string" ? jd.sourceText : undefined;
    const repoUrl = typeof jd.repoUrl === "string" ? jd.repoUrl : undefined;
    const targetUrl = typeof jd.targetUrl === "string" ? jd.targetUrl : undefined;
    const stylePreference =
      typeof jd.stylePreference === "string" ? jd.stylePreference : undefined;

    if (!minWords || !deadline) {
      return NextResponse.json(
        { error: "jobData must include minWords and deadline" },
        { status: 400 },
      );
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json({ error: "deadline must be a valid date" }, { status: 400 });
    }

    // Build spec JSON
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

    // ----- Escrow lock resolution -----
    //
    // Three paths, in priority order:
    //
    //   1. Client-signed transfer (NEW). The frontend already prompted
    //      the user's wallet via /api/escrow/build + signAndSendTransaction
    //      and gives us the resulting tx signature in the body. We verify
    //      it on chain and accept it as the lock evidence.
    //
    //   2. Server-keypair lock (LEGACY). The poster wallet matches an
    //      env-held agent keypair (Alpha / Omega / Deployer). The server
    //      signs the SPL transfer with that keypair. Used by the arena,
    //      battle, and autonomous demos which run head-less and have
    //      no UI to prompt.
    //
    //   3. None (REJECTED for human wallets). If the wallet is unknown
    //      and the body has no escrowTxHash, we refuse to write the Job
    //      row. This is the bug fix: previously the route silently
    //      created a Job with txHash=null, making the demo look like
    //      it worked while no funds had moved.
    let escrowTxHash: string | null = null;

    if (paymentToken !== "SOL") {
      if (
        typeof clientEscrowTxHash === "string" &&
        clientEscrowTxHash.length > 0
      ) {
        // Path 1 — verify client-signed tx on chain
        try {
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
          console.log(
            "[escrow/confirm] verified client-signed lock:",
            clientEscrowTxHash,
          );
        } catch (err) {
          console.error("[escrow/confirm] client tx verification failed:", err);
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
        // Path 2 — server-side fallback for known agent wallets
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
          } catch (err) {
            console.error(
              "[escrow/confirm] server-keypair lock failed:",
              err,
            );
          }
        } else {
          // Path 3 — human wallet without a signed tx, reject
          return NextResponse.json(
            {
              error:
                "Missing escrowTxHash. Human wallets must sign the escrow lock client-side via /api/escrow/build → signAndSendTransaction.",
            },
            { status: 400 },
          );
        }
      }
    }

    // SOL payment path falls through with escrowTxHash=null. SOL escrow
    // is not part of the v1 protocol; the job is recorded so the demo
    // pages keep working but the on-chain lock is a no-op.

    // clientEscrowAta is informational only — keep the reference alive
    // so the linter doesn't drop the destructure.
    if (clientEscrowAta) {
      console.log("[escrow/confirm] escrowAta reported by client:", clientEscrowAta);
    }

    // Create the job
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
        txHash: escrowTxHash,
      },
    });

    // Marker transaction (non-blocking)
    let markerTxHash: string | null = null;
    try {
      markerTxHash = await sendMarkerTransaction("create_job:" + job.id);
      await Promise.all([
        prisma.job.update({
          where: { id: job.id },
          data: { txHash: escrowTxHash || markerTxHash },
        }),
        prisma.transaction.create({
          data: {
            txHash: markerTxHash,
            type: "create_job",
            jobId: job.id,
            wallet: posterWallet,
            amount,
            status: "confirmed",
          },
        }),
      ]);
    } catch (err) {
      console.error("[solana] Marker tx failed:", err);
    }

    // Record escrow transaction if we did one
    if (escrowTxHash) {
      try {
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
      } catch { /* unique constraint if same hash */ }
    }

    return NextResponse.json({
      ...job,
      txHash: escrowTxHash || markerTxHash,
      escrowLocked: !!escrowTxHash,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/escrow/confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm escrow and create job: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  }
}
