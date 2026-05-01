import { NextRequest, NextResponse } from "next/server";

import { ensureCoach, resolveAuthorId } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";
import { resolveDugoutApiOrg } from "@/lib/siteConfig";

type CreateCommentPayload = {
  content?: string;
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
    // Replies are now intentionally flat (no nested threading).
    return NextResponse.json({ data: serialized });
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

  const targetOrg = resolveDugoutApiOrg(
    request.nextUrl.searchParams.get("org"),
  );

  // authorId must be a RegisteredUser.id (FK constraint)
  const authorId = await resolveAuthorId(request, targetOrg);

  if (!authorId) {
    return NextResponse.json(
      { error: "No linked user account found" },
      { status: 403 },
    );
  }

  const { id: postId } = await params;

  try {
    const body = (await request.json()) as CreateCommentPayload;
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

    const post = await prisma.dugoutPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const comment = await prisma.dugoutComment.create({
      data: {
        content,
        postId,
        parentId: null,
        authorId,
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
