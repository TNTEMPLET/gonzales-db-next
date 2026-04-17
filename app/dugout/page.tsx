import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import logo from "@/public/images/logo.png";

import DugoutGate from "@/components/dugout/DugoutGate";
import DugoutTimeline from "@/components/dugout/DugoutTimeline";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserByToken,
} from "@/lib/auth/adminSession";
import {
  COACH_SESSION_COOKIE,
  getCoachUserFromCookieToken,
} from "@/lib/auth/coachSession";
import { listDugoutPosts } from "@/lib/dugout/posts";
import { fetchGames, type Game } from "@/lib/fetchGames";
import { getPublishedNewsPosts } from "@/lib/news/queries";
import prisma from "@/lib/prisma";

export const metadata = {
  title: "The Dugout | Gonzales Diamond Baseball",
  description: "Coaches-only discussion feed.",
};

function formatGameTime(game: Game): string {
  if (game.start_time) {
    return new Date(game.start_time as string).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    });
  }
  return (game.localized_time as string) || "TBD";
}

function formatSidebarDate(value: Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

const NAV_ITEMS = [
  {
    key: "notifications",
    label: "Notifications",
    href: "/dugout?view=notifications",
    icon: "baseball",
  },
  {
    key: "schedule",
    label: "Schedule",
    href: "/dugout?view=schedule",
    icon: "calendar",
  },
  { key: "home", label: "Home", href: "/", icon: "home" },
] as const;

type DugoutPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DugoutPage({ searchParams }: DugoutPageProps) {
  const params = await searchParams;
  const activeView =
    params.view === "notifications"
      ? "notifications"
      : params.view === "schedule"
        ? "schedule"
        : "timeline";

  const cookieStore = await cookies();

  const coachToken = cookieStore.get(COACH_SESSION_COOKIE)?.value;
  const coach = await getCoachUserFromCookieToken(coachToken);

  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const admin = await getAdminUserByToken(adminToken);

  const authed = admin ?? (coach?.isCoach ? coach : null);

  if (!authed) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-3xl font-bold">The Dugout</h1>
          <p className="text-zinc-400">
            Coaches-only. Sign in with the Google account associated with your
            coach profile to continue.
          </p>
          <DugoutGate />
        </div>
      </main>
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]!;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(
    now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
  );
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const scheduleStartDate = startOfWeek.toISOString().split("T")[0]!;
  const scheduleEndDate = endOfWeek.toISOString().split("T")[0]!;

  const [initialPosts, todayGames, scheduleGames, allNews] = await Promise.all([
    listDugoutPosts(coach?.id),
    fetchGames({
      startDate: todayStr,
      endDate: todayStr,
      leagueId: 515712,
    }).catch(() => [] as Game[]),
    fetchGames({
      startDate: scheduleStartDate,
      endDate: scheduleEndDate,
      leagueId: 515712,
    }).catch(() => [] as Game[]),
    getPublishedNewsPosts(),
  ]);

  const recentNews = allNews.slice(0, 6);

  let currentUserId: string | null = coach?.id ?? null;
  if (!currentUserId && admin) {
    const reg = await prisma.registeredUser.findUnique({
      where: { email: admin.email },
      select: { id: true },
    });
    currentUserId = reg?.id ?? null;
  }

  const currentUserName = coach
    ? [coach.firstName, coach.lastName].filter(Boolean).join(" ") ||
      coach.name ||
      coach.email
    : admin
      ? [admin.firstName, admin.lastName].filter(Boolean).join(" ") ||
        admin.name ||
        admin.email
      : null;

  const currentUserAvatarUrl = coach?.avatarUrl ?? admin?.avatarUrl ?? null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-zinc-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-330">
        {/* ── Left navigation sidebar ─────────────────────────── */}
        <nav className="hidden lg:flex w-55 xl:w-65 shrink-0 flex-col gap-0.5 border-r border-zinc-800 overflow-y-auto px-3 py-6">
          {/* Brand */}
          <Link
            href="/dugout"
            className="mb-5 flex items-center gap-2 rounded-full px-3 py-2 transition hover:bg-zinc-800"
          >
            <Image
              src={logo}
              alt="Gonzales Diamond Baseball"
              width={64}
              height={64}
              className="object-contain"
            />
            <span className="text-lg font-black tracking-tight">
              The Dugout
            </span>
          </Link>

          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-full px-4 py-3 text-[15px] transition hover:bg-zinc-800 ${
                (item.key === "notifications" &&
                  activeView === "notifications") ||
                (item.key === "schedule" && activeView === "schedule")
                  ? "font-bold text-white"
                  : "font-medium text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {item.icon === "baseball" ? (
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center text-zinc-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 rotate-20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path
                      strokeLinecap="round"
                      d="M9 4.5C7.5 7 7.5 17 9 19.5"
                    />
                    <path
                      strokeLinecap="round"
                      d="M15 4.5C16.5 7 16.5 17 15 19.5"
                    />
                    <path strokeLinecap="round" d="M9 8.5 L7 9" />
                    <path strokeLinecap="round" d="M9 12 L6.8 12" />
                    <path strokeLinecap="round" d="M9 15.5 L7 15" />
                    <path strokeLinecap="round" d="M15 8.5 L17 9" />
                    <path strokeLinecap="round" d="M15 12 L17.2 12" />
                    <path strokeLinecap="round" d="M15 15.5 L17 15" />
                  </svg>
                </span>
              ) : item.icon === "calendar" ? (
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center text-zinc-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path strokeLinecap="round" d="M8 3v4M16 3v4M3 10h18" />
                  </svg>
                </span>
              ) : item.icon === "home" ? (
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center text-zinc-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 11l9-7 9 7"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 10v10h14V10"
                    />
                  </svg>
                </span>
              ) : null}
              {item.label}
            </Link>
          ))}

          {/* User profile pill at bottom */}
          <div className="mt-auto border-t border-zinc-800 pt-4">
            <div className="flex items-center gap-3 rounded-full px-3 py-2 hover:bg-zinc-800">
              {currentUserAvatarUrl ? (
                <Image
                  src={currentUserAvatarUrl}
                  alt={currentUserName ?? ""}
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-white">
                  {(currentUserName ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {currentUserName}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {admin && !coach ? "Admin" : "Coach"}
                </p>
              </div>
            </div>
          </div>
        </nav>

        {/* ── Center feed column ───────────────────────────────── */}
        <div className="flex h-full flex-1 flex-col overflow-hidden border-r border-zinc-800 px-3 py-4 sm:px-4">
          <DugoutTimeline
            initialPosts={initialPosts}
            initialScheduleGames={scheduleGames}
            isAdmin={!!admin}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserAvatarUrl={currentUserAvatarUrl}
            initialView={activeView}
          />
        </div>

        {/* ── Right sidebar ────────────────────────────────────── */}
        <aside className="hidden xl:flex w-[320px] shrink-0 flex-col gap-5 overflow-y-auto px-4 py-6 pb-6">
          {/* Today's Games */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <h3 className="mb-3 text-lg font-bold">Today&apos;s Games</h3>
            {todayGames.length === 0 ? (
              <p className="text-sm text-zinc-400">No games scheduled today.</p>
            ) : (
              <div className="space-y-2.5">
                {todayGames.map((game) => {
                  const isCancelled =
                    typeof game.status === "string" &&
                    game.status.toLowerCase().includes("cancel");
                  const venueName =
                    (game.subvenue as string | undefined) ||
                    game._embedded?.venue?.name ||
                    null;
                  return (
                    <div
                      key={game.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {game.home_team || "Home"}{" "}
                            <span className="text-zinc-500">vs</span>{" "}
                            {game.away_team || "Away"}
                          </p>
                          {game.age_group ? (
                            <p className="text-[11px] text-zinc-500">
                              {game.age_group as string}
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {formatGameTime(game)}
                            {venueName ? ` · ${venueName}` : ""}
                          </p>
                        </div>
                        {game.status ? (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              isCancelled
                                ? "bg-red-950/50 text-red-400"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {game.status as string}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              href="/schedule"
              className="mt-3 block text-sm font-semibold text-brand-gold hover:text-brand-gold/80 transition"
            >
              Full schedule →
            </Link>
          </div>

          {/* News */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <h3 className="mb-3 text-lg font-bold">News</h3>
            {recentNews.length === 0 ? (
              <p className="text-sm text-zinc-400">No announcements yet.</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {recentNews.map((post) => (
                  <div key={post.id} className="py-2.5 first:pt-0 last:pb-0">
                    {post.publishedAt ? (
                      <p className="mb-0.5 text-[11px] text-zinc-500">
                        {formatSidebarDate(post.publishedAt)}
                      </p>
                    ) : null}
                    <Link
                      href={`/news/${post.slug}`}
                      className="line-clamp-2 text-sm font-semibold text-zinc-200 transition hover:text-white"
                    >
                      {post.title}
                    </Link>
                    {post.excerpt ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">
                        {post.excerpt}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/news"
              className="mt-3 block text-sm font-semibold text-brand-gold hover:text-brand-gold/80 transition"
            >
              All news →
            </Link>
          </div>

          {/* Compact footer */}
          <div className="mt-auto pt-4 border-t border-zinc-800 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Image
                src={logo}
                alt="Gonzales Diamond Baseball"
                width={22}
                height={22}
                className="object-contain opacity-60"
              />
              <span className="text-xs font-bold text-zinc-500">
                Gonzales DB
              </span>
            </div>
            <p className="text-[11px] text-zinc-600">
              1943 S. Burnside Ave. · Gonzales, LA 70737
            </p>
            <a
              href="tel:225-495-4001"
              className="block text-[11px] text-zinc-600 hover:text-zinc-400"
            >
              (225) 495-4001
            </a>
            <a
              href="mailto:info@apbaseball.com"
              className="block text-[11px] text-zinc-600 hover:text-zinc-400"
            >
              info@apbaseball.com
            </a>
            <p className="text-[11px] text-zinc-700 pt-1">
              © {new Date().getFullYear()} Gonzales Diamond Baseball
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
