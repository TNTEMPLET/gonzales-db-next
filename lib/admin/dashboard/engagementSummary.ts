import "server-only";

import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";

export type EngagementWeeklyPoint = {
  weekStart: string; // ISO date, Monday
  posts: number;
  comments: number;
  likes: number;
};

export type EngagementContributor = {
  registeredUserId: string;
  name: string;
  posts: number;
  comments: number;
  total: number;
};

export type EngagementSummary = {
  totalPosts30d: number;
  totalComments30d: number;
  totalLikes30d: number;
  weeklyTrend: EngagementWeeklyPoint[];
  topContributors: EngagementContributor[];
};

function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function displayName(u: { firstName: string | null; lastName: string | null; name: string | null; email: string }) {
  const fromParts = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return fromParts || u.name?.trim() || u.email;
}

/**
 * Trailing-30-day Dugout community engagement rollup for the dashboard.
 * No existing helper covers this (lib/dugout/ only has posts.ts's list
 * query) -- both createdAt columns queried here are already indexed
 * ([organizationId, createdAt] on DugoutPost, [authorId, createdAt] on
 * DugoutComment), so this stays cheap even at full-season row counts.
 */
export async function getEngagementSummary(orgs: ContentOrgId[]): Promise<EngagementSummary> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [posts, comments, likes] = await Promise.all([
    prisma.dugoutPost.findMany({
      where: { organizationId: { in: orgs }, createdAt: { gte: since } },
      select: { createdAt: true, authorId: true },
    }),
    prisma.dugoutComment.findMany({
      where: { post: { organizationId: { in: orgs } }, createdAt: { gte: since } },
      select: { createdAt: true, authorId: true },
    }),
    prisma.dugoutPostLike.count({
      where: { post: { organizationId: { in: orgs } }, createdAt: { gte: since } },
    }),
  ]);

  const weeklyBuckets = new Map<string, { posts: number; comments: number; likes: number }>();
  for (const p of posts) {
    const key = mondayOf(p.createdAt);
    const b = weeklyBuckets.get(key) ?? { posts: 0, comments: 0, likes: 0 };
    b.posts += 1;
    weeklyBuckets.set(key, b);
  }
  for (const c of comments) {
    const key = mondayOf(c.createdAt);
    const b = weeklyBuckets.get(key) ?? { posts: 0, comments: 0, likes: 0 };
    b.comments += 1;
    weeklyBuckets.set(key, b);
  }
  const weeklyTrend = Array.from(weeklyBuckets.entries())
    .map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const contributorCounts = new Map<string, { posts: number; comments: number }>();
  for (const p of posts) {
    const c = contributorCounts.get(p.authorId) ?? { posts: 0, comments: 0 };
    c.posts += 1;
    contributorCounts.set(p.authorId, c);
  }
  for (const c of comments) {
    const entry = contributorCounts.get(c.authorId) ?? { posts: 0, comments: 0 };
    entry.comments += 1;
    contributorCounts.set(c.authorId, entry);
  }

  const topIds = Array.from(contributorCounts.entries())
    .sort((a, b) => b[1].posts + b[1].comments - (a[1].posts + a[1].comments))
    .slice(0, 10)
    .map(([id]) => id);

  const users = topIds.length
    ? await prisma.registeredUser.findMany({
        where: { id: { in: topIds } },
        select: { id: true, firstName: true, lastName: true, name: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const topContributors: EngagementContributor[] = topIds
    .map((id) => {
      const counts = contributorCounts.get(id)!;
      const user = userById.get(id);
      return {
        registeredUserId: id,
        name: user ? displayName(user) : "Unknown",
        posts: counts.posts,
        comments: counts.comments,
        total: counts.posts + counts.comments,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    totalPosts30d: posts.length,
    totalComments30d: comments.length,
    totalLikes30d: likes,
    weeklyTrend,
    topContributors,
  };
}
