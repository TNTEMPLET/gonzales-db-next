import type { PrismaClient } from "@prisma/client";
import { parseOptionalNewsImageUrl } from "@/lib/uploads/validateNewsImageUrl";

export type NewsMediaInput = {
  url: string;
  alt?: string | null;
  caption?: string | null;
  sortOrder?: number;
};

export type NewsMediaDto = {
  id: string;
  url: string;
  alt: string | null;
  caption: string | null;
  sortOrder: number;
};

const MAX_GALLERY_IMAGES = 24;

export function parseNewsMediaList(
  raw: unknown,
):
  | { ok: true; value: NewsMediaInput[] }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "media must be an array" };
  }
  if (raw.length > MAX_GALLERY_IMAGES) {
    return {
      ok: false,
      error: `media supports at most ${MAX_GALLERY_IMAGES} images`,
    };
  }

  const out: NewsMediaInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `media[${i}] must be an object` };
    }
    const rec = row as Record<string, unknown>;
    const parsed = parseOptionalNewsImageUrl(
      typeof rec.url === "string" ? rec.url : null,
    );
    if (!parsed.ok) {
      return { ok: false, error: `media[${i}].url: ${parsed.error}` };
    }
    if (!parsed.value) {
      return { ok: false, error: `media[${i}].url is required` };
    }
    const alt =
      rec.alt === undefined || rec.alt === null
        ? null
        : String(rec.alt).trim() || null;
    const caption =
      rec.caption === undefined || rec.caption === null
        ? null
        : String(rec.caption).trim() || null;
    const sortOrder =
      typeof rec.sortOrder === "number" && Number.isFinite(rec.sortOrder)
        ? Math.trunc(rec.sortOrder)
        : i;
    out.push({ url: parsed.value, alt, caption, sortOrder });
  }

  out.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return {
    ok: true,
    value: out.map((item, index) => ({ ...item, sortOrder: index })),
  };
}

export async function replacePostMedia(
  prisma: PrismaClient,
  postId: string,
  media: NewsMediaInput[],
): Promise<NewsMediaDto[]> {
  // Sequential writes (avoid interactive $transaction — Prisma PPG adapter
  // needs WebSocket, which is unavailable in some Node script contexts).
  await prisma.newsPostMedia.deleteMany({ where: { postId } });
  if (media.length > 0) {
    await prisma.newsPostMedia.createMany({
      data: media.map((item, index) => ({
        postId,
        url: item.url,
        alt: item.alt ?? null,
        caption: item.caption ?? null,
        sortOrder: item.sortOrder ?? index,
      })),
    });
  }

  return prisma.newsPostMedia.findMany({
    where: { postId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      sortOrder: true,
    },
  });
}

export async function copyPostMedia(
  prisma: PrismaClient,
  sourcePostId: string,
  targetPostId: string,
): Promise<void> {
  const rows = await prisma.newsPostMedia.findMany({
    where: { postId: sourcePostId },
    orderBy: { sortOrder: "asc" },
  });
  await replacePostMedia(
    prisma,
    targetPostId,
    rows.map((row, index) => ({
      url: row.url,
      alt: row.alt,
      caption: row.caption,
      sortOrder: index,
    })),
  );
}

export const newsPostMediaInclude = {
  media: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      url: true,
      alt: true,
      caption: true,
      sortOrder: true,
    },
  },
};
