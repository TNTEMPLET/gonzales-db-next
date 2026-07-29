/**
 * Publish Ascension LL All-Star news batch 2 (homepage rotator).
 * Order (newest first among featured): 10U champs → Coach Pitch champs (existing)
 * → 11U semi → 12U majors series. Broussard gallery stays older.
 *
 * Usage:
 *   node --env-file=/tmp/llb-news2/llb-publish.env --import tsx \
 *     scripts/publish-ascension-allstar-news-batch2.ts
 */
/** Node 18 lacks global WebSocket; Prisma PPG needs it. */
import WebSocket from "ws";
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;


import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { put } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";

const ORG = "ascension";
const AUTHOR = "AP Baseball";
const SITE = "https://llb.apbaseball.com";

type PostSpec = {
  slug: string;
  title: string;
  excerpt: string;
  captionPath: string;
  imagePath: string;
  facebookUrl: string;
  featured: boolean;
  publishedAt: Date;
};

function captionToHtml(caption: string, facebookUrl: string): string {
  const paras = caption
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  const body = paras
    .map((p) => {
      if (p.startsWith("#")) {
        return `<p class="text-sm text-zinc-400">${escapeHtml(p)}</p>`;
      }
      return `<p>${escapeHtml(p)}</p>`;
    })
    .join("\n");

  return `
${body}
<p><a href="${escapeHtml(facebookUrl)}" target="_blank" rel="noopener noreferrer"><strong>View on Facebook →</strong></a></p>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function uploadImage(localPath: string, blobName: string): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required");
  const buf = readFileSync(localPath);
  const blob = await put(`news/${blobName}`, buf, {
    access: "public",
    token,
    contentType: localPath.endsWith(".png") ? "image/png" : "image/jpeg",
    addRandomSuffix: true,
  });
  return blob.url;
}

async function upsertPost(
  prisma: PrismaClient,
  spec: PostSpec,
  imageUrl: string,
  content: string,
) {
  const data = {
    title: spec.title,
    excerpt: spec.excerpt,
    content,
    imageUrl,
    author: AUTHOR,
    featured: spec.featured,
    rotatorEnabled: true,
    status: "PUBLISHED" as const,
    publishedAt: spec.publishedAt,
  };

  const existing = await prisma.newsPost.findUnique({
    where: {
      organizationId_slug: { organizationId: ORG, slug: spec.slug },
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.newsPost.update({ where: { id: existing.id }, data });
  }
  return prisma.newsPost.create({
    data: { organizationId: ORG, slug: spec.slug, ...data },
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required");

  const assetsDir = process.env.ASSETS_DIR || "/tmp/llb-news2";
  const now = Date.now();

  // Rotator sorts featured desc, publishedAt desc.
  // 10U champs newest; keep Coach Pitch champs next; then 11U; then 12U.
  // Bump Coach Pitch publishedAt so it stays #2 among featured.
  const posts: PostSpec[] = [
    {
      slug: "10u-navy-state-champions-2026",
      title: "🏆 STATE CHAMPIONS — 10U Navy All-Stars",
      excerpt:
        "Ascension Little League 10U Navy All-Stars defeat South Lake Charles 9–4 to claim the 2026 Louisiana Little League 8–10 Year Old State Championship.",
      captionPath: `${assetsDir}/10u-champs-caption.txt`,
      imagePath: `${assetsDir}/10u-navy-state-champions-2026.jpg`,
      facebookUrl: "https://www.facebook.com/share/p/1BXfD4R4v9/",
      featured: true,
      publishedAt: new Date(now),
    },
    {
      slug: "11u-navy-state-semifinal-2026",
      title: "⚾️ ALL ASCENSION SEMIFINAL — 11U Navy advances",
      excerpt:
        "11U Navy beats 11U Red 9–4 in an all-Ascension state semifinal and advances to Wednesday’s championship game vs. Lafayette Little League.",
      captionPath: `${assetsDir}/11u-semi-caption.txt`,
      imagePath: `${assetsDir}/11u-navy-state-semifinal-2026.jpg`,
      facebookUrl: "https://www.facebook.com/share/p/1HZftCAr5j/",
      featured: true,
      publishedAt: new Date(now - 120_000),
    },
    {
      slug: "12u-majors-state-championship-series-2026",
      title: "🔥 ONE MORE STEP — 12U Majors to State Championship",
      excerpt:
        "12U Majors defeat Eastbank 8–4 and punch their ticket to the Louisiana State Championship series vs. Lafayette in Broussard — road to Waco in sight.",
      captionPath: `${assetsDir}/12u-step-caption.txt`,
      imagePath: `${assetsDir}/12u-majors-state-championship-series-2026.jpg`,
      facebookUrl: "https://www.facebook.com/share/p/1ELnvTstKi/",
      featured: true,
      publishedAt: new Date(now - 180_000),
    },
  ];

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(dbUrl),
  });

  const results = [];
  for (const spec of posts) {
    const caption = readFileSync(spec.captionPath, "utf8").trim();
    const content = captionToHtml(caption, spec.facebookUrl);
    const imageUrl = await uploadImage(spec.imagePath, basename(spec.imagePath));
    const row = await upsertPost(prisma, spec, imageUrl, content);
    results.push({
      action: "upserted",
      id: row.id,
      slug: row.slug,
      featured: row.featured,
      rotatorEnabled: row.rotatorEnabled,
      publishedAt: row.publishedAt,
      imageUrl: row.imageUrl,
      url: `${SITE}/news/${row.slug}`,
    });
  }

  // Keep Coach Pitch champs as #2 (between 10U champs and 11U semi)
  const coachPitch = await prisma.newsPost.updateMany({
    where: {
      organizationId: ORG,
      slug: "coach-pitch-state-champions-2026",
    },
    data: {
      featured: true,
      rotatorEnabled: true,
      publishedAt: new Date(now - 60_000),
    },
  });

  // Broussard gallery stays featured but oldest of the pack
  await prisma.newsPost.updateMany({
    where: {
      organizationId: ORG,
      slug: "all-star-road-to-state-broussard-2026",
    },
    data: {
      featured: true,
      rotatorEnabled: true,
      publishedAt: new Date(now - 240_000),
    },
  });

  const rotator = await prisma.newsPost.findMany({
    where: {
      organizationId: ORG,
      status: "PUBLISHED",
      rotatorEnabled: true,
      imageUrl: { not: null },
    },
    select: {
      slug: true,
      title: true,
      featured: true,
      publishedAt: true,
    },
    orderBy: [
      { featured: "desc" },
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 10,
  });

  console.log(
    JSON.stringify({ results, coachPitchUpdated: coachPitch.count, rotator }, null, 2),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
