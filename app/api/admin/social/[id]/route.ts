import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { isFacebookPublishConfigured } from "@/lib/social/facebook";
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

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export async function PATCH(
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

  try {
    const existing = await prisma.socialPost.findFirst({
      where: { id, organizationId: targetOrg },
    });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (existing.status !== "DRAFT" && existing.status !== "FAILED") {
      return NextResponse.json(
        { error: "Only draft or failed posts can be edited" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      body?: string;
      linkUrl?: string | null;
      imageUrl?: string | null;
    };

    const text = body.body !== undefined ? body.body.trim() : existing.body;
    const linkUrl =
      body.linkUrl !== undefined ? toNullableString(body.linkUrl) : existing.linkUrl;
    const imageUrl =
      body.imageUrl !== undefined ? toNullableString(body.imageUrl) : existing.imageUrl;

    if (!text && !imageUrl) {
      return NextResponse.json(
        { error: "Post body or image URL is required" },
        { status: 400 },
      );
    }

    const updated = await prisma.socialPost.update({
      where: { id },
      data: {
        body: text || "(Image post)",
        linkUrl,
        imageUrl,
        publishError: null,
        status: "DRAFT",
        facebookPostId: null,
        publishedAt: null,
      },
    });

    return NextResponse.json({
      data: serializePost(updated),
      facebookPublishConfigured: isFacebookPublishConfigured(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to update post: ${unknownErrorMessage(err)}` },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

  try {
    const existing = await prisma.socialPost.findFirst({
      where: { id, organizationId: targetOrg },
    });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.socialPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to delete post: ${unknownErrorMessage(err)}` },
      { status: 500 },
    );
  }
}
