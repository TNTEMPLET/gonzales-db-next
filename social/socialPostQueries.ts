import type { SocialPost } from "@prisma/client";

import prisma from "@/lib/prisma";

function recencyMs(post: SocialPost): number {
  return (post.publishedAt ?? post.createdAt).getTime();
}

/**
 * Admin list order: `COALESCE(publishedAt, createdAt)` descending (newest first).
 */
export function sortSocialPostsByRecency(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => {
    const diff = recencyMs(b) - recencyMs(a);
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });
}

export async function findManySocialPostsForOrg(
  organizationId: string,
): Promise<SocialPost[]> {
  const rows = await prisma.socialPost.findMany({
    where: { organizationId },
  });
  return sortSocialPostsByRecency(rows);
}
