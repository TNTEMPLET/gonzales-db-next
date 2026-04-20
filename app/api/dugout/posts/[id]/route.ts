import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { MAX_POST_LENGTH } from "@/lib/dugout/constants";
import { getDugoutPostInclude, serializeDugoutPost } from "@/lib/dugout/posts";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

export async function PATCH(
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

  const { id } = await params;

  try {
    const coach = await getCoachUserFromRequest(request);
    const post = await prisma.dugoutPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Admin can edit any post; coach can only edit their own
    const admin = await getAdminUserFromRequest(request);
    if (!admin) {
      if (!coach || coach.id !== post.authorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = (await request.json()) as {
      content?: string;
      removeMedia?: boolean;
      isPinned?: boolean;
      pinScope?: "post" | "thread";
    };
    const isPinRequest = typeof body.isPinned === "boolean";
    const pinScope = body.pinScope === "thread" ? "thread" : "post";

    if (isPinRequest) {
      if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const shouldPin = body.isPinned === true;
      const pinData = shouldPin
        ? { isPinned: true, pinnedAt: new Date() }
        : { isPinned: false, pinnedAt: null };

      if (pinScope === "thread" && post.threadId) {
        await prisma.dugoutPost.updateMany({
          where: { threadId: post.threadId },
          data: pinData,
        });
      } else {
        await prisma.dugoutPost.update({
          where: { id },
          data: pinData,
        });
      }

      const refreshed = await prisma.dugoutPost.findUnique({
        where: { id },
        include: getDugoutPostInclude(coach?.id),
      });

      if (!refreshed) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      return NextResponse.json({ data: serializeDugoutPost(refreshed) });
    }

    const content = body.content?.trim() ?? "";
    const removeMedia = body.removeMedia === true;

    // After removing media, content may still be empty — only require content
    // if there will still be media attached.
    const willHaveMedia = !removeMedia && Boolean(post.mediaUrl);
    if (!content && !willHaveMedia) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    if (content.length > MAX_POST_LENGTH) {
      return NextResponse.json(
        { error: `Post must be ${MAX_POST_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    const updated = await prisma.dugoutPost.update({
      where: { id },
      data: {
        content,
        ...(removeMedia ? { mediaUrl: null, mediaType: null } : {}),
      },
      include: getDugoutPostInclude(coach?.id),
    });

    return NextResponse.json({ data: serializeDugoutPost(updated) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update post: ${message}` },
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

  const { id } = await params;

  try {
    const post = await prisma.dugoutPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Admin can delete any post; coach can only delete their own
    const admin = await getAdminUserFromRequest(request);
    if (!admin) {
      const coach = await getCoachUserFromRequest(request);
      if (!coach || coach.id !== post.authorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await prisma.dugoutPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete post: ${message}` },
      { status: 500 },
    );
  }
}
