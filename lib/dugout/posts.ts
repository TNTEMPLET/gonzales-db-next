import prisma from "@/lib/prisma";

const dugoutAuthorSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

type DugoutPostWithRelations = {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: "IMAGE" | "GIF" | null;
  threadId: string | null;
  threadOrder: number | null;
  isPinned: boolean;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  _count?: {
    likes: number;
    comments: number;
  };
  likes?: Array<{ id: string; reaction: string }>;
};

export function getDugoutPostInclude(viewerUserId?: string | null) {
  return {
    author: {
      select: dugoutAuthorSelect,
    },
    _count: {
      select: {
        likes: true,
        comments: true,
      },
    },
    ...(viewerUserId
      ? {
          likes: {
            where: {
              userId: viewerUserId,
            },
            select: {
              id: true,
              reaction: true,
            },
          },
        }
      : {}),
  };
}

export function serializeDugoutPost(post: DugoutPostWithRelations) {
  return {
    ...post,
    pinnedAt: post.pinnedAt ? post.pinnedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    likeCount: post._count?.likes ?? 0,
    commentCount: post._count?.comments ?? 0,
    likedByViewer: Boolean(post.likes?.length),
    viewerReaction: post.likes?.[0]?.reaction ?? null,
  };
}

export async function listDugoutPosts(viewerUserId?: string | null) {
  const { getOrgId } = await import("@/lib/siteConfig");
  const posts = await prisma.dugoutPost.findMany({
    where: { organizationId: getOrgId() },
    orderBy: [
      { isPinned: "desc" },
      { pinnedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 120,
    include: getDugoutPostInclude(viewerUserId),
  });

  return posts.map((post) => serializeDugoutPost(post));
}
