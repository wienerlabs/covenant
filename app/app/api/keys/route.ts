import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWalletSignature } from "@/lib/wallet-auth";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const signature = req.nextUrl.searchParams.get("signature");
  const message = req.nextUrl.searchParams.get("message");
  const ts = req.nextUrl.searchParams.get("ts");

  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }
  if (!signature || !message || ts === null) {
    return NextResponse.json(
      { error: "signature, message, and ts are required" },
      { status: 400 }
    );
  }

  const expectedMessage = `cvn:keys:list:${wallet}:${ts}`;
  const verified = verifyWalletSignature({
    wallet,
    signature,
    message,
    expectedMessage,
    ts,
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  try {
    const keys = await prisma.apiKey.findMany({
      where: { wallet },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ keys });
  } catch (err) {
    console.error("List keys error:", err);
    return NextResponse.json(
      { error: "Failed to list keys" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, name, signature, message, ts } = body;

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet is required" },
        { status: 400 }
      );
    }
    if (!signature || !message || ts === undefined || ts === null) {
      return NextResponse.json(
        { error: "signature, message, and ts are required" },
        { status: 400 }
      );
    }

    const expectedMessage = `cvn:keys:create:${wallet}:${ts}`;
    const verified = verifyWalletSignature({
      wallet,
      signature,
      message,
      expectedMessage,
      ts,
    });
    if (!verified.ok) {
      return NextResponse.json({ error: verified.reason }, { status: 401 });
    }

    // Generate a random 32-char hex key prefixed with "cvn_"
    const randomHex = crypto.randomBytes(16).toString("hex");
    const key = `cvn_${randomHex}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        wallet,
        name: name || "Default",
      },
    });

    return NextResponse.json({
      id: apiKey.id,
      key: apiKey.key,
      name: apiKey.name,
      calls: apiKey.calls,
      limit: apiKey.limit,
      active: apiKey.active,
      createdAt: apiKey.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Create key error:", err);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
