"use client";

import { useMemo, useState, type FormEvent } from "react";

type DugoutAuthor = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

type DugoutPost = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: DugoutAuthor;
};

type DugoutTimelineProps = {
  initialPosts: DugoutPost[];
  isAdmin?: boolean;
  currentUserId?: string | null;
};

const MAX_POST_LENGTH = 280;

function getDisplayName(author: DugoutAuthor) {
  if (author.firstName || author.lastName) {
    return [author.firstName, author.lastName].filter(Boolean).join(" ");
  }
  return author.name || author.email;
}

function formatPostTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DugoutTimeline({
  initialPosts,
  isAdmin = false,
  currentUserId = null,
}: DugoutTimelineProps) {
  const [posts, setPosts] = useState<DugoutPost[]>(initialPosts);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/dugout/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to post update");
      }

      setContent("");
      setPosts((prev) => [json.data as DugoutPost, ...prev]);
      setNotice("Update posted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to post update");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(post: DugoutPost) {
    setEditingId(post.id);
    setEditContent(post.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  async function saveEdit(id: string) {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    setEditBusy(true);
    try {
      const response = await fetch(`/api/dugout/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to save");
      setPosts((prev) =>
        prev.map((p) => (p.id === id ? (json.data as DugoutPost) : p)),
      );
      setEditingId(null);
      setEditContent("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save edit");
    } finally {
      setEditBusy(false);
    }
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    try {
      const response = await fetch(`/api/dugout/posts/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Failed to delete");
      }
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
    }
  }

  const remaining = useMemo(() => MAX_POST_LENGTH - content.length, [content]);

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      <aside className="space-y-5">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h3 className="text-base font-semibold mb-3">Post an Update</h3>
          <form onSubmit={createPost} className="space-y-3">
            <textarea
              rows={5}
              maxLength={MAX_POST_LENGTH}
              placeholder="Share schedule changes, player updates, and dugout notes..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {remaining} characters left
              </p>
              <button
                type="submit"
                disabled={busy || !content.trim()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Posting..." : "Post"}
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <p className="text-sm text-red-300 border border-red-800 bg-red-950/40 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-emerald-300 border border-emerald-800 bg-emerald-950/30 rounded-lg px-3 py-2">
            {notice}
          </p>
        ) : null}
      </aside>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-5">
        <h3 className="text-base font-semibold mb-4">Coach Timeline</h3>

        {posts.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
            No updates yet. Be the first coach to post in The Dugout.
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const canManage = isAdmin || post.author.id === currentUserId;
              const isEditing = editingId === post.id;

              return (
                <article
                  key={post.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold text-zinc-100">
                      {getDisplayName(post.author)}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-zinc-500">
                        {formatPostTime(post.createdAt)}
                      </p>
                      {canManage && !isEditing ? (
                        <>
                          <button
                            onClick={() => startEdit(post)}
                            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deletePost(post.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition"
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        rows={4}
                        maxLength={280}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-600 px-3 py-2 text-sm"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <p className="text-xs text-zinc-500 mr-auto">
                          {280 - editContent.length} left
                        </p>
                        <button
                          onClick={cancelEdit}
                          className="text-xs text-zinc-400 hover:text-zinc-200 transition px-3 py-1.5 rounded-lg border border-zinc-700"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={editBusy || !editContent.trim()}
                          onClick={() => saveEdit(post.id)}
                          className="text-xs bg-brand-purple hover:bg-brand-purple-dark px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60"
                        >
                          {editBusy ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 whitespace-pre-wrap text-zinc-200">
                      {post.content}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
