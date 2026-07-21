/**
 * Publish Ascension LL All-Star news (homepage rotator).
 * Champions first (featured + newer publishedAt), then road-to-state.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/publish-ascension-allstar-news.ts
 */
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
  /** ISO or offset ms from now for ordering */
  publishedAt: Date;
};

function captionToHtml(caption: string, facebookUrl: string): string {
  const paras = caption
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  const body = paras
    .map((p) => {
      // hashtag line
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

  const assetsDir = process.env.ASSETS_DIR || "/tmp/llb-news";
  const now = Date.now();

  const posts: PostSpec[] = [
    {
      slug: "coach-pitch-state-champions-2026",
      title: "🏆 STATE CHAMPIONS — Coach Pitch All-Stars",
      excerpt:
        "Ascension Little League Coach Pitch All-Stars defeat South Lake Charles 7–5 to claim the 2026 Louisiana Little League Coach Pitch State Championship — undefeated run complete.",
      captionPath: `${assetsDir}/champions-caption.txt`,
      imagePath: `${assetsDir}/coach-pitch-state-champs-2026.jpg`,
      facebookUrl: "https://www.facebook.com/share/p/1EJuAN5DyG/",
      featured: true,
      // Champions first in rotator (featured + newest)
      publishedAt: new Date(now),
    },
    {
      slug: "all-star-road-to-state-broussard-2026",
      title: "🔥 The road to a State Championship continues",
      excerpt:
        "Ascension Little League All-Star teams are leaving it all on the field in Broussard. Pack the stands — every inning matters.",
      captionPath: `${assetsDir}/road-caption.txt`,
      imagePath: `${assetsDir}/all-star-road-to-state-broussard-2026.jpg`,
      facebookUrl: "https://www.facebook.com/share/p/1HASpdAGYx/",
      featured: true,
      // Slightly older so champions stays first when featured ties
      publishedAt: new Date(now - 60_000),
    },
  ];

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(dbUrl),
  });

  const results = [];
  for (const spec of posts) {
    const caption = readFileSync(spec.captionPath, "utf8").trim();
    const content = captionToHtml(caption, spec.facebookUrl);
    const imageUrl = await uploadImage(
      spec.imagePath,
      basename(spec.imagePath),
    );
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

  // Show rotator order for ascension
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
    take: 8,
  });

  console.log(JSON.stringify({ results, rotator }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
