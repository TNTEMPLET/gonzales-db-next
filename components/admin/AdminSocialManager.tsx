"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

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

function IconEdit(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

function IconPublish(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

/** Take down live post — undo / revert metaphor. */
function IconUnpublish(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
    </svg>
  );
}

function IconDelete(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

const actionIconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm transition enabled:hover:bg-zinc-800/90 disabled:cursor-not-allowed disabled:opacity-50";

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
  syncedFromFacebook: boolean;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  data: SocialPostRecord[];
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

export default function AdminSocialManager() {
  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [facebookPublishConfigured, setFacebookPublishConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState({ link: false, image: false });
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const charCount = useMemo(() => form.body.length, [form.body]);
  const socialStats = useMemo(() => {
    const drafts = posts.filter((post) => post.status === "DRAFT").length;
    const failed = posts.filter((post) => post.status === "FAILED").length;
    const published = posts.filter((post) => post.status === "PUBLISHED").length;

    return { drafts, failed, published, total: posts.length };
  }, [posts]);
  const canSave = Boolean(form.body.trim() || form.imageUrl.trim());

  useEffect(() => {
    void loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPosts() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/social", {
        cache: "no-store",
      });
      const json = (await response.json()) as ListResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in json ? String(json.error) : "Failed to load");
      }
      const rows = (json as ListResponse).data || [];
      setPosts(
        rows.map((p) => ({
          ...p,
          syncedFromFacebook: Boolean(p.syncedFromFacebook),
        })),
      );
      setFacebookPublishConfigured(
        Boolean((json as ListResponse).facebookPublishConfigured),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setBusy(false);
    }
  }

  async function syncFromFacebook() {
    if (!facebookPublishConfigured) {
      setError("Facebook env vars are not configured on the server.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/social/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPosts: 200 }),
      });
      const json = (await response.json()) as {
        error?: string;
        data?: { fetched: number; created: number; updated: number; posts: SocialPostRecord[] };
      };
      if (!response.ok) {
        throw new Error(json.error || "Sync failed");
      }
      const payload = json.data;
      if (payload?.posts) {
        setPosts(
          payload.posts.map((p) => ({
            ...p,
            syncedFromFacebook: Boolean(p.syncedFromFacebook),
          })),
        );
      } else {
        await loadPosts();
      }
      if (payload) {
        setNotice(
          `Synced Facebook: ${payload.fetched} fetched, ${payload.created} new, ${payload.updated} updated.`,
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed");
      await loadPosts();
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAttachmentOpen({ link: false, image: false });
  }

  async function uploadSocialImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed");
      event.target.value = "";
      return;
    }
    setImageUploadBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/admin/social/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as { error?: string; data?: { imageUrl?: string } };
      if (!response.ok) {
        throw new Error(json.error || "Upload failed");
      }
      const url = json.data?.imageUrl?.trim();
      if (url) {
        setForm((f) => ({ ...f, imageUrl: url }));
        setAttachmentOpen((a) => ({ ...a, image: true }));
        setNotice("Image uploaded — ready to save draft.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setImageUploadBusy(false);
      event.target.value = "";
    }
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
        ? `/api/admin/social/${editingId}`
        : "/api/admin/social";
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

  async function unpublishPost(id: string) {
    if (!facebookPublishConfigured) {
      setError("Facebook env vars are not configured on the server.");
      return;
    }
    if (
      !confirm(
        "Remove this post from Facebook and save it as a draft here? This cannot be undone on Facebook.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/social/${id}/unpublish`, {
        method: "POST",
      });
      const json = (await response.json()) as { error?: string; data?: SocialPostRecord };
      if (!response.ok) {
        throw new Error(json.error || "Unpublish failed");
      }
      setNotice("Removed from Facebook and saved as draft.");
      resetForm();
      await loadPosts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unpublish failed");
      await loadPosts();
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
      const response = await fetch(`/api/admin/social/${id}/publish`, {
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
      const response = await fetch(`/api/admin/social/${id}`, {
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Shared AP Baseball Facebook page
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Drafts stay in this admin tool. Published posts are public on Facebook;
            failed posts need review before trying again.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total</p>
            <p className="mt-1 text-2xl font-semibold">{socialStats.total}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Drafts</p>
            <p className="mt-1 text-2xl font-semibold">{socialStats.drafts}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">Published</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-100">{socialStats.published}</p>
          </div>
          <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-red-300/80">Needs review</p>
            <p className="mt-1 text-2xl font-semibold text-red-100">{socialStats.failed}</p>
          </div>
        </div>
      </div>

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
            <div className="text-center">
              <h2 className="text-lg font-bold text-zinc-100">
                {editingId ? "Edit post" : "Create post"}
              </h2>
              <p className="text-xs text-zinc-400">
                Save drafts for review; publish only when ready for the public Page.
              </p>
            </div>
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
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400">Upload image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void uploadSocialImage(e)}
                      disabled={busy || imageUploadBusy}
                      className="mt-1 w-full rounded-lg border border-zinc-600 bg-[#242526] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-200"
                    />
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      Canva (or any tool): export PNG or JPG, then upload here for a stable URL
                      Facebook can fetch.
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-400">
                      Or image URL <span className="font-normal text-zinc-500">(HTTPS, public)</span>
                    </span>
                    <input
                      value={form.imageUrl}
                      onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-lg border border-zinc-600 bg-[#242526] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#2374E1] focus:outline-none"
                    />
                  </label>
                </div>
              ) : null}
              <p className="text-xs text-zinc-500">
                With an image, Facebook posts as a photo; the link field is not used as the primary
                attachment.
              </p>
            </div>
          ) : null}

          <p className="px-4 pb-1 text-xs text-zinc-500">{charCount} characters</p>

          <div className="p-3 pt-1">
            <button
              type="button"
              disabled={busy || imageUploadBusy || !canSave}
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
            <li>
              <strong>Sync from Facebook</strong> imports Page posts into this shared AP Baseball
              list and refreshes matching rows.
            </li>
            <li>Link previews are generated by Facebook from Open Graph tags on the URL.</li>
            <li>Image URLs must be publicly reachable over HTTPS.</li>
            <li>
              <strong>Canva:</strong> download PNG/JPG from your design, then use{" "}
              <strong>Upload image</strong> in the composer so the file is hosted on this site.
            </li>
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

      <div className="min-w-0 max-w-full rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Posts</h2>
          <button
            type="button"
            disabled={busy || !facebookPublishConfigured}
            onClick={() => void syncFromFacebook()}
            className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Working…" : "Sync from Facebook"}
          </button>
        </div>
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <thead className="bg-zinc-950/80 text-zinc-400">
              <tr>
                <th className="w-36 px-3 py-2 text-left align-top">Status</th>
                <th className="w-24 px-3 py-2 text-left align-top">Source</th>
                <th className="min-w-0 px-3 py-2 text-left align-top">Preview</th>
                <th className="w-40 px-3 py-2 text-left align-top">Posted / created</th>
                <th className="w-44 px-3 py-2 text-right align-top">Actions</th>
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
                  <td className="px-3 py-2 align-top text-xs text-zinc-400">
                    {post.syncedFromFacebook ? (
                      <span className="rounded-full bg-blue-950/60 px-2 py-0.5 text-blue-200">
                        Facebook
                      </span>
                    ) : (
                      <span className="text-zinc-500">Admin</span>
                    )}
                  </td>
                  <td className="min-w-0 overflow-hidden px-3 py-2 align-top text-zinc-300">
                    <p className="line-clamp-3 wrap-break-word whitespace-pre-wrap">{post.body}</p>
                    {post.linkUrl ? (
                      <p className="mt-1 text-xs text-brand-gold truncate">{post.linkUrl}</p>
                    ) : null}
                    {post.imageUrl ? (
                      <p className="mt-1 text-xs text-zinc-500 truncate">{post.imageUrl}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-zinc-500 leading-snug">
                    {new Date(post.publishedAt ?? post.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {post.status === "DRAFT" || post.status === "FAILED" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(post)}
                          className={`${actionIconBtn} border-zinc-600 text-zinc-200`}
                          title="Edit draft"
                          aria-label="Edit draft"
                        >
                          <IconEdit className="h-[18px] w-[18px]" />
                        </button>
                      ) : null}
                      {post.status === "DRAFT" || post.status === "FAILED" ? (
                        <button
                          type="button"
                          disabled={busy || !facebookPublishConfigured}
                          onClick={() => void publishPost(post.id)}
                          className={`${actionIconBtn} border-brand-gold text-brand-gold`}
                          title="Publish to Facebook"
                          aria-label="Publish to Facebook"
                        >
                          <IconPublish className="h-[18px] w-[18px]" />
                        </button>
                      ) : null}
                      {post.status === "PUBLISHED" ? (
                        <button
                          type="button"
                          disabled={busy || !facebookPublishConfigured}
                          onClick={() => void unpublishPost(post.id)}
                          className={`${actionIconBtn} border-amber-600 text-amber-200`}
                          title="Unpublish — remove from Facebook and save as draft"
                          aria-label="Unpublish — remove from Facebook and save as draft"
                        >
                          <IconUnpublish className="h-[18px] w-[18px]" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || post.status === "PUBLISHING"}
                        onClick={() => void removePost(post.id)}
                        className={`${actionIconBtn} border-red-800/90 text-red-300`}
                        title="Delete post record"
                        aria-label="Delete post record"
                      >
                        <IconDelete className="h-[18px] w-[18px]" />
                      </button>
                    </div>
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
