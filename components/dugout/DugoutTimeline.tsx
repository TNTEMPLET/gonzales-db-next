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
import StandingsTabs from "@/components/standings/StandingsTabs";
import type { AgeGroupStandings } from "@/lib/standings";
import { MAX_COMMENT_LENGTH, MAX_POST_LENGTH } from "@/lib/dugout/constants";

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
  threadId: string | null;
  threadOrder: number | null;
  isPinned: boolean;
  pinnedAt: string | null;
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
  initialStandings?: AgeGroupStandings[];
  leagueName?: string;
  orgId?: string;
  isAdmin?: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  currentUserAvatarUrl?: string | null;
  initialView?: "timeline" | "notifications" | "schedule";
  initialFocusPostId?: string | null;
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
  items: DugoutNotificationItem[];
};

type DugoutNotificationItem = {
  id: string;
  type: "LIKE" | "COMMENT" | "REPLY";
  createdAt: string;
  isUnread: boolean;
  actor: DugoutAuthor;
  postId: string;
  postPreview: string;
  commentPreview: string | null;
  reaction: string | null;
};

type ThreadComposerEntry = {
  id: string;
  content: string;
};

type ComposerTarget =
  | { type: "main" }
  | { type: "thread"; id: string }
  | { type: "comment"; postId: string }
  | { type: "edit" };

const EMOJI_CHOICES = ["⚾", "🔥", "👏", "🎉", "💪", "🙌"];

function createThreadComposerEntry(): ThreadComposerEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    content: "",
  };
}

function CharacterMeter({
  current,
  max,
  standard,
}: {
  current: number;
  max: number;
  standard?: number;
}) {
  const isExtended = standard !== undefined && current > standard;
  // Phase 1: filling toward standard limit
  // Phase 2: filling toward max once standard is exceeded
  const phase1Limit = standard ?? max;
  const radius = 10;
  const circumference = 2 * Math.PI * radius;

  let progress: number;
  let remaining: number;
  let showNumber: boolean;
  let accentClass: string;

  if (!isExtended) {
    remaining = Math.max(0, phase1Limit - current);
    progress = Math.min(current / phase1Limit, 1);
    showNumber = remaining <= 20;
    accentClass = remaining <= 20 ? "text-red-400" : "text-violet-400";
  } else {
    remaining = Math.max(0, max - current);
    progress = Math.min(current / max, 1);
    showNumber = true;
    accentClass = remaining <= 20 ? "text-red-400" : "text-amber-400";
  }

  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="flex items-center gap-2">
      {showNumber ? (
        <span className={`text-xs font-medium tabular-nums ${accentClass}`}>
          {remaining}
        </span>
      ) : null}
      <div className="relative h-6 w-6">
        <svg
          className="h-6 w-6 -rotate-90"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-zinc-800"
          />
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={accentClass}
          />
        </svg>
      </div>
    </div>
  );
}

function getDisplayName(author: DugoutAuthor) {
  if (author.firstName || author.lastName) {
    return [author.firstName, author.lastName].filter(Boolean).join(" ");
  }

  return author.name || author.email;
}

