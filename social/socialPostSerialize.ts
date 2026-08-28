/** JSON shape returned by /api/admin/social* for a SocialPost row. */

export type SocialPostJson = {
  id: string;
  organizationId: string;
  status: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  facebookPostId: string | null;
  publishError: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  createdByAdminId: string | null;
  syncedFromFacebook: boolean;
  createdAt: string;
  updatedAt: string;
};

export function serializeSocialPost(post: {
  id: string;
  organizationId: string;
  status: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  facebookPostId: string | null;
  publishError: string | null;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  createdByAdminId: string | null;
  syncedFromFacebook: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SocialPostJson {
  return {
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    scheduledFor: post.scheduledFor?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
