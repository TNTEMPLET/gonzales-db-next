import { PrismaClient } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";

const ORG = "fallball";
const SLUG = "fall-ball-2026-registration-age-cutoff";
const IMAGE_URL = process.env.FLYER_URL || "";
const SHARE = "https://www.facebook.com/share/p/1BhCRcuqVV/";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (!IMAGE_URL) throw new Error("FLYER_URL required");
  const prisma = new PrismaClient({ adapter: createDatabaseAdapter(process.env.DATABASE_URL) });
  const existing = await prisma.newsPost.findUnique({
    where: { organizationId_slug: { organizationId: ORG, slug: SLUG } },
  });
  if (!existing) throw new Error("post not found");
  let content = existing.content;
  content = content.replace(
    /href="https:\/\/www\.facebook\.com\/[^"]+"/,
    `href="${SHARE}"`,
  );
  const updated = await prisma.newsPost.update({
    where: { id: existing.id },
    data: { imageUrl: IMAGE_URL, content },
  });
  console.log(JSON.stringify({ action: "image_updated", id: updated.id, imageUrl: updated.imageUrl, url: `https://fallball.apbaseball.com/news/${SLUG}` }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
