"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { Game } from "@/lib/fetchGames";
import CoachAuthButton from "@/components/dugout/CoachAuthButton";

type DugoutAuthor = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

type DugoutComment = {
  id: string;
  content: string;
  postId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  author: DugoutAuthor;
  replies: DugoutComment[];
};

type DugoutPost = {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: "IMAGE" | "GIF" | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  viewerReaction: string | null;
  author: DugoutAuthor;
};

type DugoutTimelineProps = {
  initialPosts: DugoutPost[];
  initialScheduleGames?: Game[];
  isAdmin?: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  currentUserAvatarUrl?: string | null;
  initialView?: "timeline" | "notifications" | "schedule";
};

type GifResult = {
  id: string;
  title: string;
  previewUrl: string;
  mediaUrl: string;
  mediaType: "GIF";
};

type GifSearchResponse = {
  data?: GifResult[];
  error?: string;
  hasMore?: boolean;
  nextOffset?: number;
  providerConfigured?: boolean;
  message?: string;
};

type DugoutNotificationCounts = {
  unreadLikeCount: number;
  unreadReplyCount: number;
  totalUnreadCount: number;
  lastSeenAt: string | null;
};

const MAX_POST_LENGTH = 280;
const MAX_COMMENT_LENGTH = 280;
const EMOJI_CHOICES = ["⚾", "🔥", "👏", "🎉", "💪", "🙌"];

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

function formatScheduleTime(game: Game) {
  if (game.start_time) {
    return new Date(game.start_time).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const date =
    typeof game.localized_date === "string" ? game.localized_date : "Date TBD";
  const time =
    typeof game.localized_time === "string" ? game.localized_time : "TBD";
  return `${date} ${time}`.trim();
}

async function uploadMedia(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/dugout/media", {
    method: "POST",
    body: formData,
  });

  const json = (await response.json()) as {
    error?: string;
    data?: {
      mediaUrl: string;
      mediaType: "IMAGE" | "GIF";
    };
  };

  if (!response.ok || !json.data) {
    throw new Error(json.error || "Failed to upload media");
  }

  return json.data;
}

function DugoutMedia({
  post,
  alt,
}: {
  post: Pick<DugoutPost, "mediaUrl" | "mediaType">;
  alt: string;
}) {
  if (!post.mediaUrl) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
      <Image
        src={post.mediaUrl}
        alt={alt}
        width={1200}
        height={900}
        unoptimized={post.mediaType === "GIF"}
        className="h-auto max-h-115 w-full object-cover"
      />
    </div>
  );
}

function addCommentToTree(
  tree: DugoutComment[],
  comment: DugoutComment,
): DugoutComment[] {
  if (!comment.parentId) {
    return [...tree, comment];
  }

  return tree.map((node) => {
    if (node.id === comment.parentId) {
      return {
        ...node,
        replies: [...node.replies, comment],
      };
    }

    return {
      ...node,
      replies: addCommentToTree(node.replies, comment),
    };
  });
}

function removeCommentFromTree(
  tree: DugoutComment[],
  commentId: string,
): { next: DugoutComment[]; removedCount: number } {
  let removedCount = 0;

  function countNested(comment: DugoutComment): number {
    return (
      1 + comment.replies.reduce((acc, reply) => acc + countNested(reply), 0)
    );
  }

  const next = tree
    .map((comment) => {
      if (comment.id === commentId) {
        removedCount += countNested(comment);
        return null;
      }

      const childResult = removeCommentFromTree(comment.replies, commentId);
      removedCount += childResult.removedCount;

      return {
        ...comment,
        replies: childResult.next,
      };
    })
    .filter(Boolean) as DugoutComment[];

  return { next, removedCount };
}

