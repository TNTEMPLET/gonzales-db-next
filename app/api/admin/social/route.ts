import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { isFacebookPublishConfigured } from "@/lib/social/facebook";
import { serializeSocialPost } from "@/lib/social/socialPostSerialize";
import { unknownErrorMessage } from "@/lib/unknownErrorMessage";

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SOCIAL_MEDIA");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const posts = await prisma.socialPost.findMany({
      where: { organizationId: targetOrg },
      orderBy: [{ updatedAt: "desc" }],
    });

    return NextResponse.json({
      data: posts.map(serializeSocialPost),
      targetOrg,
      facebookPublishConfigured: isFacebookPublishConfigured(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to load social posts: ${unknownErrorMessage(err)}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SOCIAL_MEDIA");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const adminUser = await getAdminUserFromRequest(request);
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const body = (await request.json()) as {
      body?: string;
      linkUrl?: string | null;
      imageUrl?: string | null;
    };

    const text = body.body?.trim() || "";
    if (!text && !toNullableString(body.imageUrl)) {
      return NextResponse.json(
        { error: "Post body or image URL is required" },
        { status: 400 },
      );
    }

    const post = await prisma.socialPost.create({
      data: {
        organizationId: targetOrg,
        body: text || "(Image post)",
        linkUrl: toNullableString(body.linkUrl),
        imageUrl: toNullableString(body.imageUrl),
        createdByAdminId: adminUser?.id ?? null,
        status: "DRAFT",
        syncedFromFacebook: false,
      },
    });

    return NextResponse.json(
      {
        data: serializeSocialPost(post),
        facebookPublishConfigured: isFacebookPublishConfigured(),
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Failed to create post: ${unknownErrorMessage(err)}` },
      { status: 500 },
    );
  }
}
