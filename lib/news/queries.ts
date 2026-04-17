import prisma from "@/lib/prisma";

export async function getPublishedNewsPosts() {
  try {
    return await prisma.newsPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown news loading error";
    console.error(`Failed to fetch published news posts: ${message}`);
    return [];
  }
}

export async function getPublishedNewsPostBySlug(slug: string) {
  try {
    return await prisma.newsPost.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown news loading error";
    console.error(`Failed to fetch published news post by slug: ${message}`);
    return null;
  }
}

export async function getHomepageRotatorPosts() {
  try {
    return await prisma.newsPost.findMany({
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
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown rotator loading error";
    console.error(`Failed to fetch homepage rotator posts: ${message}`);
    return [];
  }
}

export async function getHomepageFeaturedNewsPosts() {
  try {
    return await prisma.newsPost.findMany({
      where: {
        status: "PUBLISHED",
        featured: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        imageUrl: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 4,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown featured news loading error";
    console.error(`Failed to fetch homepage featured news posts: ${message}`);
    return [];
  }
}
