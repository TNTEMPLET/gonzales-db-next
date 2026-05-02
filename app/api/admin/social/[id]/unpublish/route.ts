import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { AP_BASEBALL_SOCIAL_ORG_ID } from "@/lib/social/constants";
import { deletePagePost, isFacebookPublishConfigured } from "@/lib/social/facebook";
import { serializeSocialPost } from "@/lib/social/socialPostSerialize";
import { unknownErrorMessage } from "@/lib/unknownErrorMessage";

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

  if (!isFacebookPublishConfigured()) {
    return NextResponse.json(
      {
        error:
          "Facebook is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
      },
      { status: 503 },
    );
  }

  try {
    const existing = await prisma.socialPost.findFirst({
      where: { id, organizationId: AP_BASEBALL_SOCIAL_ORG_ID },
    });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (existing.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Only published posts can be unpublished" },
        { status: 400 },
      );
    }
    if (!existing.facebookPostId?.trim()) {
      return NextResponse.json(
        { error: "This post has no Facebook id; cannot remove from Facebook." },
        { status: 400 },
      );
    }

    const result = await deletePagePost(existing.facebookPostId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    const updated = await prisma.socialPost.update({
      where: { id },
      data: {
        status: "DRAFT",
        facebookPostId: null,
        publishedAt: null,
        publishError: null,
        syncedFromFacebook: false,
      },
    });

    return NextResponse.json({ data: serializeSocialPost(updated) });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Unpublish failed: ${unknownErrorMessage(err)}` },
      { status: 500 },
    );
  }
}
