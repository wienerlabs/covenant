import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;

    const profile = await prisma.profile.findUnique({
      where: { walletAddress: wallet },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("GET /api/profile/[wallet] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;
    const body = await request.json();
    const { displayName, bio, role } = body as {
      displayName?: string;
      bio?: string;
      role?: string;
    };

    const updateData: Record<string, string> = {};
    if (displayName !== undefined) {
      if (typeof displayName !== "string" || displayName.trim().length === 0) {
        return NextResponse.json({ error: "displayName must be a non-empty string" }, { status: 400 });
      }
      updateData.displayName = displayName.trim();
    }
    if (bio !== undefined) {
      updateData.bio = typeof bio === "string" ? bio.trim() : "";
    }
    if (role !== undefined) {
      const validRoles = ["poster", "taker", "both"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "role must be one of: poster, taker, both" }, { status: 400 });
      }
      updateData.role = role;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const profile = await prisma.profile.update({
      where: { walletAddress: wallet },
      data: updateData,
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("PATCH /api/profile/[wallet] error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
