import { NextRequest, NextResponse } from "next/server";

import { ensureCoach, resolveAuthorId } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";
import { resolveDugoutApiOrg } from "@/lib/siteConfig";

type DugoutNotificationItem = {
  id: string;
  type: "LIKE" | "COMMENT" | "REPLY";
  createdAt: string;
  isUnread: boolean;
  actor: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  postId: string;
  postPreview: string;
  commentPreview: string | null;
  reaction: string | null;
};

type NotificationTarget =
  | { entityType: "POST_LIKE"; postLikeId: string }
  | { entityType: "COMMENT"; commentId: string };

function parseNotificationId(rawId: string): NotificationTarget | null {
  const [prefix, id] = rawId.split(":");
  if (!id) return null;

  if (prefix === "like") {
    return { entityType: "POST_LIKE", postLikeId: id };
  }

  if (prefix === "comment") {
    return { entityType: "COMMENT", commentId: id };
  }

  return null;
}

function trimPreview(value: string, max = 160) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}...`;
}

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

export async function GET(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveDugoutApiOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const userId = await resolveAuthorId(request, targetOrg);
  if (!userId) {
    return NextResponse.json({
      data: {
        unreadLikeCount: 0,
        unreadReplyCount: 0,
        totalUnreadCount: 0,
        lastSeenAt: null,
        items: [] as DugoutNotificationItem[],
      },
    });
  }

  try {
    const cursor = await getOrCreateCursor(userId);
    const hasRealSeenMarker = cursor.lastSeenAt.getTime() > 1000;
    const seenBoundary = hasRealSeenMarker ? cursor.lastSeenAt : new Date(0);

    const [unreadLikeCount, unreadReplyCount, recentLikes, recentComments] =
      await Promise.all([
        prisma.dugoutPostLike.count({
          where: {
            createdAt: { gt: seenBoundary },
            userId: { not: userId },
            post: {
              authorId: userId,
            },
            notificationReads: {
              none: {
                userId,
              },
            },
          },
        }),
        prisma.dugoutComment.count({
          where: {
            createdAt: { gt: seenBoundary },
            authorId: { not: userId },
            post: { authorId: userId },
            notificationReads: {
              none: {
                userId,
              },
            },
          },
        }),
        prisma.dugoutPostLike.findMany({
          where: {
            userId: { not: userId },
            post: {
              authorId: userId,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            reaction: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            post: {
              select: {
                id: true,
                content: true,
              },
            },
            notificationReads: {
              where: {
                userId,
              },
              select: {
                id: true,
              },
            },
          },
        }),
        prisma.dugoutComment.findMany({
          where: {
            authorId: { not: userId },
            post: { authorId: userId },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            content: true,
            parentId: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            post: {
              select: {
                id: true,
                content: true,
              },
            },
            notificationReads: {
              where: {
                userId,
              },
              select: {
                id: true,
              },
            },
          },
        }),
      ]);

    const totalUnreadCount = unreadLikeCount + unreadReplyCount;

    const likeItems: DugoutNotificationItem[] = recentLikes.map((like) => ({
      id: `like:${like.id}`,
      type: "LIKE",
      createdAt: like.createdAt.toISOString(),
      isUnread:
        like.createdAt > seenBoundary && like.notificationReads.length === 0,
      actor: like.user,
      postId: like.post.id,
      postPreview: trimPreview(like.post.content || "(Media post)"),
      commentPreview: null,
      reaction: like.reaction,
    }));

    const commentItems: DugoutNotificationItem[] = recentComments.map(
      (comment) => ({
        id: `comment:${comment.id}`,
        type: comment.parentId ? "REPLY" : "COMMENT",
        createdAt: comment.createdAt.toISOString(),
        isUnread:
          comment.createdAt > seenBoundary &&
          comment.notificationReads.length === 0,
        actor: comment.author,
        postId: comment.post.id,
        postPreview: trimPreview(comment.post.content || "(Media post)"),
        commentPreview: trimPreview(comment.content, 140),
        reaction: null,
      }),
    );

    const items = [...likeItems, ...commentItems]
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )
      .slice(0, 40);

    return NextResponse.json({
      data: {
        unreadLikeCount,
        unreadReplyCount,
        totalUnreadCount,
        lastSeenAt: hasRealSeenMarker ? cursor.lastSeenAt.toISOString() : null,
        items,
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

  const targetOrg = resolveDugoutApiOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const userId = await resolveAuthorId(request, targetOrg);
  if (!userId) {
    return NextResponse.json({ ok: true });
  }

  try {
    let body: { notificationId?: string; markAll?: boolean } = {};
    try {
      body = (await request.json()) as {
        notificationId?: string;
        markAll?: boolean;
      };
    } catch {
      // Allow empty body for existing mark-all behavior.
    }

    const shouldMarkAll = body.markAll !== false && !body.notificationId;

    if (body.notificationId) {
      const target = parseNotificationId(body.notificationId);
      if (!target) {
        return NextResponse.json(
          { error: "Invalid notification id" },
          { status: 400 },
        );
      }

      if (target.entityType === "POST_LIKE") {
        await prisma.dugoutNotificationRead.upsert({
          where: {
            userId_postLikeId: {
              userId,
              postLikeId: target.postLikeId,
            },
          },
          update: { readAt: new Date() },
          create: {
            userId,
            entityType: "POST_LIKE",
            postLikeId: target.postLikeId,
          },
        });
      } else {
        await prisma.dugoutNotificationRead.upsert({
          where: {
            userId_commentId: {
              userId,
              commentId: target.commentId,
            },
          },
          update: { readAt: new Date() },
          create: {
            userId,
            entityType: "COMMENT",
            commentId: target.commentId,
          },
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          notificationId: body.notificationId,
        },
      });
    }

    if (!shouldMarkAll) {
      return NextResponse.json(
        { error: "Invalid notification read request" },
        { status: 400 },
      );
    }

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
