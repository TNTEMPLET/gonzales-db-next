import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { getDugoutPostInclude, serializeDugoutPost } from "@/lib/dugout/posts";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

const MAX_POST_LENGTH = 280;

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
    };
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