function renderFormattedText(content: string) {
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    // Split by formatting markers and @mentions
    const parts = line
      .split(/(@Admins|\*\*[^*]+\*\*|\*[^*]+\*)/g)
      .filter(Boolean);

    return (
      <span key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          const key = `${lineIndex}-${partIndex}`;

          if (part === "@Admins") {
            return (
              <span
                key={key}
                className="inline-block rounded bg-violet-500/20 px-1.5 py-0.5 font-semibold text-violet-400"
              >
                {part}
              </span>
            );
          }

          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={key}>{part.slice(2, -2)}</strong>;
          }

          if (part.startsWith("*") && part.endsWith("*")) {
            return <em key={key}>{part.slice(1, -1)}</em>;
          }

          return <span key={key}>{part}</span>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

function formatPostTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const then = new Date(value).getTime();
  const now = Date.now();
  const diffSeconds = Math.max(1, Math.floor((now - then) / 1000));

  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return formatPostTime(value);
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

function formatScheduleDayLabel(game: Game) {
  if (game.start_time) {
    return new Date(game.start_time).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  return typeof game.localized_date === "string"
    ? game.localized_date
    : "Date TBD";
}

function getScheduleDaySortValue(game: Game) {
  if (game.start_time) {
    return new Date(game.start_time).getTime();
  }

  if (typeof game.localized_date === "string") {
    const parsed = new Date(game.localized_date).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Number.MAX_SAFE_INTEGER;
}

function getParkLabel(game: Game) {
  return typeof game._embedded?.venue?.name === "string" &&
    game._embedded.venue.name.trim()
    ? game._embedded.venue.name.trim()
    : "Other Parks";
}

function getFieldLabel(game: Game) {
  return typeof game.subvenue === "string" && game.subvenue.trim()
    ? game.subvenue.trim()
    : "Other Fields";
}

function getGameTimeSortValue(game: Game) {
  if (game.start_time) {
    return new Date(game.start_time).getTime();
  }

  return Number.MAX_SAFE_INTEGER;
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
  initialStandings = [],
  leagueName = "the league",
  orgId,
  isAdmin = false,
  currentUserId = null,
  currentUserName = null,
  currentUserAvatarUrl = null,
  initialView = "timeline",
  initialFocusPostId = null,
}: DugoutTimelineProps) {
  const orgParam = orgId ? `?org=${encodeURIComponent(orgId)}` : "";
  const [posts, setPosts] = useState<DugoutPost[]>(initialPosts);
  const [content, setContent] = useState("");
  const [threadEntries, setThreadEntries] = useState<ThreadComposerEntry[]>([]);
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
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);
  const [activeComposerTarget, setActiveComposerTarget] =
    useState<ComposerTarget>({
      type: "main",
    });
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [likePickerOpenId, setLikePickerOpenId] = useState<string | null>(null);
  const likePickerRef = useRef<HTMLDivElement | null>(null);
  const postCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(
    initialFocusPostId,
  );
  const [expandedPostContentById, setExpandedPostContentById] = useState<
    Record<string, boolean>
  >({});
  const [overflowingPostContentById, setOverflowingPostContentById] = useState<
    Record<string, boolean>
  >({});
  const postContentRefs = useRef<Record<string, HTMLParagraphElement | null>>(
    {},
  );

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
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [notifications, setNotifications] = useState<DugoutNotificationCounts>({
    unreadLikeCount: 0,
    unreadReplyCount: 0,
    totalUnreadCount: 0,
    lastSeenAt: null,
    items: [],
  });
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [gifSearchOpen, setGifSearchOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const mainComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>(
    {},
  );
  const commentTextareaRefs = useRef<
    Record<string, HTMLTextAreaElement | null>
  >({});
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

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
    if (editing || activeComposerTarget.type === "edit") {
      setEditContent((prev) => `${prev}${emoji}`);
      return;
    }

    if (activeComposerTarget.type === "thread") {
      updateThreadEntry(
        activeComposerTarget.id,
        `${threadEntries.find((entry) => entry.id === activeComposerTarget.id)?.content || ""}${emoji}`,
      );
      return;
    }

    setContent((prev) => `${prev}${emoji}`);
  }

  function updateThreadEntry(id: string, nextContent: string) {
    setThreadEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, content: nextContent } : entry,
      ),
    );
  }

  function updateCommentInput(postId: string, nextContent: string) {
    setCommentInputByPost((prev) => ({
      ...prev,
      [postId]: nextContent,
    }));
  }

  function addThreadEntry() {
    const nextEntry = createThreadComposerEntry();
    setComposerExpanded(true);
    setThreadEntries((prev) => [...prev, nextEntry]);
    setActiveComposerTarget({ type: "thread", id: nextEntry.id });
    requestAnimationFrame(() => {
      threadTextareaRefs.current[nextEntry.id]?.focus();
    });
  }

  function removeThreadEntry(id: string) {
    setThreadEntries((prev) => prev.filter((entry) => entry.id !== id));
    delete threadTextareaRefs.current[id];
    setActiveComposerTarget((prev) =>
      prev.type === "thread" && prev.id === id ? { type: "main" } : prev,
    );
  }

  function applyInlineFormat(marker: "**" | "*") {
    const target = (() => {
      if (activeComposerTarget.type === "edit") {
        return {
          element: editTextareaRef.current,
          value: editContent,
          setValue: setEditContent,
        };
      }

      if (activeComposerTarget.type === "thread") {
        const entry = threadEntries.find(
          (threadEntry) => threadEntry.id === activeComposerTarget.id,
        );

        return {
          element: threadTextareaRefs.current[activeComposerTarget.id],
          value: entry?.content ?? "",
          setValue: (nextValue: string) =>
            updateThreadEntry(activeComposerTarget.id, nextValue),
        };
      }

      if (activeComposerTarget.type === "comment") {
        return {
          element: commentTextareaRefs.current[activeComposerTarget.postId],
          value: commentInputByPost[activeComposerTarget.postId] ?? "",
          setValue: (nextValue: string) =>
            updateCommentInput(activeComposerTarget.postId, nextValue),
        };
      }

      return {
        element: mainComposerTextareaRef.current,
        value: content,
        setValue: setContent,
      };
    })();

    if (!target.element) return;

    const start = target.element.selectionStart ?? target.value.length;
    const end = target.element.selectionEnd ?? target.value.length;
    const selectedText = target.value.slice(start, end);
    const insertion = selectedText
      ? `${marker}${selectedText}${marker}`
      : `${marker}${marker}`;
    const nextValue =
      target.value.slice(0, start) + insertion + target.value.slice(end);

    target.setValue(nextValue);

    requestAnimationFrame(() => {
      target.element?.focus();
      const selectionStart = start + marker.length;
      const selectionEnd = selectedText
        ? selectionStart + selectedText.length
        : selectionStart;
      target.element?.setSelectionRange(selectionStart, selectionEnd);
    });
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
      const response = await fetch("/api/dugout/notifications" + orgParam, {});
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
      const response = await fetch("/api/dugout/notifications" + orgParam, {
        method: "POST",
      });
      if (response.ok) {
        setNotifications((prev) => ({
          ...prev,
          unreadLikeCount: 0,
          unreadReplyCount: 0,
          totalUnreadCount: 0,
          lastSeenAt: new Date().toISOString(),
          items: prev.items.map((item) => ({ ...item, isUnread: false })),
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

  useEffect(() => {
    if (
      initialView !== "timeline" ||
      !initialFocusPostId ||
      !posts.some((post) => post.id === initialFocusPostId)
    ) {
      return;
    }

    setHighlightedPostId(initialFocusPostId);
    setExpandedCommentsByPost((prev) => ({
      ...prev,
      [initialFocusPostId]: true,
    }));

    if (
      !commentsByPost[initialFocusPostId] &&
      !commentsLoadingByPost[initialFocusPostId]
    ) {
      void loadComments(initialFocusPostId);
    }

    requestAnimationFrame(() => {
      postCardRefs.current[initialFocusPostId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    const timerId = window.setTimeout(() => {
      setHighlightedPostId((prev) =>
        prev === initialFocusPostId ? null : prev,
      );
    }, 3500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    commentsByPost,
    commentsLoadingByPost,
    initialFocusPostId,
    initialView,
    posts,
  ]);

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

    const hasThreadContent = threadEntries.some((entry) =>
      entry.content.trim(),
    );

    function handleOutside(event: MouseEvent) {
      if (
        composerRef.current &&
        !composerRef.current.contains(event.target as Node) &&
        !content.trim() &&
        !hasThreadContent &&
        threadEntries.length === 0 &&
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
  }, [composerExpanded, content, mediaFile, selectedGif, threadEntries]);

  useEffect(() => {
    function measurePostOverflow() {
      const nextOverflow: Record<string, boolean> = {};

      posts.forEach((post) => {
        const element = postContentRefs.current[post.id];
        if (!element || !post.content) {
          nextOverflow[post.id] = false;
          return;
        }

        nextOverflow[post.id] = element.scrollHeight - element.clientHeight > 1;
      });

      setOverflowingPostContentById((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(nextOverflow);

        if (prevKeys.length !== nextKeys.length) {
          return nextOverflow;
        }

        for (const key of nextKeys) {
          if (prev[key] !== nextOverflow[key]) {
            return nextOverflow;
          }
        }

        return prev;
      });
    }

    measurePostOverflow();
    window.addEventListener("resize", measurePostOverflow);

    return () => window.removeEventListener("resize", measurePostOverflow);
  }, [posts, expandedPostContentById]);

  const postGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        sortValue: number;
        pinnedAtValue: number;
        isPinned: boolean;
        posts: DugoutPost[];
      }
    >();

    posts.forEach((post) => {
      const groupKey = post.threadId
        ? `thread:${post.threadId}`
        : `post:${post.id}`;
      const createdAtValue = new Date(post.createdAt).getTime();

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          sortValue: createdAtValue,
          pinnedAtValue: post.pinnedAt ? new Date(post.pinnedAt).getTime() : 0,
          isPinned: post.isPinned,
          posts: [],
        });
      }

      const group = groups.get(groupKey)!;
      group.posts.push(post);
      group.sortValue = Math.max(group.sortValue, createdAtValue);
      group.pinnedAtValue = Math.max(
        group.pinnedAtValue,
        post.pinnedAt ? new Date(post.pinnedAt).getTime() : 0,
      );
      group.isPinned = group.isPinned || post.isPinned;
    });

    return Array.from(groups.values())
      .sort((leftGroup, rightGroup) => {
        if (leftGroup.isPinned !== rightGroup.isPinned) {
          return leftGroup.isPinned ? -1 : 1;
        }

        if (leftGroup.pinnedAtValue !== rightGroup.pinnedAtValue) {
          return rightGroup.pinnedAtValue - leftGroup.pinnedAtValue;
        }

        return rightGroup.sortValue - leftGroup.sortValue;
      })
      .map((group) => ({
        ...group,
        posts: [...group.posts].sort((leftPost, rightPost) => {
          if (
            leftPost.threadOrder !== null &&
            rightPost.threadOrder !== null &&
            leftPost.threadId &&
            rightPost.threadId &&
            leftPost.threadId === rightPost.threadId
          ) {
            return leftPost.threadOrder - rightPost.threadOrder;
          }

          return (
            new Date(rightPost.createdAt).getTime() -
            new Date(leftPost.createdAt).getTime()
          );
        }),
      }));
  }, [posts]);

  const pinnedPostGroups = useMemo(
    () => postGroups.filter((group) => group.isPinned),
    [postGroups],
  );

  const regularPostGroups = useMemo(
    () => postGroups.filter((group) => !group.isPinned),
    [postGroups],
  );

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    const preparedThreadEntries = threadEntries.map((entry) => ({
      ...entry,
      trimmed: entry.content.trim(),
    }));
    const hasThreadEntries = preparedThreadEntries.length > 0;

    if (!trimmed && !mediaFile && !selectedGif && !hasThreadEntries) return;

    if (trimmed.length > MAX_POST_LENGTH) {
      setError(`Post must be ${MAX_POST_LENGTH} characters or fewer`);
      return;
    }

    if (hasThreadEntries && !trimmed && !mediaFile && !selectedGif) {
      setError("The first thread post needs content or media");
      return;
    }

    const invalidThreadEntry = preparedThreadEntries.find(
      (entry) => !entry.trimmed || entry.trimmed.length > MAX_POST_LENGTH,
    );

    if (invalidThreadEntry) {
      setError(
        !invalidThreadEntry.trimmed
          ? "Each thread post needs content"
          : `Each thread post must be ${MAX_POST_LENGTH} characters or fewer`,
      );
      return;
    }

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

      const segments = [
        {
          content: trimmed,
          mediaUrl: attachedMedia?.mediaUrl,
          mediaType: attachedMedia?.mediaType,
        },
        ...preparedThreadEntries.map((entry) => ({
          content: entry.trimmed,
          mediaUrl: null,
          mediaType: null,
        })),
      ];

      const totalSegments = segments.length;
      const threadId =
        totalSegments > 1
          ? (globalThis.crypto?.randomUUID?.() ??
            createThreadComposerEntry().id)
          : null;
      const numberedSegments = segments.map((segment, index) => ({
        ...segment,
        threadId,
        threadOrder: totalSegments > 1 ? index : null,
        content:
          totalSegments > 1
            ? `${index + 1}/${totalSegments}${segment.content ? ` ${segment.content}` : ""}`
            : segment.content,
      }));

      const createdPosts: DugoutPost[] = [];

      for (const segment of [...numberedSegments].reverse()) {
        const response = await fetch("/api/dugout/posts" + orgParam, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: segment.content,
            mediaUrl: segment.mediaUrl,
            mediaType: segment.mediaType,
            threadId: segment.threadId,
            threadOrder: segment.threadOrder,
          }),
        });

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || "Failed to post update");
        }

        createdPosts.push(json.data as DugoutPost);
      }

      setContent("");
      setThreadEntries([]);
      clearSelectedMedia();
      clearSelectedGif();
      setGifQuery("");
      setGifResults([]);
      setGifOffset(0);
      setGifHasMore(false);
      setActiveGifQuery("");
      setComposerExpanded(false);
      setPosts((prev) => [...createdPosts.reverse(), ...prev]);
      setNotice(totalSegments > 1 ? "Thread posted" : "Update posted");
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
    setActiveComposerTarget({ type: "edit" });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
    setEditRemoveMedia(false);
    setActiveComposerTarget({ type: "main" });
  }

  async function saveEdit(id: string) {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_POST_LENGTH) {
      setError(`Post must be ${MAX_POST_LENGTH} characters or fewer`);
      return;
    }

    setEditBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/dugout/posts/${id}${orgParam}`, {
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
      setActiveComposerTarget({ type: "main" });
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
      const response = await fetch(`/api/dugout/posts/${id}${orgParam}`, {
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

  async function togglePin(post: DugoutPost, scope: "post" | "thread") {
    if (!isAdmin) return;

    const nextPinned = !post.isPinned;
    const busyKey = `${scope}:${post.id}`;
    setPinBusyKey(busyKey);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/dugout/posts/${post.id}${orgParam}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPinned: nextPinned,
          pinScope: scope,
        }),
      });

      const json = (await response.json()) as {
        error?: string;
        data?: DugoutPost;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Failed to update pin state");
      }

      setPosts((prev) =>
        prev.map((entry) => {
          if (scope === "thread" && post.threadId) {
            return entry.threadId === post.threadId
              ? {
                  ...entry,
                  isPinned: json.data!.isPinned,
                  pinnedAt: json.data!.pinnedAt,
                }
              : entry;
          }

          return entry.id === post.id
            ? {
                ...entry,
                isPinned: json.data!.isPinned,
                pinnedAt: json.data!.pinnedAt,
              }
            : entry;
        }),
      );

      if (scope === "thread" && post.threadId) {
        setNotice(nextPinned ? "Thread pinned" : "Thread unpinned");
      } else {
        setNotice(nextPinned ? "Post pinned" : "Post unpinned");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update pin state",
      );
    } finally {
      setPinBusyKey(null);
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
      const response = await fetch(
        `/api/dugout/posts/${post.id}/like${orgParam}`,
        {
          method: isUnlike ? "DELETE" : "POST",
          ...(isUnlike
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reaction }),
              }),
        },
      );

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
      const response = await fetch(
        `/api/dugout/posts/${postId}/comments${orgParam}`,
        {
          cache: "no-store",
        },
      );
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
      const response = await fetch(
        `/api/dugout/posts/${postId}/comments${orgParam}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            parentId,
          }),
        },
      );

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

  const showingNotificationsView = initialView === "notifications";
  const showingScheduleView = initialView === "schedule";
  const groupedScheduleGames = useMemo(() => {
    const sortedGames = [...initialScheduleGames].sort(
      (leftGame, rightGame) => {
        const dayDifference =
          getScheduleDaySortValue(leftGame) -
          getScheduleDaySortValue(rightGame);
        if (dayDifference !== 0) return dayDifference;

        const parkDifference = getParkLabel(leftGame).localeCompare(
          getParkLabel(rightGame),
        );
        if (parkDifference !== 0) return parkDifference;

        const fieldDifference = getFieldLabel(leftGame).localeCompare(
          getFieldLabel(rightGame),
        );
        if (fieldDifference !== 0) return fieldDifference;

        const timeDifference =
          getGameTimeSortValue(leftGame) - getGameTimeSortValue(rightGame);
        if (timeDifference !== 0) return timeDifference;

        const leftName = `${leftGame.home_team || "Home Team"} vs ${leftGame.away_team || "Away Team"}`;
        const rightName = `${rightGame.home_team || "Home Team"} vs ${rightGame.away_team || "Away Team"}`;
        return leftName.localeCompare(rightName);
      },
    );

    return sortedGames.reduce<
      Array<{
        dayLabel: string;
        parks: Array<{
          parkLabel: string;
          fields: Array<{
            fieldLabel: string;
            games: Game[];
          }>;
        }>;
      }>
    >((groups, game) => {
      const dayLabel = formatScheduleDayLabel(game);
      const parkLabel = getParkLabel(game);
      const fieldLabel = getFieldLabel(game);

      let dayGroup = groups.find((group) => group.dayLabel === dayLabel);
      if (!dayGroup) {
        dayGroup = { dayLabel, parks: [] };
        groups.push(dayGroup);
      }

      let parkGroup = dayGroup.parks.find(
        (group) => group.parkLabel === parkLabel,
      );
      if (!parkGroup) {
        parkGroup = { parkLabel, fields: [] };
        dayGroup.parks.push(parkGroup);
      }

      let fieldGroup = parkGroup.fields.find(
        (group) => group.fieldLabel === fieldLabel,
      );
      if (!fieldGroup) {
        fieldGroup = { fieldLabel, games: [] };
        parkGroup.fields.push(fieldGroup);
      }

      fieldGroup.games.push(game);

      return groups;
    }, []);
  }, [initialScheduleGames]);

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
        <p className="whitespace-pre-wrap wrap-anywhere text-sm text-zinc-200">
          {renderFormattedText(comment.content)}
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

  function renderPostBody(
    post: DugoutPost,
    {
      canManage,
      isEditing,
      canLike,
      comments,
      postExpanded,
      longPost,
      commentsExpanded,
      replyTarget,
      commentInput,
      isThreadGroup,
      isThreadLead,
    }: {
      canManage: boolean;
      isEditing: boolean;
      canLike: boolean;
      comments: DugoutComment[];
      postExpanded: boolean;
      longPost: boolean;
      commentsExpanded: boolean;
      replyTarget: DugoutComment | null | undefined;
      commentInput: string;
      isThreadGroup: boolean;
      isThreadLead: boolean;
    },
  ) {
    return (
      <>
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold leading-5 text-zinc-100">
              {getDisplayName(post.author)}
            </p>
            {isAdmin && post.isPinned ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 12l1 7-5-3-5 3 1-7-4-4h7l1-4 1 4h7z"
                  />
                </svg>
                Pinned
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      disabled={pinBusyKey === `post:${post.id}`}
                      onClick={() => void togglePin(post, "post")}
                      className="text-xs text-violet-400 transition hover:text-violet-300 disabled:opacity-60"
                    >
                      {pinBusyKey === `post:${post.id}`
                        ? "..."
                        : post.isPinned
                          ? "Unpin Post"
                          : "Pin Post"}
                    </button>
                    {isThreadGroup && isThreadLead ? (
                      <button
                        type="button"
                        disabled={pinBusyKey === `thread:${post.id}`}
                        onClick={() => void togglePin(post, "thread")}
                        className="text-xs text-violet-400 transition hover:text-violet-300 disabled:opacity-60"
                      >
                        {pinBusyKey === `thread:${post.id}`
                          ? "..."
                          : post.isPinned
                            ? "Unpin Thread"
                            : "Pin Thread"}
                      </button>
                    ) : null}
                  </>
                ) : null}
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
              ref={editTextareaRef}
              rows={4}
              maxLength={MAX_POST_LENGTH}
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              onFocus={() => setActiveComposerTarget({ type: "edit" })}
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
                  <p className="text-xs text-zinc-400">Attached media</p>
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
                className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-violet-400 disabled:opacity-60 disabled:text-zinc-700"
              >
                {editBusy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.content ? (
              <div>
                <p
                  ref={(element) => {
                    postContentRefs.current[post.id] = element;
                  }}
                  className={`whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-zinc-200 ${
                    postExpanded ? "" : "line-clamp-4"
                  }`}
                >
                  {renderFormattedText(post.content)}
                </p>
                {longPost ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPostContentById((prev) => ({
                        ...prev,
                        [post.id]: !postExpanded,
                      }))
                    }
                    className="mt-2 text-sm font-semibold text-violet-400 transition hover:text-violet-300"
                  >
                    {postExpanded ? "Show less" : "+More"}
                  </button>
                ) : null}
              </div>
            ) : null}
            <DugoutMedia post={post} alt={post.content || "Dugout media"} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div
                className="relative"
                ref={likePickerOpenId === post.id ? likePickerRef : null}
              >
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
                      ? "border-brand-gold text-violet-400 hover:bg-violet-500/10"
                      : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                  title={post.likedByViewer ? "Change reaction" : "React"}
                >
                  {post.likedByViewer && post.viewerReaction
                    ? post.viewerReaction
                    : "👍"}
                </button>

                {likePickerOpenId === post.id ? (
                  <div className="absolute bottom-full left-0 z-20 mb-2 flex gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 shadow-xl">
                    {["👍", ...EMOJI_CHOICES].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        disabled={likeBusyId === post.id}
                        onClick={() => void toggleLike(post, emoji)}
                        className={`rounded-full p-1 text-lg transition hover:scale-125 hover:bg-zinc-700 disabled:opacity-50 ${
                          post.likedByViewer && post.viewerReaction === emoji
                            ? "bg-zinc-700 ring-1 ring-brand-gold"
                            : ""
                        }`}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="text-xs text-zinc-500">
                {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
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
                      Replying to {getDisplayName(replyTarget.author)}
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

                <div className="mb-2 flex items-center gap-2 text-violet-400">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveComposerTarget({
                        type: "comment",
                        postId: post.id,
                      });
                      applyInlineFormat("**");
                    }}
                    className="rounded-full px-2.5 py-1 text-sm font-bold hover:bg-zinc-800"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveComposerTarget({
                        type: "comment",
                        postId: post.id,
                      });
                      applyInlineFormat("*");
                    }}
                    className="rounded-full px-2.5 py-1 text-sm italic hover:bg-zinc-800"
                  >
                    I
                  </button>
                </div>

                <div className="flex gap-2">
                  <textarea
                    ref={(element) => {
                      commentTextareaRefs.current[post.id] = element;
                    }}
                    rows={2}
                    maxLength={MAX_COMMENT_LENGTH}
                    value={commentInput}
                    onChange={(event) =>
                      updateCommentInput(post.id, event.target.value)
                    }
                    onFocus={() =>
                      setActiveComposerTarget({
                        type: "comment",
                        postId: post.id,
                      })
                    }
                    placeholder={
                      currentUserId
                        ? "Write a comment or reply..."
                        : "Sign in as a coach to reply"
                    }
                    disabled={!currentUserId}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs"
                  />
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {(commentInput.length > 0 ||
                      (activeComposerTarget.type === "comment" &&
                        activeComposerTarget.postId === post.id)) && (
                      <CharacterMeter
                        current={commentInput.length}
                        max={MAX_COMMENT_LENGTH}
                      />
                    )}
                    <button
                      type="button"
                      disabled={
                        !currentUserId ||
                        !commentInput.trim() ||
                        commentBusyByPost[post.id]
                      }
                      onClick={() =>
                        void submitComment(post.id, replyTarget?.id ?? null)
                      }
                      className="h-fit rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-violet-400 disabled:opacity-60 disabled:text-zinc-700"
                    >
                      {commentBusyByPost[post.id] ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>

                {commentsLoadingByPost[post.id] ? (
                  <p className="mt-3 text-xs text-zinc-400">
                    Loading replies...
                  </p>
                ) : comments.length === 0 ? (
                  <p className="mt-3 text-xs text-zinc-500">No replies yet.</p>
                ) : (
                  <div className="mt-2">
                    {comments.map((comment) => renderComment(post.id, comment))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </>
    );
  }

  function renderTimelinePost(
    post: DugoutPost,
    options: { threadIndex: number; threadSize: number },
  ) {
    const canManage = isAdmin || post.author.id === currentUserId;
    const isEditing = editingId === post.id;
    const canLike = Boolean(currentUserId);
    const comments = commentsByPost[post.id] ?? [];
    const postExpanded = Boolean(expandedPostContentById[post.id]);
    const longPost = Boolean(overflowingPostContentById[post.id]);
    const commentsExpanded = Boolean(expandedCommentsByPost[post.id]);
    const replyTarget = replyTargetByPost[post.id];
    const commentInput = commentInputByPost[post.id] ?? "";
    const isThreadGroup = options.threadSize > 1;
    const isLast = options.threadIndex === options.threadSize - 1;

    const bodyProps = {
      canManage,
      isEditing,
      canLike,
      comments,
      postExpanded,
      longPost,
      commentsExpanded,
      replyTarget,
      commentInput,
      isThreadGroup,
      isThreadLead: options.threadIndex === 0,
    };

    // ── Twitter-style thread layout ──────────────────────────────────────────
    if (isThreadGroup) {
      const initial = getDisplayName(post.author)
        .trim()
        .charAt(0)
        .toUpperCase();

      return (
        <article
          key={post.id}
          ref={(element) => {
            postCardRefs.current[post.id] = element;
          }}
          className={`flex gap-0 transition ${
            highlightedPostId === post.id
              ? "bg-violet-500/10 ring-1 ring-brand-gold/50"
              : ""
          }`}
        >
          {/* Left column: avatar + connector line */}
          <div className="flex w-10 shrink-0 flex-col items-center pt-3">
            {/* Avatar circle */}
            <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-purple text-xs font-bold text-white ring-2 ring-zinc-950">
              {initial}
            </div>
            {/* Connector line — grows to fill remaining height, hidden on last post */}
            {!isLast ? (
              <div className="mt-1 w-0.5 flex-1 bg-zinc-700/60" />
            ) : null}
          </div>

          {/* Right column: header badge (first post only) + body */}
          <div className="min-w-0 flex-1 pb-4 pl-3 pt-3">
            {options.threadIndex === 0 ? (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand-gold/40 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-violet-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h7"
                  />
                </svg>
                Thread · {options.threadSize} posts
              </div>
            ) : null}
            {renderPostBody(post, bodyProps)}
          </div>
        </article>
      );
    }

    // ── Standard single-post layout ──────────────────────────────────────────
    return (
      <article
        key={post.id}
        ref={(element) => {
          postCardRefs.current[post.id] = element;
        }}
        className={`border-b border-zinc-800 bg-zinc-950/30 px-5 py-4 transition ${
          highlightedPostId === post.id
            ? "bg-violet-500/10 ring-1 ring-brand-gold/50"
            : ""
        }`}
      >
        {renderPostBody(post, bodyProps)}
      </article>
    );
  }

  function applyLocalNotificationRead(notificationId: string) {
    setNotifications((prev) => {
      const target = prev.items.find((entry) => entry.id === notificationId);
      if (!target || !target.isUnread) {
        return prev;
      }

      const nextUnreadLikeCount =
        target.type === "LIKE"
          ? Math.max(0, prev.unreadLikeCount - 1)
          : prev.unreadLikeCount;
      const nextUnreadReplyCount =
        target.type === "LIKE"
          ? prev.unreadReplyCount
          : Math.max(0, prev.unreadReplyCount - 1);

      return {
        ...prev,
        unreadLikeCount: nextUnreadLikeCount,
        unreadReplyCount: nextUnreadReplyCount,
        totalUnreadCount: Math.max(0, prev.totalUnreadCount - 1),
        items: prev.items.map((entry) =>
          entry.id === notificationId ? { ...entry, isUnread: false } : entry,
        ),
      };
    });
  }

  async function markNotificationRead(notificationId: string) {
    try {
      const response = await fetch("/api/dugout/notifications" + orgParam, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId,
          markAll: false,
        }),
      });

      if (!response.ok) {
        return;
      }

      applyLocalNotificationRead(notificationId);
    } catch {
      // Ignore mark-read failures to keep navigation responsive.
    }
  }

  async function openNotificationTarget(item: DugoutNotificationItem) {
    if (item.isUnread) {
      await markNotificationRead(item.id);
    }

    const params = new URLSearchParams();
    params.set("view", "timeline");
    params.set("postId", item.postId);
    window.location.href = `/dugout?${params.toString()}`;
  }

  function renderPostGroup(group: (typeof postGroups)[number]) {
    return group.posts.length > 1 ? (
      <section
        key={group.key}
        className="border-b border-zinc-800 bg-zinc-950/30 px-3 py-1"
      >
        {group.posts.map((post, index) =>
          renderTimelinePost(post, {
            threadIndex: index,
            threadSize: group.posts.length,
          }),
        )}
      </section>
    ) : (
      renderTimelinePost(group.posts[0]!, {
        threadIndex: 0,
        threadSize: 1,
      })
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

          <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
              Unread Activity
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-200">
              <p>
                Likes:{" "}
                <span className="font-semibold">
                  {notifications.unreadLikeCount}
                </span>
              </p>
              <p>
                Replies/comments:{" "}
                <span className="font-semibold">
                  {notifications.unreadReplyCount}
                </span>
              </p>
              <p>
                Total unread:{" "}
                <span className="font-semibold text-violet-400">
                  {notifications.totalUnreadCount}
                </span>
              </p>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Last seen:{" "}
              {notifications.lastSeenAt
                ? formatPostTime(notifications.lastSeenAt)
                : "Not set yet"}
            </p>
          </div>

          {notifications.items.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
              No notifications yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/40">
              {notifications.items.map((item) => {
                const actorName = getDisplayName(item.actor);
                const icon =
                  item.type === "LIKE"
                    ? item.reaction || "❤️"
                    : item.type === "REPLY"
                      ? "↩"
                      : "💬";
                const headline =
                  item.type === "LIKE"
                    ? `${actorName} reacted to your post`
                    : item.type === "REPLY"
                      ? `${actorName} replied to your post`
                      : `${actorName} commented on your post`;

                return (
                  <article
                    key={item.id}
                    onClick={() => {
                      void openNotificationTarget(item);
                    }}
                    className={`border-b border-zinc-800 px-4 py-3 transition ${
                      item.isUnread
                        ? "cursor-pointer bg-brand-purple/10 hover:bg-brand-purple/15"
                        : "cursor-pointer hover:bg-zinc-900/70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm text-violet-400">
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm text-zinc-100">
                            {headline}
                          </p>
                          <span
                            className="shrink-0 text-xs text-zinc-500"
                            suppressHydrationWarning
                          >
                            {isClientMounted
                              ? formatRelativeTime(item.createdAt)
                              : ""}
                          </span>
                        </div>
                        {item.commentPreview ? (
                          <p className="mt-1 text-sm text-zinc-300 line-clamp-2">
                            {item.commentPreview}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                          {item.postPreview}
                        </p>
                        <div className="mt-2 flex justify-end">
                          <label
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400"
                          >
                            <span>Mark Read</span>
                            <input
                              type="checkbox"
                              checked={!item.isUnread}
                              onChange={() => {
                                if (!item.isUnread) return;
                                void markNotificationRead(item.id);
                              }}
                              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-violet-400 focus:ring-brand-gold"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : showingScheduleView ? (
        <section className="flex-1 overflow-y-auto scrollbar-hide border border-t-0 border-zinc-800 bg-zinc-900/70 p-4 md:p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Schedule</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {`This week's ${leagueName} games.`}
            </p>
          </div>

          {initialScheduleGames.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
              No games found for this week.
            </div>
          ) : (
            <div className="space-y-5">
              {groupedScheduleGames.map((dayGroup) => (
                <div key={dayGroup.dayLabel} className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400/85">
                      {dayGroup.dayLabel}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {dayGroup.parks.map((parkGroup) => (
                      <div key={parkGroup.parkLabel} className="space-y-3">
                        <p className="text-sm font-semibold text-zinc-200">
                          {parkGroup.parkLabel}
                        </p>

                        <div className="space-y-3">
                          {parkGroup.fields.map((fieldGroup) => (
                            <div
                              key={fieldGroup.fieldLabel}
                              className="space-y-2"
                            >
                              <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                                {fieldGroup.fieldLabel}
                              </p>

                              <div className="space-y-3">
                                {fieldGroup.games.map((game) => {
                                  const status =
                                    typeof game.status === "string"
                                      ? game.status
                                      : "Scheduled";
                                  const isCancelled = status
                                    .toLowerCase()
                                    .includes("cancel");

                                  return (
                                    <article
                                      key={game.id}
                                      className={`rounded-xl border p-4 ${isCancelled ? "border-red-900 bg-red-950/40" : "border-zinc-800 bg-zinc-950/50"}`}
                                    >
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-zinc-100">
                                          {game.home_team || "Home Team"}{" "}
                                          <span className="text-zinc-500">
                                            vs
                                          </span>{" "}
                                          {game.away_team || "Away Team"}
                                        </p>
                                        <p className="mt-1 text-xs text-zinc-400">
                                          {formatScheduleTime(game)}
                                        </p>
                                        {game.age_group ? (
                                          <p className="mt-2 text-xs text-zinc-500">
                                            {game.age_group}
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
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                Standings Snapshot
              </h4>
              <span className="text-[11px] text-zinc-500">
                Live from saved scores
              </span>
            </div>
            <StandingsTabs standings={initialStandings} />
          </div>
        </section>
      ) : (
        <section className="flex-1 overflow-y-auto scrollbar-hide border border-t-0 border-zinc-800 bg-zinc-900/70">
          <div
            ref={composerRef}
            className="relative z-30 overflow-visible border-b border-zinc-800 bg-zinc-900/70 px-3 py-3 sm:px-5 sm:py-4"
          >
            <form onSubmit={createPost}>
              <div className="flex min-w-0 gap-2 sm:gap-3">
                <div className="shrink-0">
                  <div className="sm:hidden">
                    <CoachAuthButton
                      avatarOnly
                      avatarSize={40}
                      onOpen={() => setError("")}
                    />
                  </div>
                  <div className="hidden sm:block">
                    <CoachAuthButton
                      avatarOnly
                      avatarSize={44}
                      onOpen={() => setError("")}
                    />
                  </div>
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
                  className={`min-w-0 flex-1 rounded-none px-2.5 pt-1.5 sm:rounded-[1.75rem] sm:px-5 sm:pt-4 transition ${
                    isDragOver
                      ? "bg-zinc-900 ring-1 ring-brand-gold/60"
                      : "bg-transparent"
                  }`}
                >
                  <textarea
                    ref={mainComposerTextareaRef}
                    rows={composerExpanded ? 4 : 1}
                    maxLength={MAX_POST_LENGTH}
                    placeholder="What's happening?"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    onFocus={() => {
                      setComposerExpanded(true);
                      setActiveComposerTarget({ type: "main" });
                    }}
                    className={`w-full resize-none bg-transparent leading-tight text-white placeholder-zinc-500 outline-none ${
                      composerExpanded
                        ? "min-h-22 pt-0 text-[18px] md:min-h-28 md:pt-1 md:text-lg"
                        : "min-h-10 pt-0 text-[18px] md:text-lg"
                    }`}
                  />

                  {threadEntries.length > 0 ? (
                    <div className="mb-4 space-y-3 border-t border-zinc-800/80 pt-4">
                      {threadEntries.map((entry, index) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              Post {index + 2}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeThreadEntry(entry.id)}
                              className="text-xs font-semibold text-red-300 transition hover:text-red-200"
                            >
                              Remove
                            </button>
                          </div>
                          <textarea
                            ref={(element) => {
                              threadTextareaRefs.current[entry.id] = element;
                            }}
                            rows={3}
                            maxLength={MAX_POST_LENGTH}
                            placeholder="Add another post in this thread"
                            value={entry.content}
                            onChange={(event) =>
                              updateThreadEntry(entry.id, event.target.value)
                            }
                            onFocus={() => {
                              setComposerExpanded(true);
                              setActiveComposerTarget({
                                type: "thread",
                                id: entry.id,
                              });
                            }}
                            className="w-full resize-none bg-transparent text-sm leading-6 text-white placeholder-zinc-500 outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

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

                  <div className="relative z-10 flex items-center gap-1.5 border-t border-zinc-800 py-2 sm:gap-3 sm:py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-violet-400 scrollbar-hide sm:gap-1">
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
                        className="rounded-full p-1.5 hover:bg-zinc-800 sm:p-2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4.5 w-4.5 sm:h-5 sm:w-5"
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
                        className={`rounded-full p-1.5 hover:bg-zinc-800 sm:p-2 ${gifSearchOpen ? "bg-zinc-800" : ""}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4.5 w-4.5 sm:h-5 sm:w-5"
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
                        className={`rounded-full p-1.5 hover:bg-zinc-800 sm:p-2 ${emojiPickerOpen ? "bg-zinc-800" : ""}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4.5 w-4.5 sm:h-5 sm:w-5"
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
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <button
                          type="button"
                          title="Bold"
                          onClick={() => applyInlineFormat("**")}
                          className="rounded-full px-2 py-1.5 text-base font-bold hover:bg-zinc-800 sm:px-3 sm:py-2 sm:text-lg"
                        >
                          B
                        </button>
                        <button
                          type="button"
                          title="Italic"
                          onClick={() => applyInlineFormat("*")}
                          className="rounded-full px-2 py-1.5 text-base italic hover:bg-zinc-800 sm:px-3 sm:py-2 sm:text-lg"
                        >
                          I
                        </button>
                        <button
                          type="button"
                          title="Add to thread"
                          onClick={addThreadEntry}
                          className="rounded-full p-1.5 hover:bg-zinc-800 sm:p-2"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4.5 w-4.5 sm:h-5 sm:w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path strokeLinecap="round" d="M12 8v8M8 12h8" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                      {composerExpanded && (
                        <CharacterMeter
                          current={content.length}
                          max={MAX_POST_LENGTH}
                          standard={280}
                        />
                      )}
                      <button
                        type="submit"
                        disabled={
                          busy ||
                          (!content.trim() &&
                            !threadEntries.some((entry) =>
                              entry.content.trim(),
                            ) &&
                            !mediaFile &&
                            !selectedGif)
                        }
                        className="rounded-full bg-violet-500 px-4 py-1.5 text-[15px] font-bold leading-5 text-zinc-950 hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:opacity-50 sm:px-5 sm:text-sm"
                      >
                        {busy
                          ? threadEntries.length > 0
                            ? "Posting thread..."
                            : "Posting..."
                          : threadEntries.length > 0
                            ? content.length > 280
                              ? "Post extended thread"
                              : "Post thread"
                            : content.length > 280
                              ? "Post extended"
                              : "Post"}
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
              {pinnedPostGroups.map((group) => renderPostGroup(group))}
              {regularPostGroups.map((group) => renderPostGroup(group))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
