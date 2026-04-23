import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { ensureNewsAdmin, isNewsAdmin } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import {
  CONTENT_ORGS,
  isMasterDeployment,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

type NewsStatus = "DRAFT" | "PUBLISHED";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type UpdateNewsPayload = {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  imageUrl?: string | null;
  author?: string | null;
  featured?: boolean;
  rotatorEnabled?: boolean;
  status?: NewsStatus;
  publishedAt?: string | null;
  syncToOrgs?: ContentOrgId[];
  createMissing?: boolean;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function ensureUniqueSlug(
  organizationId: string,
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let slug = baseSlug;
  let i = 2;

  while (true) {
    const existing = await prisma.newsPost.findFirst({
      where: { organizationId, slug },
    });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${baseSlug}-${i}`;
    i += 1;
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const orgId = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );

    const post = await prisma.newsPost.findFirst({
      where: { organizationId: orgId, slug },
    });
    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!(await isNewsAdmin(request)) && post.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: post });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch post: ${message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await ensureNewsAdmin(request);
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message || "Unauthorized" },
      { status: admin.status },
    );
  }

  try {
    const { slug } = await context.params;
    const orgId = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );
    const existing = await prisma.newsPost.findFirst({
      where: { organizationId: orgId, slug },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json()) as UpdateNewsPayload;

    const nextStatus = body.status || existing.status;
    const normalizedSlug = body.slug ? slugify(body.slug) : undefined;

    if (normalizedSlug) {
      const collision = await prisma.newsPost.findFirst({
        where: { organizationId: orgId, slug: normalizedSlug },
      });
      if (collision && collision.id !== existing.id) {
        return NextResponse.json(
          { error: "Slug already in use" },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.newsPost.update({
      where: { id: existing.id },
      data: {
        title: body.title?.trim(),
        slug: normalizedSlug,
        excerpt:
          body.excerpt !== undefined ? body.excerpt?.trim() || null : undefined,
        content: body.content?.trim(),
        imageUrl:
          body.imageUrl !== undefined
            ? body.imageUrl?.trim() || null
            : undefined,
        author:
          body.author !== undefined ? body.author?.trim() || null : undefined,
        featured: body.featured,
        rotatorEnabled: body.rotatorEnabled,
        status: body.status,
        publishedAt:
          body.publishedAt !== undefined
            ? body.publishedAt
              ? new Date(body.publishedAt)
              : null
            : existing.publishedAt || nextStatus === "PUBLISHED"
              ? existing.publishedAt || new Date()
              : null,
      },
    });

    const syncRequestedTargets = Array.isArray(body.syncToOrgs)
      ? body.syncToOrgs.filter((org): org is ContentOrgId =>
          CONTENT_ORGS.includes(org),
        )
      : [];
    const shouldSync = isMasterDeployment() && syncRequestedTargets.length > 0;
    const createMissing = Boolean(body.createMissing);

    const syncResults: Array<{
      org: ContentOrgId;
      action: "updated" | "created" | "skipped";
      slug?: string;
    }> = [];

    if (shouldSync) {
      for (const org of syncRequestedTargets) {
        if (org === orgId) continue;

        const targetExisting = await prisma.newsPost.findFirst({
          where: {
            organizationId: org,
            OR: [{ slug }, { slug: updated.slug }],
          },
        });

        if (!targetExisting && !createMissing) {
          syncResults.push({ org, action: "skipped" });
          continue;
        }

        if (targetExisting) {
          const nextTargetSlug = await ensureUniqueSlug(
            org,
            updated.slug,
            targetExisting.id,
          );

          const synced = await prisma.newsPost.update({
            where: { id: targetExisting.id },
            data: {
              title: updated.title,
              slug: nextTargetSlug,
              excerpt: updated.excerpt,
              content: updated.content,
              imageUrl: updated.imageUrl,
              author: updated.author,
              featured: updated.featured,
              rotatorEnabled: updated.rotatorEnabled,
              status: updated.status,
              publishedAt: updated.publishedAt,
            },
          });

          syncResults.push({ org, action: "updated", slug: synced.slug });
          continue;
        }

        const createdSlug = await ensureUniqueSlug(org, updated.slug);
        const created = await prisma.newsPost.create({
          data: {
            organizationId: org,
            title: updated.title,
            slug: createdSlug,
            excerpt: updated.excerpt,
            content: updated.content,
            imageUrl: updated.imageUrl,
            author: updated.author,
            featured: updated.featured,
            rotatorEnabled: updated.rotatorEnabled,
            status: updated.status,
            publishedAt: updated.publishedAt,
          },
        });

        syncResults.push({ org, action: "created", slug: created.slug });
      }
    }

    revalidatePath("/");
    revalidatePath("/news");
    revalidatePath(`/news/${slug}`);
    revalidatePath(`/news/${updated.slug}`);

    return NextResponse.json({ data: updated, syncResults });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update post: ${message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const admin = await ensureNewsAdmin(request);
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message || "Unauthorized" },
      { status: admin.status },
    );
  }

  try {
    const { slug } = await context.params;
    const orgId = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );

    const existing = await prisma.newsPost.findFirst({
      where: { organizationId: orgId, slug },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.newsPost.delete({ where: { id: existing.id } });
    revalidatePath("/");
    revalidatePath("/news");
    revalidatePath(`/news/${slug}`);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete post: ${message}` },
      { status: 500 },
    );
  }
}
