import { NextRequest, NextResponse } from "next/server";

import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

type CreateCommentPayload = {
  content?: string;
  parentId?: string | null;
};

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

export async function GET(
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

  const { id: postId } = await params;

  try {
    const comments = await prisma.dugoutComment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: commentAuthorSelect,
        },
      },
    });

    const serialized = comments.map((comment) => ({
      ...serializeComment(comment),
      replies: [] as ReturnType<typeof serializeComment>[],
    }));

    const byId = new Map(serialized.map((comment) => [comment.id, comment]));
    const roots: typeof serialized = [];

    for (const comment of serialized) {
      if (!comment.parentId) {
        roots.push(comment);
        continue;
      }

      const parent = byId.get(comment.parentId);
      if (parent) {
        parent.replies.push(comment);
      } else {
        roots.push(comment);
      }
    }

    return NextResponse.json({ data: roots });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load comments: ${message}` },
      { status: 500 },
    );
  }
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

  const coachUser = await getCoachUserFromRequest(request);
  if (!coachUser?.isCoach) {
    return NextResponse.json(
      { error: "Coach session required to comment" },
      { status: 401 },
    );
  }

  const { id: postId } = await params;

  try {
    const body = (await request.json()) as CreateCommentPayload;
    const content = body.content?.trim() || "";
    const parentId = body.parentId || null;

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

    const post = await prisma.dugoutPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (parentId) {
      const parent = await prisma.dugoutComment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true },
      });

      if (!parent || parent.postId !== postId) {
        return NextResponse.json(
          { error: "Reply target is invalid" },
          { status: 400 },
        );
      }
    }

    const comment = await prisma.dugoutComment.create({
      data: {
        content,
        postId,
        parentId,
        authorId: coachUser.id,
      },
      include: {
        author: {
          select: commentAuthorSelect,
        },
      },
    });

    return NextResponse.json(
      { data: serializeComment(comment) },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create comment: ${message}` },
      { status: 500 },
    );
  }
}
