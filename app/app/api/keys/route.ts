import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
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
    const { wallet, name } = body;

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet is required" },
        { status: 400 }
      );
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
