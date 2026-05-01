import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { fetchPageFeedPosts, isFacebookPublishConfigured } from "@/lib/social/facebook";
import { serializeSocialPost } from "@/lib/social/socialPostSerialize";
import { unknownErrorMessage } from "@/lib/unknownErrorMessage";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SOCIAL_MEDIA");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  if (!isFacebookPublishConfigured()) {
    return NextResponse.json(
      {
        error:
          "Facebook is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
      },
      { status: 503 },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

  let maxPosts = 200;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body === "object" && "maxPosts" in body) {
      const n = Number((body as { maxPosts?: unknown }).maxPosts);
      if (Number.isFinite(n)) maxPosts = Math.min(Math.max(Math.floor(n), 1), 500);
    }
  } catch {
    /* use default */
  }

  try {
    const feed = await fetchPageFeedPosts({ maxPosts });
    if (!feed.ok) {
      return NextResponse.json({ error: feed.error }, { status: 422 });
    }

    const fbIds = feed.posts.map((p) => p.facebookPostId);
    const existingRows = await prisma.socialPost.findMany({
      where: { organizationId: targetOrg, facebookPostId: { in: fbIds } },
      select: { facebookPostId: true },
    });
    const existingSet = new Set(
      existingRows.map((r) => r.facebookPostId).filter(Boolean) as string[],
    );

    let created = 0;
    let updated = 0;

    for (const item of feed.posts) {
      const wasPresent = existingSet.has(item.facebookPostId);
      await prisma.socialPost.upsert({
        where: {
          organizationId_facebookPostId: {
            organizationId: targetOrg,
            facebookPostId: item.facebookPostId,
          },
        },
        create: {
          organizationId: targetOrg,
          status: "PUBLISHED",
          body: item.body,
          linkUrl: item.linkUrl,
          imageUrl: item.imageUrl,
          facebookPostId: item.facebookPostId,
          publishedAt: item.publishedAt,
          syncedFromFacebook: true,
        },
        update: {
          body: item.body,
          linkUrl: item.linkUrl,
          imageUrl: item.imageUrl,
          publishedAt: item.publishedAt,
          status: "PUBLISHED",
          publishError: null,
        },
      });
      if (wasPresent) updated += 1;
      else created += 1;
    }

    const posts = await prisma.socialPost.findMany({
      where: { organizationId: targetOrg },
      orderBy: [{ updatedAt: "desc" }],
    });

    return NextResponse.json({
      data: {
        fetched: feed.posts.length,
        created,
        updated,
        posts: posts.map(serializeSocialPost),
      },
      targetOrg,
      facebookPublishConfigured: true,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Sync failed: ${unknownErrorMessage(err)}` },
      { status: 500 },
    );
  }
}
