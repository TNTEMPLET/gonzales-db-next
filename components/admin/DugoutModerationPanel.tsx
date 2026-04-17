"use client";

import { useEffect, useMemo, useState } from "react";

type DugoutAuthor = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

type DugoutPost = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: DugoutAuthor;
};

function getDisplayName(author: DugoutAuthor) {
  if (author.firstName || author.lastName) {
    return [author.firstName, author.lastName].filter(Boolean).join(" ");
  }
  return author.name || author.email;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DugoutModerationPanel() {
  const [posts, setPosts] = useState<DugoutPost[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadPosts();
  }, []);

  async function loadPosts() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/dugout/posts", { cache: "no-store" });
      const json = (await response.json()) as {
        error?: string;
        data?: DugoutPost[];
      };

      if (!response.ok) {
        throw new Error(json.error || "Failed to load dugout posts");
      }

      setPosts(json.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(post: DugoutPost) {
    setEditingId(post.id);
    setEditValue(post.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  async function saveEdit(postId: string) {
    const content = editValue.trim();
    if (!content) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/dugout/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await response.json()) as {
        error?: string;
        data?: DugoutPost;
      };

      if (!response.ok) {
        throw new Error(json.error || "Failed to update post");
      }

      if (json.data) {
        setPosts((prev) =>
          prev.map((post) => (post.id === postId ? json.data! : post)),
        );
      }
      setEditingId(null);
      setEditValue("");
      setNotice("Post updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(postId: string) {
    if (!confirm("Delete this dugout post?")) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/dugout/posts/${postId}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error || "Failed to delete post");
      }

      setPosts((prev) => prev.filter((post) => post.id !== postId));
      setNotice("Post deleted.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return posts;

    return posts.filter((post) => {
      const author = getDisplayName(post.author).toLowerCase();
      return (
        post.content.toLowerCase().includes(needle) ||
        author.includes(needle) ||
        post.author.email.toLowerCase().includes(needle)
      );
    });
  }, [posts, query]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-semibold">Moderate Dugout Feed</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Edit or remove coach posts across The Dugout feed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPosts()}
          disabled={busy}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by author, email, or post content"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
      </div>

      {notice ? (
        <p className="mb-3 text-sm text-emerald-300 border border-emerald-800 bg-emerald-950/30 rounded-lg px-3 py-2">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 text-sm text-red-300 border border-red-800 bg-red-950/40 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
          No dugout posts found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => {
            const isEditing = editingId === post.id;
            return (
              <article
                key={post.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">
                      {getDisplayName(post.author)}
                    </p>
                    <p className="text-xs text-zinc-500">{post.author.email}</p>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {formatDateTime(post.createdAt)}
                  </p>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={editValue}
                      maxLength={280}
                      onChange={(event) => setEditValue(event.target.value)}
                      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || !editValue.trim()}
                        onClick={() => void saveEdit(post.id)}
                        className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-6 whitespace-pre-wrap text-zinc-200 mb-3">
                      {post.content}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => beginEdit(post)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deletePost(post.id)}
                        className="rounded-lg border border-red-700 text-red-300 px-3 py-1.5 text-xs hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
