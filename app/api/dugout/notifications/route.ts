import { NextRequest, NextResponse } from "next/server";

import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

async function getOrCreateCursor(userId: string) {
  return prisma.dugoutNotificationCursor.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      lastSeenAt: new Date(),
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const coachUser = await getCoachUserFromRequest(request);
  if (!coachUser?.isCoach) {
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
    const cursor = await getOrCreateCursor(coachUser.id);

    const [unreadLikeCount, unreadReplyCount] = await Promise.all([
      prisma.dugoutPostLike.count({
        where: {
          createdAt: { gt: cursor.lastSeenAt },
          userId: { not: coachUser.id },
          post: {
            authorId: coachUser.id,
          },
        },
      }),
      prisma.dugoutComment.count({
        where: {
          createdAt: { gt: cursor.lastSeenAt },
          authorId: { not: coachUser.id },
          OR: [
            {
              post: {
                authorId: coachUser.id,
              },
            },
            {
              parent: {
                authorId: coachUser.id,
              },
            },
          ],
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

  const coachUser = await getCoachUserFromRequest(request);
  if (!coachUser?.isCoach) {
    return NextResponse.json({ ok: true });
  }

  try {
    const now = new Date();
    await prisma.dugoutNotificationCursor.upsert({
      where: { userId: coachUser.id },
      update: { lastSeenAt: now },
      create: {
        userId: coachUser.id,
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
