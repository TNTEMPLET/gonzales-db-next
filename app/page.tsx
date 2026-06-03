// app/page.tsx
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ScheduleTable from "@/components/ScheduleTable";
import HeroNewsRotator from "@/components/home/HeroNewsRotator";
import { fetchGames, type Game } from "@/lib/fetchGames";
import {
  getHomepageFeaturedNewsPosts,
  getHomepageRotatorPosts,
} from "@/lib/news/queries";
import { isRegistrationOpen } from "@/lib/registrationStatus";
import {
  getAssignrLeagueId,
  getDefaultContentOrg,
  getSiteConfig,
  isMasterDeployment,
  isTournamentOnlyDeployment,
} from "@/lib/siteConfig";
import { getActiveOrgAlert } from "@/lib/orgAlerts";

type ViewMode = "thisWeek" | "nextWeek" | "fullSeason";

type HomepageRotatorPost = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  excerpt: string | null;
};

type HomepageFeaturedPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
};

function formatPublishedDate(value: Date | null) {
  if (!value) return "Draft";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const resolvedSearchParams = await searchParams;

  if (isMasterDeployment()) {
    redirect("/admin");
  }

  if (isTournamentOnlyDeployment()) {
    redirect("/tournaments");
  }

  const viewMode = (resolvedSearchParams.view as ViewMode) || "thisWeek";
  const regOpen = isRegistrationOpen();
  const defaultLeagueId = getAssignrLeagueId();
  const site = getSiteConfig();

  let rotatorPosts: HomepageRotatorPost[] = [];
  let featuredPosts: HomepageFeaturedPost[] = [];
  try {
    rotatorPosts = (await getHomepageRotatorPosts()) as HomepageRotatorPost[];
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown rotator loading error";
    console.error(`Homepage rotator load failed: ${message}`);
  }

  try {
    featuredPosts =
      (await getHomepageFeaturedNewsPosts()) as HomepageFeaturedPost[];
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown featured news loading error";
    console.error(`Homepage featured news load failed: ${message}`);
  }

  const heroRotatorItems = rotatorPosts
    .filter((post: HomepageRotatorPost) => Boolean(post.imageUrl))
    .map((post: HomepageRotatorPost) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      imageUrl: post.imageUrl || "",
      excerpt: post.excerpt,
    }));

  // Calculate date range based on view mode
  let startDate: string;
  let endDate: string;
  const now = new Date();

  if (viewMode === "thisWeek") {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
    );
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    startDate = startOfWeek.toISOString().split("T")[0];
    endDate = endOfWeek.toISOString().split("T")[0];
  } else if (viewMode === "nextWeek") {
    const startOfNextWeek = new Date(now);
    startOfNextWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? 1 : 8),
    );
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    startDate = startOfNextWeek.toISOString().split("T")[0];
    endDate = endOfNextWeek.toISOString().split("T")[0];
  } else {
    // Full Season
    startDate = "2026-03-01";
    endDate = "2026-06-30";
  }

  let games: Game[] = [];
  let error: string | null = null;

  try {
    games = await fetchGames({
      startDate,
      endDate,
      leagueId: defaultLeagueId,
    });
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to load game data";
    console.error(err);
  }

  const orgAlert = await getActiveOrgAlert(getDefaultContentOrg()).catch(() => null);

  const today = new Date().toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  const todayParts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).formatToParts(new Date());
  const todayMonthLabel =
    todayParts.find((part) => part.type === "month")?.value.toUpperCase() || "";
  const todayDayLabel =
    todayParts.find((part) => part.type === "day")?.value || "";
  const todayYearLabel =
    todayParts.find((part) => part.type === "year")?.value || "";

  const venueStats = Array.from(
    games.reduce((acc, game) => {
      const venue = game._embedded?.venue?.name?.trim();
      if (!venue) return acc;

      const current = acc.get(venue) || {
        venue,
        todayGames: 0,
        cancelledTodayGames: 0,
      };

      if (game.localized_date) {
        const gameDate = new Date(game.localized_date).toLocaleDateString(
          "en-US",
          {
            month: "numeric",
            day: "numeric",
            year: "numeric",
          },
        );

        if (gameDate === today) {
          current.todayGames += 1;
          if (game.status === "C") current.cancelledTodayGames += 1;
        }
      }

      acc.set(venue, current);
      return acc;
    }, new Map<string, { venue: string; todayGames: number; cancelledTodayGames: number }>()),
  ).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      {heroRotatorItems.length > 0 ? (
        <HeroNewsRotator items={heroRotatorItems} />
      ) : (
        <section className="relative flex min-h-[70svh] items-center justify-center overflow-hidden bg-black p-4 sm:min-h-[75vh]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.18),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(124,58,237,0.2),transparent_55%),linear-gradient(145deg,#09090b,#18181b)]" />
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-size-[48px_48px]" />
          <Image
            src={site.logoPath}
            alt={site.name}
            fill
            priority
            className="object-contain opacity-15 scale-[1.35] blur-[1px]"
          />
          <div className="absolute inset-0 bg-black/45" />

          <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="mb-5 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] text-white sm:mb-6 sm:px-6 sm:text-xs sm:tracking-[3px]">
              SPRING 2026 SEASON
            </div>

            <h1 className="mb-5 text-4xl font-bold leading-none tracking-tighter text-white sm:text-5xl md:mb-6 md:text-7xl">
              {site.name}
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-lg text-brand-gold sm:text-2xl md:mb-10 md:text-3xl">
              Fun, development, and competition for kids ages 9–17 in Ascension
              Parish
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {regOpen && (
                <a
                  href="#register"
                  className="rounded-xl bg-brand-purple px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95 sm:px-12 sm:py-5 sm:text-xl"
                >
                  Register Now
                </a>
              )}
              <a
                href="#schedule"
                className="rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-white hover:text-black sm:px-12 sm:py-5 sm:text-xl"
              >
                View Schedules
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Quick Stats */}
      <section className="border-b border-zinc-800 bg-zinc-900 py-10 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 text-center sm:px-6 md:grid-cols-3 md:gap-10">
          <div>
            <div className="text-6xl mb-3">🏟️</div>
            <h3 className="font-semibold text-xl mb-3 text-white">Park Status</h3>
            {venueStats.length > 0 ? (
              <div className="space-y-2">
                {venueStats.map(([, venue]) => {
                  const statusLabel =
                    venue.todayGames === 0
                      ? "No games today"
                      : venue.cancelledTodayGames === venue.todayGames
                        ? "Rained-Out today"
                        : venue.cancelledTodayGames > 0
                          ? `${venue.cancelledTodayGames}/${venue.todayGames} Rained-Out`
                          : "Games today";

                  const statusClass =
                    venue.todayGames === 0
                      ? "text-zinc-500"
                      : venue.cancelledTodayGames === venue.todayGames
                        ? "text-red-400"
                        : venue.cancelledTodayGames > 0
                          ? "text-amber-400"
                          : "text-emerald-400";

                  return (
                    <p
                      key={venue.venue}
                      className="text-zinc-200 leading-tight"
                    >
                      {venue.venue}
                      <small className={`block text-xs mt-1 ${statusClass}`}>
                        {statusLabel}
                      </small>
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-zinc-400">No venue data yet</p>
            )}
          </div>
          <div>
            <div className="inline-flex flex-col overflow-hidden border rounded-xl border-zinc-600 bg-zinc-300 shadow-lg mb-3 min-w-21">
              <div className="bg-brand-purple text-white text-xs font-bold py-1 px-2 flex items-center justify-between gap-1 w-full">
                <span className="tracking-[0.14em]">{todayMonthLabel}</span>
                <span>|</span>
                <span className="tracking-[0.08em]">{todayYearLabel}</span>
              </div>
              <div className="text-4xl font-black leading-none py-3 text-shadow-zinc-950 text-zinc-900">
                {todayDayLabel}
              </div>
            </div>
            <h3 className="font-semibold text-xl mb-1 text-white">Registration</h3>
            <p className="text-brand-gold">
              {regOpen ? "Spring 2026 Season" : "Closed"}
            </p>
          </div>
          <div>
            <div className="text-6xl mb-3">📱</div>
            <h3 className="font-semibold text-xl mb-1 text-white">Live Scores</h3>
            <p className="text-zinc-400">Integrated with GameChanger</p>
          </div>
        </div>
      </section>

      {/* Schedule Table */}
      {featuredPosts.length > 0 ? (
        <section className="border-b border-zinc-800 bg-zinc-950 py-10 sm:py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-3 inline-block rounded-full bg-brand-purple px-4 py-1.5 text-[11px] tracking-[2px]">
                  FEATURED NEWS
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
                  Top League Updates
                </h2>
              </div>
              <Link
                href="/news"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-gold hover:text-brand-gold/80"
              >
                View All News
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {featuredPosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/70 overflow-hidden"
                >
                  {post.imageUrl ? (
                    <Image
                      src={post.imageUrl}
                      alt={post.title}
                      width={640}
                      height={360}
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="h-36 w-full bg-zinc-800" />
                  )}

                  <div className="p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500 mb-2">
                      {formatPublishedDate(post.publishedAt)}
                    </p>
                    <h3 className="text-lg font-semibold leading-snug mb-2">
                      {post.title}
                    </h3>
                    {post.excerpt ? (
                      <p className="text-sm text-zinc-300 line-clamp-3 mb-3">
                        {post.excerpt}
                      </p>
                    ) : null}
                    <Link
                      href={`/news/${post.slug}`}
                      className="text-sm font-semibold text-brand-gold hover:text-brand-gold/80"
                    >
                      Read More
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Schedule Table */}
      <ScheduleTable
        siteName={site.name}
        initialGames={games}
        initialError={error}
        currentViewMode={viewMode}
        standings={[]}
        forceRainout={orgAlert ? { allParksOut: orgAlert.allParksOut, venues: orgAlert.venues } : undefined}
      />
    </main>
  );
}
