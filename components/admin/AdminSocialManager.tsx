"use client";

import { useEffect, useMemo, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

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
  const orgQuery = `org=${targetOrg}`;

  const charCount = useMemo(() => form.body.length, [form.body]);

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
    setForm({
      body: post.body === "(Image post)" ? "" : post.body,
      linkUrl: post.linkUrl || "",
      imageUrl: post.imageUrl || "",
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

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <h2 className="text-lg font-semibold">
            {editingId ? "Edit draft" : "New post"}
          </h2>
          <label className="block text-xs font-medium text-zinc-400">
            Message
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={6}
              placeholder="What do you want to say on Facebook?"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            />
          </label>
          <p className="text-xs text-zinc-500">{charCount} characters</p>
          <label className="block text-xs font-medium text-zinc-400">
            Link (optional)
            <input
              value={form.linkUrl}
              onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-zinc-500">
            If you also add an image URL, Facebook will use a photo post and the link
            field is ignored for the primary attachment.
          </p>
          <label className="block text-xs font-medium text-zinc-400">
            Image URL (optional)
            <input
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="Public HTTPS image URL"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePost()}
              className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold hover:bg-brand-purple-dark disabled:opacity-60"
            >
              {busy ? "Saving…" : editingId ? "Save draft" : "Create draft"}
            </button>
            {editingId ? (
              <button
                type="button"
                disabled={busy}
                onClick={resetForm}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>

        <aside className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300 space-y-3">
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
