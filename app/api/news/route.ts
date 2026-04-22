import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { isNewsAdmin, ensureNewsAdmin } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

type NewsStatus = "DRAFT" | "PUBLISHED";

type CreateNewsPayload = {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  imageUrl?: string;
  author?: string;
  featured?: boolean;
  rotatorEnabled?: boolean;
  status?: NewsStatus;
  publishedAt?: string;
};

const MAX_PAGE_SIZE = 50;

function toStatus(value: string | null): NewsStatus | null {
  if (!value) return null;
  if (value === "DRAFT" || value === "PUBLISHED") return value;
  return null;
}

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
): Promise<string> {
  let slug = baseSlug;
  let i = 2;

  while (true) {
    const existing = await prisma.newsPost.findFirst({
      where: { organizationId, slug },
    });
    if (!existing) return slug;
    slug = `${baseSlug}-${i}`;
    i += 1;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgId = resolveAdminTargetOrg(searchParams.get("org"));
    const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    const limitRaw = Number(searchParams.get("limit") || "10") || 10;
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, limitRaw));

    const requestedStatus = toStatus(searchParams.get("status"));
    if (searchParams.get("status") && !requestedStatus) {
      return NextResponse.json(
        { error: "status must be DRAFT or PUBLISHED" },
        { status: 400 },
      );
    }

    const admin = await isNewsAdmin(request);
    const where = {
      organizationId: orgId,
      status: requestedStatus || (admin ? undefined : "PUBLISHED"),
    };

    const [items, total] = await Promise.all([
      prisma.newsPost.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.newsPost.count({ where }),
    ]);

    return NextResponse.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch news: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await ensureNewsAdmin(request);
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message || "Unauthorized" },
      { status: admin.status },
    );
  }

  try {
    const body = (await request.json()) as CreateNewsPayload;

    if (!body.title || !body.content) {
      return NextResponse.json(
        { error: "title and content are required" },
        { status: 400 },
      );
    }

    const orgId = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );
    const status = body.status || "DRAFT";
    const requestedSlug = body.slug ? slugify(body.slug) : slugify(body.title);
    if (!requestedSlug) {
      return NextResponse.json(
        { error: "Unable to derive a valid slug" },
        { status: 400 },
      );
    }

    const slug = await ensureUniqueSlug(orgId, requestedSlug);

    const post = await prisma.newsPost.create({
      data: {
        organizationId: orgId,
        title: body.title.trim(),
        slug,
        excerpt: body.excerpt?.trim() || null,
        content: body.content.trim(),
        imageUrl: body.imageUrl?.trim() || null,
        author: body.author?.trim() || null,
        featured: Boolean(body.featured),
        rotatorEnabled: Boolean(body.rotatorEnabled),
        status,
        publishedAt: body.publishedAt
          ? new Date(body.publishedAt)
          : status === "PUBLISHED"
            ? new Date()
            : null,
      },
    });

    revalidatePath("/");
    revalidatePath("/news");
    revalidatePath(`/news/${post.slug}`);

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create post: ${message}` },
      { status: 500 },
    );
  }
}
