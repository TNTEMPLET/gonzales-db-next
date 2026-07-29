import { PrismaClient } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";

async function main() {
  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(process.env.DATABASE_URL!),
  });
  const slug = "fall-ball-2026-registration-age-cutoff";
  const updated = await prisma.newsPost.update({
    where: {
      organizationId_slug: { organizationId: "fallball", slug },
    },
    data: {
      featured: true,
      rotatorEnabled: true,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const all = await prisma.newsPost.findMany({
    where: { organizationId: "fallball" },
    select: {
      slug: true,
      status: true,
      featured: true,
      rotatorEnabled: true,
      imageUrl: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        updated: {
          slug: updated.slug,
          featured: updated.featured,
          rotatorEnabled: updated.rotatorEnabled,
          status: updated.status,
          hasImage: Boolean(updated.imageUrl),
        },
        allFallballPosts: all,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
