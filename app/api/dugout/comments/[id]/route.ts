import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

const MAX_COMMENT_LENGTH = 280;

const commentAuthorSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

function serializeComment(comment: {
  id: string;
  content: string;
  postId: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}) {
  return {
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

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
    const existing = await prisma.dugoutComment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const admin = await getAdminUserFromRequest(request);
    if (!admin) {
      const coachUser = await getCoachUserFromRequest(request);
      if (!coachUser || coachUser.id !== existing.authorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = (await request.json()) as { content?: string };
    const content = body.content?.trim() || "";

    if (!content) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 },
      );
    }

    if (content.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        {
          error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`,
        },
        { status: 400 },
      );
    }

    const updated = await prisma.dugoutComment.update({
      where: { id },
      data: { content },
      include: {
        author: {
          select: commentAuthorSelect,
        },
      },
    });

    return NextResponse.json({ data: serializeComment(updated) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update comment: ${message}` },
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
    const existing = await prisma.dugoutComment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const admin = await getAdminUserFromRequest(request);
    if (!admin) {
      const coachUser = await getCoachUserFromRequest(request);
      if (!coachUser || coachUser.id !== existing.authorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await prisma.dugoutComment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete comment: ${message}` },
      { status: 500 },
    );
  }
}
