import { NextRequest, NextResponse } from "next/server";

import {
  listDugoutPosts,
  serializeDugoutPost,
  getDugoutPostInclude,
} from "@/lib/dugout/posts";
import { ensureCoach, resolveAuthorId } from "@/lib/dugout/auth";
import { MAX_POST_LENGTH } from "@/lib/dugout/constants";
import prisma from "@/lib/prisma";
import { resolveDugoutApiOrg } from "@/lib/siteConfig";

type CreatePostPayload = {
  content?: string;
  mediaUrl?: string | null;
  mediaType?: "IMAGE" | "GIF" | null;
  threadId?: string | null;
  threadOrder?: number | null;
};

export async function GET(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const targetOrg = resolveDugoutApiOrg(
      request.nextUrl.searchParams.get("org"),
    );
    const viewerId = await resolveAuthorId(request, targetOrg);
    const posts = await listDugoutPosts(viewerId ?? undefined, targetOrg);

    return NextResponse.json({ data: posts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load dugout posts: ${message}` },
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

  try {
    const targetOrg = resolveDugoutApiOrg(
      request.nextUrl.searchParams.get("org"),
    );

    // Resolve the author's RegisteredUser id (required for DB foreign key)
    const authorId = await resolveAuthorId(request, targetOrg);
    if (!authorId) {
      return NextResponse.json(
        { error: "No linked user account found" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreatePostPayload;
    const content = body.content?.trim() || "";
    const mediaUrl = body.mediaUrl?.trim() || null;
    const mediaType = body.mediaType || null;
    const threadId = body.threadId?.trim() || null;
    const threadOrder =
      typeof body.threadOrder === "number" ? body.threadOrder : null;

    if (!content && !mediaUrl) {
      return NextResponse.json(
        { error: "Post content or media is required" },
        { status: 400 },
      );
    }

    if (content.length > MAX_POST_LENGTH) {
      return NextResponse.json(
        { error: `Post must be ${MAX_POST_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    if (mediaType && !["IMAGE", "GIF"].includes(mediaType)) {
      return NextResponse.json(
        { error: "Unsupported media type" },
        { status: 400 },
      );
    }

    if (
      (threadId && threadOrder === null) ||
      (!threadId && threadOrder !== null)
    ) {
      return NextResponse.json(
        { error: "Thread posts must include both threadId and threadOrder" },
        { status: 400 },
      );
    }

    if (
      threadOrder !== null &&
      (!Number.isInteger(threadOrder) || threadOrder < 0)
    ) {
      return NextResponse.json(
        { error: "Thread order must be a non-negative integer" },
        { status: 400 },
      );
    }

    const post = await prisma.dugoutPost.create({
      data: {
        organizationId: targetOrg,
        content,
        mediaUrl,
        mediaType,
        threadId,
        threadOrder,
        authorId,
      },
      include: getDugoutPostInclude(authorId),
    });

    return NextResponse.json(
      { data: serializeDugoutPost(post) },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create dugout post: ${message}` },
      { status: 500 },
    );
  }
}
