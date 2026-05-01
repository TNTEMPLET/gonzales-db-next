"use client";

import { useEffect, useMemo, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

function IconPhoto(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
    </svg>
  );
}

function IconLink(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
  );
}

function IconSmile(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
    </svg>
  );
}

type SocialPostStatus = "DRAFT" | "PUBLISHING" | "PUBLISHED" | "FAILED";

type SocialPostRecord = {
  id: string;
  organizationId: string;
  status: SocialPostStatus;
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
  facebookPostId: string | null;
  publishError: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  createdByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  data: SocialPostRecord[];
  targetOrg: ContentOrgId;
  facebookPublishConfigured: boolean;
};

const EMPTY_FORM = {
  body: "",
  linkUrl: "",
  imageUrl: "",
};

function statusBadge(status: SocialPostStatus) {
  const map: Record<SocialPostStatus, string> = {
    DRAFT: "bg-zinc-700 text-zinc-200",
    PUBLISHING: "bg-amber-900/60 text-amber-200",
    PUBLISHED: "bg-emerald-900/50 text-emerald-200",
    FAILED: "bg-red-900/50 text-red-200",
  };
  return map[status] || "bg-zinc-700";
}

export default function AdminSocialManager({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [facebookPublishConfigured, setFacebookPublishConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState({ link: false, image: false });
  const orgQuery = `org=${targetOrg}`;

  const charCount = useMemo(() => form.body.length, [form.body]);
  const canSave = Boolean(form.body.trim() || form.imageUrl.trim());

  useEffect(() => {
    void loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg]);

  async function loadPosts() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/social?${orgQuery}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as ListResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in json ? String(json.error) : "Failed to load");
      }
      setPosts((json as ListResponse).data || []);
      setFacebookPublishConfigured(
        Boolean((json as ListResponse).facebookPublishConfigured),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAttachmentOpen({ link: false, image: false });
  }

  async function savePost() {
    const body = form.body.trim();
    const linkUrl = form.linkUrl.trim() || null;
    const imageUrl = form.imageUrl.trim() || null;
    if (!body && !imageUrl) {
      setError("Add message text and/or an image URL.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const url = editingId
        ? `/api/admin/social/${editingId}?${orgQuery}`
        : `/api/admin/social?${orgQuery}`;
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, linkUrl, imageUrl }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Save failed");
      }
      setNotice(editingId ? "Draft updated." : "Draft created.");
      resetForm();
      await loadPosts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishPost(id: string) {
    if (!facebookPublishConfigured) {
      setError("Facebook env vars are not configured on the server.");
      return;
    }
    if (!confirm("Publish this post to your Facebook Page now?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/social/${id}/publish?${orgQuery}`, {
        method: "POST",
      });
      const json = (await response.json()) as { error?: string; data?: SocialPostRecord };
      if (!response.ok) {
        throw new Error(json.error || "Publish failed");
      }
      setNotice("Published to Facebook.");
      resetForm();
      await loadPosts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Publish failed");
      await loadPosts();
    } finally {
      setBusy(false);
    }
  }

  async function removePost(id: string) {
    if (!confirm("Delete this post record?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/social/${id}?${orgQuery}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        throw new Error(json.error || "Delete failed");
      }
      if (editingId === id) resetForm();
      setNotice("Deleted.");
      await loadPosts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(post: SocialPostRecord) {
    setEditingId(post.id);
    const linkUrl = post.linkUrl || "";
    const imageUrl = post.imageUrl || "";
    setForm({
      body: post.body === "(Image post)" ? "" : post.body,
      linkUrl,
      imageUrl,
    });
    setAttachmentOpen({
      link: Boolean(linkUrl.trim()),
      image: Boolean(imageUrl.trim()),
    });
    setNotice("");
    setError("");
  }

  return (
    <div className="space-y-8">
      {!facebookPublishConfigured ? (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Publishing disabled</p>
          <p className="mt-1 text-amber-200/90">
            Set <code className="text-amber-50">FACEBOOK_PAGE_ID</code> and{" "}
            <code className="text-amber-50">FACEBOOK_PAGE_ACCESS_TOKEN</code> on the
            server. You can still create and edit drafts.
          </p>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
        <div className="min-w-0 w-full overflow-hidden rounded-xl border border-zinc-700/90 bg-[#242526] shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          <div className="relative flex items-center justify-center border-b border-zinc-600/80 px-4 py-3">
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                disabled={busy}
                className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-700/80 hover:text-white disabled:opacity-50"
                aria-label="Cancel edit"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            ) : null}
            <h2 className="text-lg font-bold text-zinc-100">
              {editingId ? "Edit post" : "Create post"}
            </h2>
          </div>

          <div className="px-4 pt-4">
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={5}
              placeholder="What's on your mind?"
              className="min-h-[120px] w-full resize-none border-0 bg-transparent text-xl leading-snug text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0"
            />
            <div className="flex items-center justify-between pb-1 pt-1">
              <span
                className="flex h-9 w-9 cursor-default items-center justify-center rounded-lg bg-linear-to-br from-teal-500 via-pink-500 to-orange-400 p-0.5"
                aria-hidden
                title="Text backgrounds not available in this composer"
              >
                <span className="flex h-full w-full items-center justify-center rounded-md bg-[#242526] text-xs font-bold text-white">
                  Aa
                </span>
              </span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-700/60 hover:text-zinc-200"
                aria-label="Emoji — use your keyboard or system picker"
              >
                <IconSmile className="h-7 w-7" />
              </button>
            </div>
          </div>

          <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-zinc-600/80 px-3 py-2.5">
            <span className="text-sm font-medium text-zinc-300">Add to your post</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAttachmentOpen((a) => ({ ...a, image: !a.image }))}
                className={`rounded-full p-1 transition-colors hover:bg-zinc-700/50 ${
                  attachmentOpen.image || form.imageUrl.trim() ? "ring-2 ring-emerald-500/50" : ""
                }`}
                aria-label={attachmentOpen.image ? "Hide photo URL field" : "Add photo URL"}
                title="Photo"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#31A24C] text-white">
                  <IconPhoto className="h-5 w-5" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAttachmentOpen((a) => ({ ...a, link: !a.link }))}
                className={`rounded-full p-1 transition-colors hover:bg-zinc-700/50 ${
                  attachmentOpen.link || form.linkUrl.trim() ? "ring-2 ring-[#2374E1]/50" : ""
                }`}
                aria-label={attachmentOpen.link ? "Hide link field" : "Add link"}
                title="Link"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2374E1] text-white">
                  <IconLink className="h-5 w-5" />
                </span>
              </button>
            </div>
          </div>

          {attachmentOpen.link || attachmentOpen.image ? (
            <div className="mx-4 mb-3 space-y-3 rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-3">
              {attachmentOpen.link ? (
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">Link</span>
                  <input
                    value={form.linkUrl}
                    onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-zinc-600 bg-[#242526] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#2374E1] focus:outline-none"
                  />
                </label>
              ) : null}
              {attachmentOpen.image ? (
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400">
                    Image URL <span className="font-normal text-zinc-500">(HTTPS, public)</span>
                  </span>
                  <input
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-lg border border-zinc-600 bg-[#242526] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#2374E1] focus:outline-none"
                  />
                </label>
              ) : null}
              <p className="text-xs text-zinc-500">
                With an image URL, Facebook posts as a photo; the link field is not used as the
                primary attachment.
              </p>
            </div>
          ) : null}

          <p className="px-4 pb-1 text-xs text-zinc-500">{charCount} characters</p>

          <div className="p-3 pt-1">
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => void savePost()}
              className="w-full rounded-lg py-2 text-center text-[15px] font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500 enabled:bg-[#2374E1] enabled:hover:bg-[#1864D7]"
            >
              {busy ? "Saving…" : editingId ? "Save draft" : "Create draft"}
            </button>
          </div>
        </div>

        <aside className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300 space-y-3 lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Facebook tips
          </p>
          <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed">
            <li>Link previews are generated by Facebook from Open Graph tags on the URL.</li>
            <li>Image URLs must be publicly reachable over HTTPS.</li>
            <li>Posts are public on your Page; Meta App Review may be required outside dev mode.</li>
            <li>Long posts are fine; character count is informational only.</li>
          </ul>
        </aside>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <h2 className="text-lg font-semibold mb-4">Posts</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950/80 text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Preview</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(post.status)}`}
                    >
                      {post.status}
                    </span>
                    {post.publishError ? (
                      <p className="mt-1 text-xs text-red-400 max-w-[200px] wrap-break-word">
                        {post.publishError}
                      </p>
                    ) : null}
                    {post.facebookPostId ? (
                      <p className="mt-1 text-xs text-zinc-500 font-mono truncate max-w-[180px]">
                        FB: {post.facebookPostId}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-zinc-300 max-w-md">
                    <p className="line-clamp-3 whitespace-pre-wrap">{post.body}</p>
                    {post.linkUrl ? (
                      <p className="mt-1 text-xs text-brand-gold truncate">{post.linkUrl}</p>
                    ) : null}
                    {post.imageUrl ? (
                      <p className="mt-1 text-xs text-zinc-500 truncate">{post.imageUrl}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(post.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top text-right space-x-1 whitespace-nowrap">
                    {post.status === "DRAFT" || post.status === "FAILED" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(post)}
                        className="rounded border border-zinc-600 px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                    ) : null}
                    {post.status === "DRAFT" || post.status === "FAILED" ? (
                      <button
                        type="button"
                        disabled={busy || !facebookPublishConfigured}
                        onClick={() => void publishPost(post.id)}
                        className="rounded border border-brand-gold px-2 py-1 text-xs text-brand-gold disabled:opacity-50"
                      >
                        Publish
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || post.status === "PUBLISHING"}
                      onClick={() => void removePost(post.id)}
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!busy && posts.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No posts yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
