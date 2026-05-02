/**
 * Facebook Graph API — Page feed posts.
 * Requires FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN (long-lived page token with pages_manage_posts).
 */

const GRAPH_VERSION = "v21.0";

export type PublishPagePostInput = {
  message: string;
  link?: string | null;
  imageUrl?: string | null;
};

export type PublishPagePostResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

function getPageCredentials() {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  return { pageId, accessToken };
}

export function isFacebookPublishConfigured(): boolean {
  const { pageId, accessToken } = getPageCredentials();
  return Boolean(pageId && accessToken);
}

export type PageFeedPostNormalized = {
  facebookPostId: string;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  permalinkUrl: string | null;
};

type GraphPaging = { next?: string };
type GraphPostsResponse = {
  data?: unknown[];
  paging?: GraphPaging;
  error?: { message?: string };
};

// v3.3+ deprecates link, full_picture, and other attachment-aggregated fields on Page posts.
// Keep only supported fields or Graph returns (#12) deprecate_post_aggregated_fields_for_attachement.
const POST_FIELDS = "id,message,story,created_time,permalink_url";

function normalizeFeedEntry(raw: Record<string, unknown>): PageFeedPostNormalized | null {
  const id = raw.id;
  if (typeof id !== "string" || !id.trim()) return null;

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const story = typeof raw.story === "string" ? raw.story.trim() : "";
  const body = message || story || "(Facebook post)";

  const linkRaw = typeof raw.link === "string" ? raw.link.trim() : "";
  const linkUrl = linkRaw.startsWith("http") ? linkRaw : null;

  const pic = typeof raw.full_picture === "string" ? raw.full_picture.trim() : "";
  const imageUrl = pic.startsWith("http") ? pic : null;

  const createdRaw = raw.created_time;
  if (typeof createdRaw !== "string" || !createdRaw) return null;
  const publishedAt = new Date(createdRaw);
  if (Number.isNaN(publishedAt.getTime())) return null;

  const permalink =
    typeof raw.permalink_url === "string" && raw.permalink_url.startsWith("http")
      ? raw.permalink_url.trim()
      : null;

  return {
    facebookPostId: id.trim(),
    body,
    linkUrl,
    imageUrl,
    publishedAt,
    permalinkUrl: permalink,
  };
}

/**
 * Lists recent posts published by the Page (Graph `/{page-id}/posts`).
 * Requires the same Page token used for publishing (pages_read_engagement, etc.).
 */
export async function fetchPageFeedPosts(options?: {
  maxPosts?: number;
  perPage?: number;
}): Promise<
  { ok: true; posts: PageFeedPostNormalized[] } | { ok: false; error: string }
> {
  const { pageId, accessToken } = getPageCredentials();
  if (!pageId || !accessToken) {
    return {
      ok: false,
      error:
        "Facebook is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
    };
  }

  const maxPosts = Math.min(Math.max(options?.maxPosts ?? 200, 1), 500);
  const perPage = Math.min(Math.max(options?.perPage ?? 50, 1), 100);

  const collected: PageFeedPostNormalized[] = [];
  let nextUrl: string | null =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/posts?fields=${encodeURIComponent(POST_FIELDS)}&limit=${perPage}&access_token=${encodeURIComponent(accessToken)}`;

  try {
    while (nextUrl && collected.length < maxPosts) {
      const response = await fetch(nextUrl);
      const json = (await response.json()) as GraphPostsResponse;

      if (!response.ok || json.error) {
        return { ok: false, error: graphErrorMessage(json) };
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      for (const row of rows) {
        if (collected.length >= maxPosts) break;
        if (!row || typeof row !== "object") continue;
        const normalized = normalizeFeedEntry(row as Record<string, unknown>);
        if (normalized) collected.push(normalized);
      }

      const next = json.paging?.next;
      nextUrl = typeof next === "string" && next.startsWith("http") ? next : null;
      if (rows.length === 0) break;
    }

    return { ok: true, posts: collected };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error calling Facebook";
    return { ok: false, error: msg };
  }
}

function graphErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Unknown Facebook API error";
  const err = (payload as { error?: { message?: string; type?: string; code?: number } })
    .error;
  if (!err) return "Unknown Facebook API error";
  const parts = [err.message, err.type ? `(${err.type})` : "", err.code != null ? `#${err.code}` : ""]
    .filter(Boolean)
    .join(" ");
  return parts || "Facebook API error";
}

/**
 * Publishes to the Page feed.
 * - If `imageUrl` is set, uses `/{page-id}/photos` with `url` + optional `caption` (message).
 * - Otherwise uses `/{page-id}/feed` with `message` and optional `link`.
 */
export async function publishPageFeedPost(
  input: PublishPagePostInput,
): Promise<PublishPagePostResult> {
  const { pageId, accessToken } = getPageCredentials();
  if (!pageId || !accessToken) {
    return {
      ok: false,
      error:
        "Facebook is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
    };
  }

  const message = input.message.trim();
  if (!message && !input.imageUrl?.trim()) {
    return { ok: false, error: "Post must include message text and/or an image URL." };
  }

  const params = new URLSearchParams();
  params.set("access_token", accessToken);

  let url: string;

  if (input.imageUrl?.trim()) {
    url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
    params.set("url", input.imageUrl.trim());
    if (message) params.set("caption", message);
  } else {
    url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
    if (message) params.set("message", message);
    if (input.link?.trim()) params.set("link", input.link.trim());
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = (await response.json()) as { id?: string; post_id?: string; error?: { message?: string } };

    if (!response.ok) {
      return { ok: false, error: graphErrorMessage(json) };
    }

    const postId = json.post_id || json.id;
    if (!postId) {
      return { ok: false, error: "Facebook did not return a post id." };
    }

    return { ok: true, postId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error calling Facebook";
    return { ok: false, error: msg };
  }
}
