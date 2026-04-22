"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { ContentOrgId } from "@/lib/siteConfig";

type NewsStatus = "DRAFT" | "PUBLISHED";

type NewsPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  imageUrl: string | null;
  author: string | null;
  featured: boolean;
  rotatorEnabled: boolean;
  status: NewsStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RegisteredUser = {
  id: string;
  email: string;
  name: string | null;
  googleSub: string | null;
  createdAt: string;
  updatedAt: string;
  isAdmin: boolean;
};

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminUsersApiResponse = {
  admins: AdminUser[];
  currentAdminEmail: string | null;
  data: RegisteredUser[];
};

type PostPayload = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  author: string;
  featured: boolean;
  rotatorEnabled: boolean;
  status: NewsStatus;
  publishedAt: string;
};

function createEmptyPayload(defaultAuthor: string): PostPayload {
  return {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    imageUrl: "",
    author: defaultAuthor,
    featured: false,
    rotatorEnabled: false,
    status: "PUBLISHED",
    publishedAt: "",
  };
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export default function NewsAdminPanel({
  adminEmail,
  adminName,
  initialEditSlug,
  targetOrg,
}: {
  adminEmail: string;
  adminName: string | null;
  initialEditSlug?: string;
  targetOrg: ContentOrgId;
}) {
  const router = useRouter();
  const orgQuery = `org=${targetOrg}`;
  const defaultAuthor = adminName?.trim() || adminEmail;
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string | null>(
    null,
  );
  const [selectedSlug, setSelectedSlug] = useState(initialEditSlug ?? "");
  const [createPayload, setCreatePayload] = useState<PostPayload>(() =>
    createEmptyPayload(defaultAuthor),
  );
  const [editPayload, setEditPayload] = useState<PostPayload>(
    createEmptyPayload(""),
  );
  const [busy, setBusy] = useState(false);
  const [createImageBusy, setCreateImageBusy] = useState(false);
  const [editImageBusy, setEditImageBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadPosts();
    void loadRegisteredUsers();
  }, []);

  const selectedPost = useMemo(
    () => posts.find((post) => post.slug === selectedSlug),
    [posts, selectedSlug],
  );

  async function loadPosts() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/news?limit=50&${orgQuery}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to load posts");
      }

      const loaded: NewsPost[] = json.data || [];
      setPosts(loaded);
      setNotice("News posts loaded");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setBusy(false);
    }
  }

  async function loadRegisteredUsers() {
    try {
      const response = await fetch(`/api/admin/users?${orgQuery}`, {
        method: "GET",
      });
      const json = (await response.json()) as
        | AdminUsersApiResponse
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in json ? json.error : "Failed to load registered users",
        );
      }

      const payload = json as AdminUsersApiResponse;
      setRegisteredUsers(payload.data || []);
      setAdmins(payload.admins || []);
      setCurrentAdminEmail(payload.currentAdminEmail || null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load registered users",
      );
    }
  }

  async function promoteUserToAdmin(userId: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to promote user");
      }

      await loadRegisteredUsers();
      setNotice(`Promoted ${json.admin?.email || "user"} to admin`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to promote user");
    } finally {
      setBusy(false);
    }
  }

  async function demoteAdminByEmail(email: string) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/users?${orgQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to demote admin");
      }

      await loadRegisteredUsers();
      setNotice(`Demoted ${email} from admin`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to demote admin");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      window.dispatchEvent(new Event("gdb-auth-changed"));
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/news?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createPayload.publishedAt
            ? {
                ...createPayload,
                publishedAt: fromLocalDateTimeInput(createPayload.publishedAt),
              }
            : createPayload,
        ),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to create post");
      }

      setCreatePayload(createEmptyPayload(defaultAuthor));
      await loadPosts();
      setNotice("Post created");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCreateImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed");
      event.target.value = "";
      return;
    }

    setCreateImageBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/news/upload", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to upload image");
      }

      setCreatePayload((prev) => ({
        ...prev,
        imageUrl: json.data?.imageUrl || "",
      }));
      setNotice("Image uploaded");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setCreateImageBusy(false);
      event.target.value = "";
    }
  }

  async function uploadEditImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed");
      event.target.value = "";
      return;
    }

    setEditImageBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/news/upload", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to upload image");
      }

      setEditPayload((prev) => ({
        ...prev,
        imageUrl: json.data?.imageUrl || "",
      }));
      setNotice("Image uploaded");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setEditImageBusy(false);
      event.target.value = "";
    }
  }

  function startEdit(slug: string) {
    const post = posts.find((item) => item.slug === slug);
    if (!post) return;

    setSelectedSlug(slug);
    setEditPayload({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      imageUrl: post.imageUrl || "",
      author: post.author || "",
      featured: post.featured,
      rotatorEnabled: post.rotatorEnabled,
      status: post.status,
      publishedAt: toLocalDateTimeInput(post.publishedAt),
    });
  }

  async function saveEditedPost(closeAfterSave: boolean) {
    if (!selectedSlug) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/news/${selectedSlug}?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editPayload.publishedAt
            ? {
                ...editPayload,
                publishedAt: fromLocalDateTimeInput(editPayload.publishedAt),
              }
            : {
                ...editPayload,
                publishedAt: editPayload.status === "DRAFT" ? null : undefined,
              },
        ),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to update post");
      }

      await loadPosts();
      if (closeAfterSave) {
        setSelectedSlug("");
        setEditPayload(createEmptyPayload(""));
      } else {
        setSelectedSlug(json.data.slug);
      }
      setNotice("Post updated");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setBusy(false);
    }
  }

  async function updatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveEditedPost(false);
  }

  async function saveAndClosePost() {
    await saveEditedPost(true);
  }

  async function deletePost() {
    if (!selectedSlug) return;

    const confirmed = window.confirm(
      "Delete this post? This action cannot be undone.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/news/${selectedSlug}?${orgQuery}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to delete post");
      }

      setSelectedSlug("");
      setEditPayload(createEmptyPayload(""));
      await loadPosts();
      setNotice("Post deleted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-8">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <h2 className="font-semibold text-lg mb-3">
          Signed in as {adminEmail}
        </h2>
        <p className="text-zinc-400 text-sm mb-4">
          Your account has admin access to create, update, and delete posts.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <button
            onClick={loadPosts}
            type="button"
            className="rounded-lg border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-sm font-semibold"
          >
            Load Posts
          </button>
          <button
            onClick={logout}
            type="button"
            className="rounded-lg border border-red-700 text-red-300 hover:bg-red-950/40 px-4 py-2 text-sm font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-8">
        <form
          onSubmit={createPost}
          className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3"
        >
          <h2 className="font-semibold text-lg">Create Post</h2>
          <input
            required
            placeholder="Title"
            value={createPayload.title}
            onChange={(event) =>
              setCreatePayload((prev) => ({
                ...prev,
                title: event.target.value,
              }))
            }
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            placeholder="Slug (optional)"
            value={createPayload.slug}
            onChange={(event) =>
              setCreatePayload((prev) => ({
                ...prev,
                slug: event.target.value,
              }))
            }
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Excerpt"
            value={createPayload.excerpt}
            onChange={(event) =>
              setCreatePayload((prev) => ({
                ...prev,
                excerpt: event.target.value,
              }))
            }
            rows={2}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <textarea
            required
            placeholder="Article content"
            value={createPayload.content}
            onChange={(event) =>
              setCreatePayload((prev) => ({
                ...prev,
                content: event.target.value,
              }))
            }
            rows={8}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3 items-start">
            <input
              placeholder="Author"
              value={createPayload.author}
              onChange={(event) =>
                setCreatePayload((prev) => ({
                  ...prev,
                  author: event.target.value,
                }))
              }
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm self-start"
            />
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={uploadCreateImage}
                disabled={busy || createImageBusy}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-200"
              />
              <p className="text-xs text-zinc-500">
                Upload image files only (max 5MB).
              </p>
              {createPayload.imageUrl ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                  <p className="text-[11px] text-zinc-500 break-all mb-2">
                    {createPayload.imageUrl}
                  </p>
                  <img
                    src={createPayload.imageUrl}
                    alt="Create post preview"
                    className="h-24 w-full rounded object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCreatePayload((prev) => ({ ...prev, imageUrl: "" }))
                    }
                    className="mt-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800/60 px-2 py-1"
                  >
                    Remove image
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={createPayload.status}
              onChange={(event) =>
                setCreatePayload((prev) => ({
                  ...prev,
                  status: event.target.value as NewsStatus,
                }))
              }
              className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
            <input
              type="datetime-local"
              value={createPayload.publishedAt}
              onChange={(event) =>
                setCreatePayload((prev) => ({
                  ...prev,
                  publishedAt: event.target.value,
                }))
              }
              className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-zinc-500">
            Only posts with status{" "}
            <span className="text-zinc-300">Published</span> appear on the
            public news feed.
          </p>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={createPayload.featured}
              onChange={(event) =>
                setCreatePayload((prev) => ({
                  ...prev,
                  featured: event.target.checked,
                }))
              }
            />
            Featured post
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={createPayload.rotatorEnabled}
              onChange={(event) =>
                setCreatePayload((prev) => ({
                  ...prev,
                  rotatorEnabled: event.target.checked,
                }))
              }
            />
            Enable homepage rotator mode
          </label>
          <p className="text-xs text-zinc-500 -mt-1">
            Rotator requires a published post with an uploaded image.
          </p>
          <button
            disabled={busy || createImageBusy}
            type="submit"
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy || createImageBusy ? "Working..." : "Create Post"}
          </button>
        </form>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Edit Existing Post</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Choose an article, then edit or delete it.
            </p>
          </div>

          <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800">
            {posts.length === 0 ? (
              <p className="text-zinc-500 text-sm p-3">No posts loaded</p>
            ) : (
              posts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => startEdit(post.slug)}
                  className={`w-full text-left px-3 py-2 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/60 ${
                    selectedSlug === post.slug ? "bg-zinc-800" : ""
                  }`}
                >
                  <p className="font-medium text-sm">{post.title}</p>
                  <p className="text-xs text-zinc-500">{post.slug}</p>
                </button>
              ))
            )}
          </div>

          {selectedPost ? (
            <form onSubmit={updatePost} className="space-y-3">
              <input
                required
                placeholder="Title"
                value={editPayload.title}
                onChange={(event) =>
                  setEditPayload((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Slug"
                value={editPayload.slug}
                onChange={(event) =>
                  setEditPayload((prev) => ({
                    ...prev,
                    slug: event.target.value,
                  }))
                }
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Excerpt"
                value={editPayload.excerpt}
                onChange={(event) =>
                  setEditPayload((prev) => ({
                    ...prev,
                    excerpt: event.target.value,
                  }))
                }
                rows={2}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <textarea
                required
                placeholder="Article content"
                value={editPayload.content}
                onChange={(event) =>
                  setEditPayload((prev) => ({
                    ...prev,
                    content: event.target.value,
                  }))
                }
                rows={6}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Author"
                  value={editPayload.author}
                  onChange={(event) =>
                    setEditPayload((prev) => ({
                      ...prev,
                      author: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={uploadEditImage}
                    disabled={busy || editImageBusy}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-200"
                  />
                  <p className="text-xs text-zinc-500">
                    Upload image files only (max 5MB).
                  </p>
                  {editPayload.imageUrl ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                      <p className="text-[11px] text-zinc-500 break-all mb-2">
                        {editPayload.imageUrl}
                      </p>
                      <img
                        src={editPayload.imageUrl}
                        alt="Edit post preview"
                        className="h-24 w-full rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditPayload((prev) => ({ ...prev, imageUrl: "" }))
                        }
                        className="mt-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800/60 px-2 py-1"
                      >
                        Remove image
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={editPayload.status}
                  onChange={(event) =>
                    setEditPayload((prev) => ({
                      ...prev,
                      status: event.target.value as NewsStatus,
                    }))
                  }
                  className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
                <input
                  type="datetime-local"
                  value={editPayload.publishedAt}
                  onChange={(event) =>
                    setEditPayload((prev) => ({
                      ...prev,
                      publishedAt: event.target.value,
                    }))
                  }
                  className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={editPayload.featured}
                  onChange={(event) =>
                    setEditPayload((prev) => ({
                      ...prev,
                      featured: event.target.checked,
                    }))
                  }
                />
                Featured post
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={editPayload.rotatorEnabled}
                  onChange={(event) =>
                    setEditPayload((prev) => ({
                      ...prev,
                      rotatorEnabled: event.target.checked,
                    }))
                  }
                />
                Enable homepage rotator mode
              </label>
              <p className="text-xs text-zinc-500 -mt-1">
                Rotator requires a published post with an uploaded image.
              </p>

              <div className="flex gap-3">
                <button
                  disabled={busy || editImageBusy}
                  type="submit"
                  className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {busy || editImageBusy ? "Working..." : "Save"}
                </button>
                <button
                  disabled={busy || editImageBusy}
                  type="button"
                  onClick={saveAndClosePost}
                  className="rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800/60 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {busy || editImageBusy ? "Working..." : "Save & Close"}
                </button>
                <button
                  disabled={busy || editImageBusy}
                  type="button"
                  onClick={deletePost}
                  className="rounded-lg border border-red-700 text-red-300 hover:bg-red-950/40 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </form>
          ) : (
            <p className="text-zinc-500 text-sm">Select a post to edit.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Registered Users</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Users appear here after Google sign-in. Promote users to grant admin
            access.
          </p>
        </div>

        <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
          {registeredUsers.length === 0 ? (
            <p className="text-zinc-500 text-sm p-3">
              No registered users yet.
            </p>
          ) : (
            registeredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 px-3 py-3 border-b border-zinc-800 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {user.name || "Unnamed User"}
                  </p>
                  <p className="text-xs text-zinc-500">{user.email}</p>
                </div>
                {user.isAdmin ? (
                  user.email === currentAdminEmail ? (
                    <span className="text-[11px] rounded-full px-2 py-1 border border-zinc-700 text-zinc-400">
                      You
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => demoteAdminByEmail(user.email)}
                      className="text-xs rounded-lg border border-red-700 text-red-300 hover:bg-red-950/40 px-3 py-1.5 disabled:opacity-60"
                    >
                      Demote
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => promoteUserToAdmin(user.id)}
                    className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-1.5 disabled:opacity-60"
                  >
                    Promote
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {admins.length > 0 ? (
          <p className="text-xs text-zinc-500">
            Total admins: <span className="text-zinc-300">{admins.length}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
