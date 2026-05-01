import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { isFacebookPublishConfigured, publishPageFeedPost } from "@/lib/social/facebook";
import { unknownErrorMessage } from "@/lib/unknownErrorMessage";

function serializePost(post: {
  id: string;
  organizationId: string;
  status: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  facebookPostId: string | null;
  publishError: string | null;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  createdByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduledFor: post.scheduledFor?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "SOCIAL_MEDIA");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const { id } = await context.params;
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

  if (!isFacebookPublishConfigured()) {
    return NextResponse.json(
      {
        error:
          "Facebook publishing is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
      },
      { status: 503 },
    );
  }

  try {
    const existing = await prisma.socialPost.findFirst({
      where: { id, organizationId: targetOrg },
    });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (existing.status === "PUBLISHED") {
      return NextResponse.json(
        { error: "This post is already published" },
        { status: 400 },
      );
    }
    if (existing.status === "PUBLISHING") {
      return NextResponse.json(
        { error: "This post is already being published" },
        { status: 409 },
      );
    }

    await prisma.socialPost.update({
      where: { id },
      data: { status: "PUBLISHING", publishError: null },
    });

    const result = await publishPageFeedPost({
      message: existing.body,
      link: existing.linkUrl,
      imageUrl: existing.imageUrl,
    });

    if (!result.ok) {
      const failed = await prisma.socialPost.update({
        where: { id },
        data: {
          status: "FAILED",
          publishError: result.error,
        },
      });
      return NextResponse.json(
        { error: result.error, data: serializePost(failed) },
        { status: 422 },
      );
    }

    const published = await prisma.socialPost.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        facebookPostId: result.postId,
        publishedAt: new Date(),
        publishError: null,
      },
    });

    return NextResponse.json({ data: serializePost(published) });
  } catch (err: unknown) {
    const message = unknownErrorMessage(err);
    try {
      await prisma.socialPost.updateMany({
        where: { id, organizationId: targetOrg },
        data: { status: "FAILED", publishError: message },
      });
    } catch {
      /* best effort */
    }
    return NextResponse.json(
      { error: `Publish failed: ${message}` },
      { status: 500 },
    );
  }
}
