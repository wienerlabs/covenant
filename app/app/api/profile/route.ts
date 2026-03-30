import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, displayName, bio, role } = body;

    if (!walletAddress || !displayName) {
      return NextResponse.json(
        { error: "walletAddress and displayName are required" },
        { status: 400 }
      );
    }

    // Check if profile already exists
    const existing = await prisma.profile.findUnique({
      where: { walletAddress },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Profile already exists for this wallet" },
        { status: 409 }
      );
    }

    // Generate random 8-char hex seed for avatar
    const avatarSeed = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

    const profile = await prisma.profile.create({
      data: {
        walletAddress,
        displayName,
        bio: bio || "",
        role: role || "both",
        avatarSeed,
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error("POST /api/profile error:", error);
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 }
    );
  }
}
