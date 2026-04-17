import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
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
    const post = await prisma.dugoutPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Admin can edit any post; coach can only edit their own
    const admin = await getAdminUserFromRequest(request);
    if (!admin) {
      const coach = await getCoachUserFromRequest(request);
      if (!coach || coach.id !== post.authorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = (await request.json()) as { content?: string };
    const content = body.content?.trim() ?? "";

    if (!content) {
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
      data: { content },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
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
