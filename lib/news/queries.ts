import prisma from "@/lib/prisma";

export async function getPublishedNewsPosts() {
  return prisma.newsPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getPublishedNewsPostBySlug(slug: string) {
  return prisma.newsPost.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
    },
  });
}

export async function getHomepageRotatorPosts() {
  return prisma.newsPost.findMany({
    where: {
      status: "PUBLISHED",
      rotatorEnabled: true,
      imageUrl: {
        not: null,
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      imageUrl: true,
      excerpt: true,
    },
    orderBy: [
      { featured: "desc" },
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 8,
  });
}
