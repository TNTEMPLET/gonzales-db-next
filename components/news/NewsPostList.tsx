"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type NewsListPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  author: string | null;
  featured: boolean;
  rotatorEnabled: boolean;
  publishedAt: Date | null;
};

function formatPublishedDate(value: Date | null) {
  if (!value) return "Draft";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function NewsPostList({
  posts: initialPosts,
  isAdmin,
}: {
  posts: NewsListPost[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<NewsListPost[]>(initialPosts);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [togglingRotatorSlug, setTogglingRotatorSlug] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");

  async function handleDelete(slug: string) {
    if (!confirm("Delete this news post? This cannot be undone.")) return;
    setDeletingSlug(slug);
    setError("");
    try {
      const response = await fetch(`/api/news/${slug}`, { method: "DELETE" });
      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Failed to delete");
      }
      setPosts((prev) => prev.filter((p) => p.slug !== slug));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
    } finally {
      setDeletingSlug(null);
    }
  }

  async function handleRotatorToggle(post: NewsListPost, enabled: boolean) {
    setTogglingRotatorSlug(post.slug);
    setError("");

    try {
      const response = await fetch(`/api/news/${post.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotatorEnabled: enabled }),
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Failed to update rotator setting");
      }

      setPosts((prev) =>
        prev.map((item) =>
          item.slug === post.slug
            ? {
                ...item,
                rotatorEnabled: enabled,
              }
            : item,
        ),
      );
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update rotator setting",
      );
    } finally {
      setTogglingRotatorSlug(null);
    }
  }

  return (
    <>
      {error ? (
        <p className="mb-4 text-sm text-red-300 border border-red-800 bg-red-950/40 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <p className="text-zinc-300">No published posts yet.</p>
          {isAdmin ? (
            <Link
              href="/news/admin"
              className="text-sm text-brand-gold hover:text-brand-gold/80 transition mt-2 inline-block"
            >
              Create your first post →
            </Link>
          ) : (
            <p className="text-zinc-500 text-sm mt-2">
              Create your first article in the News Admin page.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-5">
          {posts.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 hover:border-zinc-700 transition"
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                {post.imageUrl ? (
                  <div className="w-full lg:w-72 xl:w-80 lg:flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-1">
                    <img
                      src={post.imageUrl}
                      alt={post.title}
                      className="w-full h-auto max-h-[32vh] sm:max-h-[38vh] lg:max-h-[260px] xl:max-h-[300px] rounded-lg object-contain"
                    />
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                      {formatPublishedDate(post.publishedAt)}
                    </p>
                    <div className="flex items-center gap-3">
                      {post.featured ? (
                        <span className="text-[11px] bg-brand-gold text-black px-2 py-1 rounded-full font-semibold tracking-wide">
                          Featured
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <h2 className="text-2xl font-semibold mb-2">{post.title}</h2>
                  {post.excerpt ? (
                    <p className="text-zinc-300 mb-4">{post.excerpt}</p>
                  ) : null}
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-zinc-500 text-sm">
                      By {post.author || "League Staff"}
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-4">
                        {isAdmin ? (
                          <>
                            <Link
                              href={`/news/admin?edit=${post.slug}`}
                              className="text-sm text-zinc-400 hover:text-zinc-200 transition"
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDelete(post.slug)}
                              disabled={deletingSlug === post.slug}
                              className="text-sm text-red-400 hover:text-red-300 transition disabled:opacity-50"
                            >
                              {deletingSlug === post.slug
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </>
                        ) : null}
                        <Link
                          href={`/news/${post.slug}`}
                          className="text-brand-gold hover:text-brand-gold/80 text-sm font-semibold"
                        >
                          Read More
                        </Link>
                      </div>
                      {isAdmin ? (
                        <label className="inline-flex items-center gap-2 text-sm text-zinc-400">
                          <input
                            type="checkbox"
                            checked={post.rotatorEnabled}
                            disabled={togglingRotatorSlug === post.slug}
                            onChange={(event) =>
                              void handleRotatorToggle(post, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand-purple focus:ring-brand-purple"
                          />
                          Rotator
                        </label>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
