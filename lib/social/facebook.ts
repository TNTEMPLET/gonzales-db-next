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
