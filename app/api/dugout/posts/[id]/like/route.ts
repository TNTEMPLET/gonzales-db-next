import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

const ALLOWED_REACTIONS = ["👍", "⚾", "🔥", "👏", "🎉", "💪", "🙌"];

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const coachUser = await getCoachUserFromRequest(request);
  if (coachUser) return coachUser.id;

  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return null;

  const reg = await prisma.registeredUser.findUnique({
    where: { email: adminUser.email },
    select: { id: true },
  });
  return reg?.id ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: "No linked user account found" },
      { status: 403 },
    );
  }

  const { id } = await params;

  let reaction = "👍";
  try {
    const body = (await request.json()) as { reaction?: string };
    if (body.reaction && ALLOWED_REACTIONS.includes(body.reaction)) {
      reaction = body.reaction;
    }
  } catch {
    // no body — use default
  }

  try {
    await prisma.dugoutPostLike.upsert({
      where: {
        postId_userId: {
          postId: id,
          userId,
        },
      },
      update: { reaction },
      create: {
        postId: id,
        userId,
        reaction,
      },
    });

    const likeCount = await prisma.dugoutPostLike.count({
      where: { postId: id },
    });

    return NextResponse.json({
      data: { likeCount, likedByViewer: true, viewerReaction: reaction },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to like post: ${message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: "No linked user account found" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    await prisma.dugoutPostLike.deleteMany({
      where: {
        postId: id,
        userId,
      },
    });

    const likeCount = await prisma.dugoutPostLike.count({
      where: { postId: id },
    });

    return NextResponse.json({
      data: { likeCount, likedByViewer: false, viewerReaction: null },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to unlike post: ${message}` },
      { status: 500 },
    );
  }
}
