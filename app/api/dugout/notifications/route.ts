import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

async function getOrCreateCursor(userId: string) {
  return prisma.dugoutNotificationCursor.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      lastSeenAt: new Date(0), // epoch — treat all existing activity as unread on first load
    },
  });
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const coachUser = await getCoachUserFromRequest(request);
  if (coachUser?.id) return coachUser.id;

  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return null;

  const reg = await prisma.registeredUser.findUnique({
    where: { email: adminUser.email },
    select: { id: true },
  });

  return reg?.id ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({
      data: {
        unreadLikeCount: 0,
        unreadReplyCount: 0,
        totalUnreadCount: 0,
        lastSeenAt: null,
      },
    });
  }

  try {
    const cursor = await getOrCreateCursor(userId);

    const [unreadLikeCount, unreadReplyCount] = await Promise.all([
      prisma.dugoutPostLike.count({
        where: {
          createdAt: { gt: cursor.lastSeenAt },
          userId: { not: userId },
          post: {
            authorId: userId,
          },
        },
      }),
      prisma.dugoutComment.count({
        where: {
          createdAt: { gt: cursor.lastSeenAt },
          authorId: { not: userId },
          post: { authorId: userId },
        },
      }),
    ]);

    const totalUnreadCount = unreadLikeCount + unreadReplyCount;

    return NextResponse.json({
      data: {
        unreadLikeCount,
        unreadReplyCount,
        totalUnreadCount,
        lastSeenAt: cursor.lastSeenAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load notifications: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ ok: true });
  }

  try {
    const now = new Date();
    await prisma.dugoutNotificationCursor.upsert({
      where: { userId },
      update: { lastSeenAt: now },
      create: {
        userId,
        lastSeenAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
      data: { lastSeenAt: now.toISOString() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to mark notifications as seen: ${message}` },
      { status: 500 },
    );
  }
}