export default function DugoutTimeline({
  initialPosts,
  initialScheduleGames = [],
  isAdmin = false,
  currentUserId = null,
  currentUserName = null,
  currentUserAvatarUrl = null,
  initialView = "timeline",
}: DugoutTimelineProps) {
  const [posts, setPosts] = useState<DugoutPost[]>(initialPosts);
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [selectedGif, setSelectedGif] = useState<GifResult | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifOffset, setGifOffset] = useState(0);
  const [gifHasMore, setGifHasMore] = useState(false);
  const [activeGifQuery, setActiveGifQuery] = useState("");
  const [gifBusy, setGifBusy] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editRemoveMedia, setEditRemoveMedia] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [likePickerOpenId, setLikePickerOpenId] = useState<string | null>(null);
  const likePickerRef = useRef<HTMLDivElement | null>(null);

  const [expandedCommentsByPost, setExpandedCommentsByPost] = useState<
    Record<string, boolean>
  >({});
  const [commentsLoadingByPost, setCommentsLoadingByPost] = useState<
    Record<string, boolean>
  >({});
  const [commentsByPost, setCommentsByPost] = useState<
    Record<string, DugoutComment[]>
  >({});
  const [commentInputByPost, setCommentInputByPost] = useState<
    Record<string, string>
  >({});
  const [replyTargetByPost, setReplyTargetByPost] = useState<
    Record<string, DugoutComment | null>
  >({});
  const [commentBusyByPost, setCommentBusyByPost] = useState<
    Record<string, boolean>
  >({});
  const [commentDeleteBusyId, setCommentDeleteBusyId] = useState<string | null>(
    null,
  );

  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notifications, setNotifications] = useState<DugoutNotificationCounts>({
    unreadLikeCount: 0,
    unreadReplyCount: 0,
    totalUnreadCount: 0,
    lastSeenAt: null,
  });
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [gifSearchOpen, setGifSearchOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  function replacePreviewUrl(nextUrl: string | null) {
    setMediaPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
  }

  function clearSelectedMedia() {
    setMediaFile(null);
    replacePreviewUrl(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearSelectedGif() {
    setSelectedGif(null);
  }

  function appendEmoji(emoji: string, editing = false) {
    if (editing) {
      setEditContent((prev) => `${prev}${emoji}`);
      return;
    }

    setContent((prev) => `${prev}${emoji}`);
  }

  function selectMedia(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Only image and GIF files are allowed");
      return;
    }

    setError("");
    clearSelectedGif();
    setMediaFile(file);
    replacePreviewUrl(URL.createObjectURL(file));
  }

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    selectMedia(file);
  }

  function onDropMedia(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    selectMedia(file);
  }

  async function searchGifs({ append = false }: { append?: boolean } = {}) {
    const query = (append ? activeGifQuery : gifQuery).trim();
    if (!query) {
      setGifResults([]);
      setGifOffset(0);
      setGifHasMore(false);
      setActiveGifQuery("");
      return;
    }

    setGifBusy(true);
    setError("");
    setNotice("");

    try {
      const offset = append ? gifOffset : 0;
      const response = await fetch(
        `/api/dugout/gifs?q=${encodeURIComponent(query)}&offset=${offset}&limit=15`,
        {
          cache: "no-store",
        },
      );
      const json = (await response.json()) as GifSearchResponse;

      if (!response.ok) {
        throw new Error(json.error || "Failed to search GIFs");
      }

      if (json.providerConfigured === false) {
        setGifResults([]);
        setGifHasMore(false);
        setGifOffset(0);
        setActiveGifQuery("");
        setNotice(
          json.message ||
            "GIF search is disabled. Add GIPHY_API_KEY to .env.local and restart the dev server.",
        );
        return;
      }

      const nextData = json.data ?? [];
      setGifResults((prev) => (append ? [...prev, ...nextData] : nextData));
      setGifHasMore(Boolean(json.hasMore));
      setGifOffset(json.nextOffset ?? offset + nextData.length);
      setActiveGifQuery(query);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to search GIFs");
    } finally {
      setGifBusy(false);
    }
  }

  function handleGifInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void searchGifs();
    }
  }

  async function fetchNotifications() {
    try {
      const response = await fetch("/api/dugout/notifications", {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        data?: DugoutNotificationCounts;
      };

      if (response.ok && json.data) {
        setNotifications(json.data);
      }
    } catch {
      // Ignore polling errors so it does not disrupt posting flow.
    }
  }

  async function markNotificationsSeen() {
    setNotificationBusy(true);
    try {
      const response = await fetch("/api/dugout/notifications", {
        method: "POST",
      });
      if (response.ok) {
        setNotifications((prev) => ({
          ...prev,
          unreadLikeCount: 0,
          unreadReplyCount: 0,
          totalUnreadCount: 0,
          lastSeenAt: new Date().toISOString(),
        }));
      }
    } finally {
      setNotificationBusy(false);
    }
  }

  useEffect(() => {
    void fetchNotifications();
    const id = window.setInterval(() => {
      void fetchNotifications();
    }, 60000);

    return () => {
      window.clearInterval(id);
    };
  }, []);

  // Close emoji reaction picker on outside click
  useEffect(() => {
    if (!likePickerOpenId) return;

    function handleOutside(e: MouseEvent) {
      if (
        likePickerRef.current &&
        !likePickerRef.current.contains(e.target as Node)
      ) {
        setLikePickerOpenId(null);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [likePickerOpenId]);

  useEffect(() => {
    if (!composerExpanded) return;

    function handleOutside(event: MouseEvent) {
      if (
        composerRef.current &&
        !composerRef.current.contains(event.target as Node) &&
        !content.trim() &&
        !mediaFile &&
        !selectedGif
      ) {
        setComposerExpanded(false);
        setGifSearchOpen(false);
        setEmojiPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [composerExpanded, content, mediaFile, selectedGif]);

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed && !mediaFile && !selectedGif) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const uploadedMedia = mediaFile ? await uploadMedia(mediaFile) : null;
      const attachedMedia = uploadedMedia
        ? uploadedMedia
        : selectedGif
          ? {
              mediaUrl: selectedGif.mediaUrl,
              mediaType: "GIF" as const,
            }
          : null;

      const response = await fetch("/api/dugout/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          mediaUrl: attachedMedia?.mediaUrl,
          mediaType: attachedMedia?.mediaType,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to post update");
      }

      setContent("");
      clearSelectedMedia();
      clearSelectedGif();
      setGifQuery("");
      setGifResults([]);
      setGifOffset(0);
      setGifHasMore(false);
      setActiveGifQuery("");
      setComposerExpanded(false);
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
    setEditRemoveMedia(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
    setEditRemoveMedia(false);
  }

  async function saveEdit(id: string) {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    setEditBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/dugout/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          removeMedia: editRemoveMedia,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to save");
      }

      setPosts((prev) =>
        prev.map((post) => (post.id === id ? (json.data as DugoutPost) : post)),
      );
      setEditingId(null);
      setEditContent("");
      setEditRemoveMedia(false);
      setNotice("Post updated");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save edit");
    } finally {
      setEditBusy(false);
    }
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;

    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/dugout/posts/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || "Failed to delete");
      }

      setPosts((prev) => prev.filter((post) => post.id !== id));
      setNotice("Post deleted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
    }
  }

  async function toggleLike(post: DugoutPost, reaction = "👍") {
    if (!currentUserId) return;
    setLikePickerOpenId(null);
    setLikeBusyId(post.id);
    setError("");

    try {
      // If already liked with same reaction, toggle off; otherwise apply new reaction
      const isUnlike = post.likedByViewer && post.viewerReaction === reaction;
      const response = await fetch(`/api/dugout/posts/${post.id}/like`, {
        method: isUnlike ? "DELETE" : "POST",
        ...(isUnlike
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reaction }),
            }),
      });

      const json = (await response.json()) as {
        error?: string;
        data?: {
          likeCount: number;
          likedByViewer: boolean;
          viewerReaction: string | null;
        };
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Failed to update like");
      }

      setPosts((prev) =>
        prev.map((entry) =>
          entry.id === post.id
            ? {
                ...entry,
                likeCount: json.data!.likeCount,
                likedByViewer: json.data!.likedByViewer,
                viewerReaction: json.data!.viewerReaction,
              }
            : entry,
        ),
      );
      void fetchNotifications();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update like");
    } finally {
      setLikeBusyId(null);
    }
  }

  async function loadComments(postId: string) {
    setCommentsLoadingByPost((prev) => ({
      ...prev,
      [postId]: true,
    }));

    try {
      const response = await fetch(`/api/dugout/posts/${postId}/comments`, {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        error?: string;
        data?: DugoutComment[];
      };

      if (!response.ok) {
        throw new Error(json.error || "Failed to load comments");
      }

      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: json.data ?? [],
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setCommentsLoadingByPost((prev) => ({
        ...prev,
        [postId]: false,
      }));
    }
  }

  async function toggleComments(postId: string) {
    const nextExpanded = !expandedCommentsByPost[postId];
    setExpandedCommentsByPost((prev) => ({
      ...prev,
      [postId]: nextExpanded,
    }));

    if (nextExpanded && !commentsByPost[postId]) {
      await loadComments(postId);
    }
  }

  async function submitComment(postId: string, parentId: string | null) {
    if (!currentUserId) return;

    const text = (commentInputByPost[postId] || "").trim();
    if (!text) return;

    if (text.length > MAX_COMMENT_LENGTH) {
      setError(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`);
      return;
    }

    setCommentBusyByPost((prev) => ({
      ...prev,
      [postId]: true,
    }));
    setError("");

    try {
      const response = await fetch(`/api/dugout/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          parentId,
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        data?: DugoutComment;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Failed to add reply");
      }

      const nextComment = {
        ...json.data,
        replies: [],
      } as DugoutComment;

      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: addCommentToTree(prev[postId] ?? [], nextComment),
      }));
      setCommentInputByPost((prev) => ({
        ...prev,
        [postId]: "",
      }));
      setReplyTargetByPost((prev) => ({
        ...prev,
        [postId]: null,
      }));
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentCount: post.commentCount + 1,
              }
            : post,
        ),
      );
      void fetchNotifications();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add reply");
    } finally {
      setCommentBusyByPost((prev) => ({
        ...prev,
        [postId]: false,
      }));
    }
  }

  async function deleteComment(postId: string, commentId: string) {
    setCommentDeleteBusyId(commentId);
    setError("");

    try {
      const response = await fetch(`/api/dugout/comments/${commentId}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error || "Failed to delete comment");
      }

      const result = removeCommentFromTree(
        commentsByPost[postId] ?? [],
        commentId,
      );
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: result.next,
      }));
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentCount: Math.max(
                  0,
                  post.commentCount - result.removedCount,
                ),
              }
            : post,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete comment");
    } finally {
      setCommentDeleteBusyId(null);
    }
  }

  const remaining = useMemo(() => MAX_POST_LENGTH - content.length, [content]);
  const editRemaining = useMemo(
    () => MAX_POST_LENGTH - editContent.length,
    [editContent],
  );
  const showingNotificationsView = initialView === "notifications";
  const showingScheduleView = initialView === "schedule";

  function renderComment(postId: string, comment: DugoutComment, depth = 0) {
    const canManageComment = isAdmin || comment.author.id === currentUserId;

    return (
      <div
        key={comment.id}
        className={`rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 ${
          depth > 0 ? "ml-5 mt-2" : "mt-2"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-zinc-200">
            {getDisplayName(comment.author)}
          </p>
          <p className="text-[11px] text-zinc-500">
            {formatPostTime(comment.createdAt)}
          </p>
        </div>
        <p className="whitespace-pre-wrap text-sm text-zinc-200">
          {comment.content}
        </p>
        <div className="mt-2 flex items-center gap-3">
          {currentUserId ? (
            <button
              type="button"
              onClick={() => {
                setReplyTargetByPost((prev) => ({
                  ...prev,
                  [postId]: comment,
                }));
              }}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Reply
            </button>
          ) : null}
          {canManageComment ? (
            <button
              type="button"
              onClick={() => void deleteComment(postId, comment.id)}
              disabled={commentDeleteBusyId === comment.id}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-60"
            >
              {commentDeleteBusyId === comment.id ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>

        {comment.replies.length > 0
          ? comment.replies.map((reply) =>
              renderComment(postId, reply, depth + 1),
            )
          : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0">
      {/* ── Feed fills remaining space ── */}
      {showingNotificationsView ? (
        <section className="flex-1 overflow-y-auto scrollbar-hide border border-t-0 border-zinc-800 bg-zinc-900/70 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Notifications</h3>
            <button
              type="button"
              onClick={() => void markNotificationsSeen()}
              disabled={
                notificationBusy || notifications.totalUnreadCount === 0
              }
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-60"
            >
              {notificationBusy ? "Updating..." : "Mark all as read"}
            </button>
          </div>

          <div className="space-y-3">
            <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                Unread Activity
              </p>
              <div className="mt-3 space-y-2 text-sm text-zinc-200">
                <p>
                  Likes on your posts:{" "}
                  <span className="font-semibold">
                    {notifications.unreadLikeCount}
                  </span>
                </p>
                <p>
                  Replies/comments for you:{" "}
                  <span className="font-semibold">
                    {notifications.unreadReplyCount}
                  </span>
                </p>
                <p>
                  Total unread:{" "}
                  <span className="font-semibold text-brand-gold">
                    {notifications.totalUnreadCount}
                  </span>
                </p>
              </div>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                Last Seen
              </p>
              <p className="mt-2">
                {notifications.lastSeenAt
                  ? formatPostTime(notifications.lastSeenAt)
                  : "No notification read marker yet."}
              </p>
            </article>
          </div>
        </section>
      ) : showingScheduleView ? (
        <section className="flex-1 overflow-y-auto scrollbar-hide border border-t-0 border-zinc-800 bg-zinc-900/70 p-4 md:p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Schedule</h3>
            <p className="mt-1 text-sm text-zinc-400">
              This week&apos;s Gonzales Diamond Baseball games.
            </p>
          </div>

          {initialScheduleGames.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
              No games found for this week.
            </div>
          ) : (
            <div className="space-y-3">
              {initialScheduleGames.map((game) => {
                const venueName =
                  (typeof game.subvenue === "string" ? game.subvenue : null) ||
                  game._embedded?.venue?.name ||
                  null;
                const status =
                  typeof game.status === "string" ? game.status : "Scheduled";
                const isCancelled = status.toLowerCase().includes("cancel");

                return (
                  <article
                    key={game.id}
                    className={`rounded-xl border p-4 ${isCancelled ? "border-red-900 bg-red-950/40" : "border-zinc-800 bg-zinc-950/50"}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">
                        {game.home_team || "Home Team"}{" "}
                        <span className="text-zinc-500">vs</span>{" "}
                        {game.away_team || "Away Team"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {formatScheduleTime(game)}
                      </p>
                      {game.age_group || venueName ? (
                        <p className="mt-2 text-xs text-zinc-500">
                          {[game.age_group, venueName]
                            .filter(Boolean)
                            .join(" • ")}
                        </p>
                      ) : null}
                      {isCancelled && (
                        <p className="mt-2 text-xs font-semibold text-red-400">
                          Cancelled
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="flex-1 overflow-y-auto scrollbar-hide border border-t-0 border-zinc-800 bg-zinc-900/70">
          <div
            ref={composerRef}
            className="border-b border-zinc-800 bg-zinc-900/70 px-4 py-4 sm:px-5"
          >
            <form onSubmit={createPost}>
              <div className="flex gap-3">
                <div className="mt-1 shrink-0">
                  <CoachAuthButton avatarOnly avatarSize={48} />
                </div>

                <div
                  onDrop={onDropMedia}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    ) {
                      setIsDragOver(false);
                    }
                  }}
                  className={`flex-1 rounded-[1.75rem] px-5 pt-4 transition ${
                    isDragOver
                      ? "bg-zinc-900 ring-1 ring-brand-gold/60"
                      : "bg-transparent"
                  }`}
                >
                  <textarea
                    rows={composerExpanded ? 4 : 1}
                    maxLength={MAX_POST_LENGTH}
                    placeholder="What's happening?"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    onFocus={() => setComposerExpanded(true)}
                    className={`w-full resize-none bg-transparent leading-tight text-white placeholder-zinc-500 outline-none ${
                      composerExpanded
                        ? "min-h-28 pt-1 text-2xl md:text-3xl"
                        : "min-h-10 pt-0 text-xl md:text-2xl"
                    }`}
                  />

                  {mediaPreviewUrl ? (
                    <div className="relative mb-3 overflow-hidden rounded-2xl border border-zinc-700">
                      <Image
                        src={mediaPreviewUrl}
                        alt="Selected media preview"
                        width={1200}
                        height={900}
                        unoptimized
                        className="h-auto max-h-72 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearSelectedMedia}
                        className="absolute right-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-xs text-red-300 hover:text-red-200"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : null}

                  {selectedGif ? (
                    <div className="relative mb-3 overflow-hidden rounded-2xl border border-brand-gold">
                      <Image
                        src={selectedGif.previewUrl}
                        alt={selectedGif.title}
                        width={1200}
                        height={900}
                        unoptimized
                        className="h-auto max-h-72 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearSelectedGif}
                        className="absolute right-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-xs text-red-300 hover:text-red-200"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : null}

                  {emojiPickerOpen && composerExpanded && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {EMOJI_CHOICES.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            appendEmoji(emoji);
                            setEmojiPickerOpen(false);
                          }}
                          className="rounded-full border border-zinc-700 px-2.5 py-1 text-base hover:bg-zinc-800"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {gifSearchOpen && composerExpanded && (
                    <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="flex gap-2">
                        <input
                          value={gifQuery}
                          onChange={(event) => setGifQuery(event.target.value)}
                          onKeyDown={handleGifInputKeyDown}
                          placeholder="Search GIFs"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void searchGifs()}
                          disabled={gifBusy || !gifQuery.trim()}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {gifBusy ? "..." : "Find"}
                        </button>
                      </div>
                      {gifResults.length > 0 ? (
                        <>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {gifResults.map((gif) => (
                              <button
                                key={gif.id}
                                type="button"
                                onClick={() => {
                                  clearSelectedMedia();
                                  setSelectedGif(gif);
                                  setGifSearchOpen(false);
                                }}
                                className={`overflow-hidden rounded-lg border ${
                                  selectedGif?.id === gif.id
                                    ? "border-brand-gold"
                                    : "border-zinc-800"
                                }`}
                              >
                                <Image
                                  src={gif.previewUrl}
                                  alt={gif.title}
                                  width={240}
                                  height={240}
                                  unoptimized
                                  className="h-16 w-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                          {gifHasMore ? (
                            <button
                              type="button"
                              onClick={() => void searchGifs({ append: true })}
                              disabled={gifBusy}
                              className="mt-2 w-full rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-60"
                            >
                              {gifBusy ? "Loading..." : "Load more"}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-zinc-800 py-3">
                    <div className="flex items-center gap-1 text-brand-purple">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleMediaChange}
                      />
                      <button
                        type="button"
                        title="Add photo"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-full p-2 hover:bg-zinc-800"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle cx="8.5" cy="10.5" r="1.5" />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16l5-5 4 4 3-3 4 4"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Search GIFs"
                        onClick={() => {
                          setGifSearchOpen((o) => !o);
                          setEmojiPickerOpen(false);
                        }}
                        className={`rounded-full p-2 hover:bg-zinc-800 ${gifSearchOpen ? "bg-zinc-800" : ""}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <rect x="2" y="6" width="20" height="12" rx="2" />
                          <path
                            strokeLinecap="round"
                            d="M7 12h2m0 0v2m0-2V10M13 10v4M17 10h-2v4h2M17 12h-1"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Add emoji"
                        onClick={() => {
                          setEmojiPickerOpen((o) => !o);
                          setGifSearchOpen(false);
                        }}
                        className={`rounded-full p-2 hover:bg-zinc-800 ${emojiPickerOpen ? "bg-zinc-800" : ""}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path
                            strokeLinecap="round"
                            d="M8.5 14.5s1 1.5 3.5 1.5 3.5-1.5 3.5-1.5"
                          />
                          <circle
                            cx="9"
                            cy="10"
                            r="1"
                            fill="currentColor"
                            stroke="none"
                          />
                          <circle
                            cx="15"
                            cy="10"
                            r="1"
                            fill="currentColor"
                            stroke="none"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={
                          busy ||
                          (!content.trim() && !mediaFile && !selectedGif)
                        }
                        className="rounded-full bg-brand-purple px-5 py-1.5 text-sm font-bold hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? "Posting..." : "Post"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {error ? (
            <p className="mx-4 mt-4 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300 sm:mx-5">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mx-4 mt-4 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300 sm:mx-5">
              {notice}
            </p>
          ) : null}

          {posts.length === 0 ? (
            <div className="border-b border-zinc-800 bg-zinc-950/50 px-5 py-5 text-sm text-zinc-400">
              No updates yet. Be the first coach to post in The Dugout.
            </div>
          ) : (
            <div>
              {posts.map((post) => {
                const canManage = isAdmin || post.author.id === currentUserId;
                const isEditing = editingId === post.id;
                const canLike = Boolean(currentUserId);
                const comments = commentsByPost[post.id] ?? [];
                const commentsExpanded = Boolean(
                  expandedCommentsByPost[post.id],
                );
                const replyTarget = replyTargetByPost[post.id];
                const commentInput = commentInputByPost[post.id] ?? "";

                return (
                  <article
                    key={post.id}
                    className="border-b border-zinc-800 bg-zinc-950/30 px-5 py-4"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
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
                              type="button"
                              onClick={() => startEdit(post)}
                              className="text-xs text-zinc-400 transition hover:text-zinc-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deletePost(post.id)}
                              className="text-xs text-red-400 transition hover:text-red-300"
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
                          maxLength={MAX_POST_LENGTH}
                          value={editContent}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                          className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          {EMOJI_CHOICES.map((emoji) => (
                            <button
                              key={`${post.id}-${emoji}`}
                              type="button"
                              onClick={() => appendEmoji(emoji, true)}
                              className="rounded-full border border-zinc-700 px-2.5 py-1 text-sm hover:bg-zinc-800"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        {post.mediaUrl && !editRemoveMedia ? (
                          <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/70">
                            <Image
                              src={post.mediaUrl}
                              alt="Attached media"
                              width={1200}
                              height={900}
                              unoptimized
                              className="h-auto max-h-48 w-full object-cover"
                            />
                            <div className="flex items-center justify-between px-3 py-2">
                              <p className="text-xs text-zinc-400">
                                Attached media
                              </p>
                              <button
                                type="button"
                                onClick={() => setEditRemoveMedia(true)}
                                className="text-xs text-red-300 hover:text-red-200"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : editRemoveMedia && post.mediaUrl ? (
                          <div className="flex items-center justify-between rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2">
                            <p className="text-xs text-red-300">
                              Media will be removed on save
                            </p>
                            <button
                              type="button"
                              onClick={() => setEditRemoveMedia(false)}
                              className="text-xs text-zinc-400 hover:text-zinc-200"
                            >
                              Undo
                            </button>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-end gap-2">
                          <p className="mr-auto text-xs text-zinc-500">
                            {editRemaining} left
                          </p>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={editBusy || !editContent.trim()}
                            onClick={() => void saveEdit(post.id)}
                            className="rounded-lg bg-brand-purple px-3 py-1.5 text-xs font-semibold hover:bg-brand-purple-dark disabled:opacity-60"
                          >
                            {editBusy ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {post.content ? (
                          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                            {post.content}
                          </p>
                        ) : null}
                        <DugoutMedia
                          post={post}
                          alt={post.content || "Dugout media"}
                        />
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {/* Reaction picker */}
                          <div
                            className="relative"
                            ref={
                              likePickerOpenId === post.id
                                ? likePickerRef
                                : null
                            }
                          >
                            {/* Trigger button */}
                            <button
                              type="button"
                              disabled={!canLike || likeBusyId === post.id}
                              onClick={() =>
                                setLikePickerOpenId((prev) =>
                                  prev === post.id ? null : post.id,
                                )
                              }
                              className={`rounded-full border px-3 py-1 text-sm font-semibold transition disabled:opacity-50 ${
                                post.likedByViewer
                                  ? "border-brand-gold text-brand-gold hover:bg-brand-gold/10"
                                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                              }`}
                              title={
                                post.likedByViewer ? "Change reaction" : "React"
                              }
                            >
                              {post.likedByViewer && post.viewerReaction
                                ? post.viewerReaction
                                : "👍"}
                            </button>

                            {/* Popout picker */}
                            {likePickerOpenId === post.id && (
                              <div className="absolute bottom-full left-0 z-20 mb-2 flex gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 shadow-xl">
                                {["👍", ...EMOJI_CHOICES].map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    disabled={likeBusyId === post.id}
                                    onClick={() => void toggleLike(post, emoji)}
                                    className={`rounded-full p-1 text-lg transition hover:scale-125 hover:bg-zinc-700 disabled:opacity-50 ${
                                      post.likedByViewer &&
                                      post.viewerReaction === emoji
                                        ? "bg-zinc-700 ring-1 ring-brand-gold"
                                        : ""
                                    }`}
                                    title={emoji}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-zinc-500">
                            {post.likeCount}{" "}
                            {post.likeCount === 1 ? "like" : "likes"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void toggleComments(post.id)}
                            className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                          >
                            {commentsExpanded ? "Hide" : "Show"} replies (
                            {post.commentCount})
                          </button>
                        </div>

                        {commentsExpanded ? (
                          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                            {replyTarget ? (
                              <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-300">
                                <span>
                                  Replying to{" "}
                                  {getDisplayName(replyTarget.author)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyTargetByPost((prev) => ({
                                      ...prev,
                                      [post.id]: null,
                                    }))
                                  }
                                  className="text-red-300 hover:text-red-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : null}

                            <div className="flex gap-2">
                              <textarea
                                rows={2}
                                maxLength={MAX_COMMENT_LENGTH}
                                value={commentInput}
                                onChange={(event) =>
                                  setCommentInputByPost((prev) => ({
                                    ...prev,
                                    [post.id]: event.target.value,
                                  }))
                                }
                                placeholder={
                                  currentUserId
                                    ? "Write a comment or reply..."
                                    : "Sign in as a coach to reply"
                                }
                                disabled={!currentUserId}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs"
                              />
                              <button
                                type="button"
                                disabled={
                                  !currentUserId ||
                                  !commentInput.trim() ||
                                  commentBusyByPost[post.id]
                                }
                                onClick={() =>
                                  void submitComment(
                                    post.id,
                                    replyTarget?.id ?? null,
                                  )
                                }
                                className="h-fit rounded-lg bg-brand-purple px-3 py-2 text-xs font-semibold hover:bg-brand-purple-dark disabled:opacity-60"
                              >
                                {commentBusyByPost[post.id]
                                  ? "Sending..."
                                  : "Send"}
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              {MAX_COMMENT_LENGTH - commentInput.length}{" "}
                              characters left
                            </p>

                            {commentsLoadingByPost[post.id] ? (
                              <p className="mt-3 text-xs text-zinc-400">
                                Loading replies...
                              </p>
                            ) : comments.length === 0 ? (
                              <p className="mt-3 text-xs text-zinc-500">
                                No replies yet.
                              </p>
                            ) : (
                              <div className="mt-2">
                                {comments.map((comment) =>
                                  renderComment(post.id, comment),
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
