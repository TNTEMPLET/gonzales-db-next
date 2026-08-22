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
import { getRegistrationStatus } from "@/lib/registrationStatus";
import {
  getSportsConnectRegistrationUrl,
  getSportsConnectVolunteerRegistrationUrl,
} from "@/lib/sportsConnect/registrationUrl";
import {
  getAssignrLeagueId,
  getDefaultContentOrg,
  getSiteConfig,
  hasAssignrLeagueId,
  isMasterDeployment,
  isTournamentOnlyDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";
import { getOrgCapabilities } from "@/lib/org/capabilities";
import { getActiveOrgAlert } from "@/lib/orgAlerts";
import {
  SEASON_END_DATE,
  SEASON_START_DATE,
  CURRENT_SEASON_LABEL,
  getSeasonConfigForOrg,
} from "@/lib/seasonConfig";

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

function getHomepageCopy(orgId: ContentOrgId) {
  const season = getSeasonConfigForOrg(orgId);
  const caps = getOrgCapabilities(orgId);

  if (orgId === "fallball") {
    return {
      seasonBadge: season.label.toUpperCase(),
      tagline:
        "Independent AP Baseball Fall Ball league operations, teams, schedules, and updates.",
      registrationLabel: "Registration",
      liveScoresText:
        caps.schedule === "none"
          ? "Schedules and scores will appear once Fall Ball games are published."
          : "Live scores appear when games are published.",
    };
  }

  return {
    seasonBadge: `${season.label.toUpperCase()} SEASON`,
    tagline: "Fun, development, and competition for kids ages 9–17 in Ascension Parish",
    registrationLabel: "Registration",
    liveScoresText: "Integrated with GameChanger",
  };
}

const TOURNAMENT_PARK = {
  name: "Butch Gore Memorial Park",
  addressLine1: "14450 Harry Savoy Road",
  addressLine2: "St. Amant, LA 70774",
  mapsQuery: "Butch Gore Memorial Park, 14450 Harry Savoy Road, St. Amant, LA 70774",
};

const PARK_DIRECTION_ORIGINS = [
  {
    label: "Eastbank Little League",
    origin: "Butch Duhe Sportsplex, 1710 10th Street, Kenner, LA 70062",
  },
  {
    label: "Bogalusa Little League",
    origin: "Bogalusa Little League, 640 Avenue U, Bogalusa, LA 70427",
  },
  {
    label: "St. Charles Little League",
    origin: "East Bank Bridge Park, 13244 River Road, Destrehan, LA 70047",
  },
  {
    label: "Greater New Orleans LL",
    origin: "John A. Alario Sr. Event Center, 2000 Segnette Boulevard, Westwego, LA 70094",
  },
] as const;

function googleDirectionsUrl(origin: string) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination: TOURNAMENT_PARK.mapsQuery,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function googleMapEmbedUrl() {
  const params = new URLSearchParams({
    q: TOURNAMENT_PARK.mapsQuery,
    output: "embed",
  });
  return `https://www.google.com/maps?${params.toString()}`;
}

function formatPublishedDate(value: Date | null) {
  if (!value) return "Draft";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function TournamentLandingPage() {
  const site = getSiteConfig();

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-5xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 shadow-2xl shadow-black/20 sm:p-8 md:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="relative h-20 w-28 shrink-0 sm:h-24 sm:w-32">
              <Image
                src={site.logoPath}
                alt={site.name}
                fill
                priority
                sizes="128px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="mb-3 inline-flex rounded-full bg-brand-purple px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                2026 Tournament Central
              </p>
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
                {site.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                Compact access to District 2 brackets, live scores, tournament updates, and team rosters.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Link
              href="/tournaments"
              className="rounded-2xl bg-brand-purple px-5 py-4 text-center font-semibold text-white transition hover:bg-brand-purple-dark"
            >
              View Brackets
            </Link>
            <Link
              href="/today"
              className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-5 py-4 text-center font-semibold text-brand-gold transition hover:border-brand-gold hover:bg-brand-gold/15"
            >
              Today&apos;s Schedule
            </Link>
            <Link
              href="/rosters"
              className="rounded-2xl border border-zinc-700 px-5 py-4 text-center font-semibold text-zinc-100 transition hover:border-brand-gold hover:text-brand-gold"
            >
              View Rosters
            </Link>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="font-semibold text-zinc-100">Live Scores</p>
              <p className="mt-1">GameChanger links appear on bracket games when available.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="font-semibold text-zinc-100">Published Brackets</p>
              <p className="mt-1">Division brackets are updated from the tournament admin.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="font-semibold text-zinc-100">Rosters</p>
              <p className="mt-1">Approved tournament rosters will be posted by division.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 rounded-3xl border border-zinc-800 bg-zinc-900/75 p-5 shadow-2xl shadow-black/20 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-brand-purple px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              Park Information
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {TOURNAMENT_PARK.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {TOURNAMENT_PARK.addressLine1}
              <br />
              {TOURNAMENT_PARK.addressLine2}
            </p>
            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
              <p className="font-semibold text-zinc-100">Tournament Details</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                <li>$5 entry per person</li>
                <li>Ages 10 and under are free</li>
                <li>Tents and chairs are encouraged</li>
                <li>Cash and card accepted</li>
              </ul>
            </div>

            <p className="mt-4 text-sm text-zinc-400">
              Use these Google Maps links for live driving directions from the I-10 corridor to the park.
            </p>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {PARK_DIRECTION_ORIGINS.map((route) => (
                <a
                  key={route.label}
                  href={googleDirectionsUrl(route.origin)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-brand-gold hover:text-brand-gold"
                >
                  Directions from {route.label}
                </a>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
            <iframe
              title={`${TOURNAMENT_PARK.name} map`}
              src={googleMapEmbedUrl()}
              className="h-64 w-full border-0 sm:h-72 lg:h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>
    </main>
  );
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
    return <TournamentLandingPage />;
  }

  const viewMode = (resolvedSearchParams.view as ViewMode) || "thisWeek";
  const site = getSiteConfig();
  const contentOrg = getDefaultContentOrg();
  const registrationStatus = await getRegistrationStatus(contentOrg);
  const regOpen = registrationStatus === "OPEN";
  const regWaitlist = registrationStatus === "WAITLIST";
  const homepageCopy = getHomepageCopy(contentOrg);
  const orgCaps = getOrgCapabilities(contentOrg);
  const volunteerRegistrationUrl = getSportsConnectVolunteerRegistrationUrl();
  const scReg =
    orgCaps.registration === "sportsconnect"
      ? getSportsConnectRegistrationUrl(contentOrg)
      : null;
  // SportsConnect hub stays reachable even when spring internal reg window is closed.
  const showRegistrationCta =
    regOpen || regWaitlist || orgCaps.registration === "sportsconnect";
  const heroBadge = regWaitlist ? "WAITLIST OPEN" : homepageCopy.seasonBadge;
  const scheduleLive =
    orgCaps.schedule === "assignr" && hasAssignrLeagueId();
  const compactOps = orgCaps.homepage === "compact-ops";
  // Safe for Fall Ball: empty league id never falls back to Gonzales.
  const defaultLeagueId = hasAssignrLeagueId() ? getAssignrLeagueId() : "";

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
    startDate = SEASON_START_DATE;
    endDate = SEASON_END_DATE;
  }

  let games: Game[] = [];
  let error: string | null = null;

  if (defaultLeagueId) {
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
  }

  const orgAlert = await getActiveOrgAlert(getDefaultContentOrg()).catch(() => null);

  const today = new Date().toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  // League is in Ascension Parish, LA — show "today" in Central time, not server UTC.
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
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

  const heroCtas = (
    <div
      className={
        compactOps
          ? "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          : "flex flex-col sm:flex-row gap-4 justify-center"
      }
    >
      {/* CTA priority for compact-ops: volunteer registration → registration → schedule (if live) */}
      {orgCaps.coachingInterest ? (
        <a
          href={volunteerRegistrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            compactOps
              ? "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-gold px-6 py-3 text-base font-semibold text-zinc-950 transition-all hover:bg-brand-gold/90 active:scale-95"
              : "rounded-xl bg-brand-gold px-8 py-4 text-lg font-semibold text-zinc-950 transition-all hover:bg-brand-gold/90 active:scale-95 sm:px-12 sm:py-5 sm:text-xl"
          }
        >
          Volunteer Registration (Coaches &amp; Umpires)
        </a>
      ) : null}
      {showRegistrationCta ? (
        regWaitlist && scReg ? (
          <a
            href={scReg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={
              compactOps
                ? "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-purple px-6 py-3 text-base font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                : "rounded-xl bg-brand-purple px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95 sm:px-12 sm:py-5 sm:text-xl"
            }
          >
            Join the Waitlist
          </a>
        ) : regOpen && scReg ? (
          <a
            href={scReg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={
              compactOps
                ? "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-purple px-6 py-3 text-base font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                : "rounded-xl bg-brand-purple px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95 sm:px-12 sm:py-5 sm:text-xl"
            }
          >
            Register Now
          </a>
        ) : (
          <a
            href="/registration"
            className={
              compactOps
                ? "inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-purple px-6 py-3 text-base font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                : "rounded-xl bg-brand-purple px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95 sm:px-12 sm:py-5 sm:text-xl"
            }
          >
            {regWaitlist
              ? "Join the Waitlist"
              : orgCaps.registration === "sportsconnect"
                ? homepageCopy.registrationLabel
                : "Register Now"}
          </a>
        )
      ) : null}
      {scheduleLive ? (
        <a
          href="#schedule"
          className={
            compactOps
              ? "inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-white px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white hover:text-black"
              : "rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-white hover:text-black sm:px-12 sm:py-5 sm:text-xl"
          }
        >
          View Schedules
        </a>
      ) : null}
    </div>
  );

  // When news owns the hero, surface registration / hero actions as a strip on the rotator.
  const rotatorCtaStrip =
    heroRotatorItems.length > 0
      ? {
          title: homepageCopy.registrationLabel,
          statusLabel: regWaitlist
            ? "Waitlist Open"
            : regOpen
              ? "Registration Open"
              : orgCaps.registration === "sportsconnect"
                ? "Opens August 1"
                : showRegistrationCta
                  ? `${CURRENT_SEASON_LABEL} Season`
                  : "Registration Closed",
          statusTone: (regWaitlist
            ? "open"
            : regOpen
              ? "open"
              : showRegistrationCta
                ? "pending"
                : "closed") as "open" | "pending" | "closed",
          actions: [
            ...(regWaitlist && scReg
              ? [
                  {
                    label: "Join the Waitlist",
                    href: scReg.href,
                    variant: "primary" as const,
                    external: true,
                  },
                ]
              : regOpen && scReg
              ? [
                  {
                    label: "Register Now",
                    href: scReg.href,
                    variant: "primary" as const,
                    external: true,
                  },
                ]
              : showRegistrationCta
                ? [
                    {
                      label: regWaitlist
                        ? "Join the Waitlist"
                        : orgCaps.registration === "sportsconnect"
                          ? "Registration info"
                          : "Register Now",
                      href: "/registration",
                      variant: "primary" as const,
                    },
                  ]
                : []),
            ...(orgCaps.coachingInterest
              ? [
                  {
                    label: "Volunteer Registration (Coaches & Umpires)",
                    href: volunteerRegistrationUrl,
                    variant: "secondary" as const,
                    external: true,
                  },
                ]
              : []),
            ...(scheduleLive
              ? [
                  {
                    label: "View Schedules",
                    href: "#schedule",
                    variant: "outline" as const,
                  },
                ]
              : []),
          ],
        }
      : null;

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      {heroRotatorItems.length > 0 ? (
        <HeroNewsRotator
          items={heroRotatorItems}
          ctaStrip={
            rotatorCtaStrip && rotatorCtaStrip.actions.length > 0
              ? rotatorCtaStrip
              : null
          }
        />
      ) : (
        <section className="relative flex min-h-[70svh] items-center justify-center overflow-hidden bg-black p-4 sm:min-h-[75vh]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.18),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(124,58,237,0.2),transparent_55%),linear-gradient(145deg,#09090b,#18181b)]" />
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-size-[48px_48px]" />
          {/* Org logo as full-bleed hero background */}
          <Image
            src={site.logoPath}
            alt=""
            fill
            priority
            sizes="100vw"
            aria-hidden
            className="object-contain object-center opacity-15 scale-[1.35] blur-[1px]"
          />
          <div className="absolute inset-0 bg-black/45" />

          <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="mb-5 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] text-white sm:mb-6 sm:px-6 sm:text-xs sm:tracking-[3px]">
              {heroBadge}
            </div>

            <h1 className="mb-5 text-4xl font-bold leading-none tracking-tighter text-white sm:text-5xl md:mb-6 md:text-7xl">
              {site.name}
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-lg text-brand-gold sm:text-2xl md:mb-10 md:text-3xl">
              {homepageCopy.tagline}
            </p>

            <div className="flex justify-center">{heroCtas}</div>
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
            <h3 className="font-semibold text-xl mb-1 text-white">
              {homepageCopy.registrationLabel}
            </h3>
            {regOpen ? (
              <>
                <p className="text-emerald-400 font-semibold tracking-wide">
                  Registration Open
                </p>
                {scReg ? (
                  <a
                    href={scReg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                  >
                    Register Now
                  </a>
                ) : (
                  <Link
                    href="/registration"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                  >
                    Register Now
                  </Link>
                )}
              </>
            ) : regWaitlist ? (
              <>
                <p className="text-amber-400 font-semibold tracking-wide">
                  Waitlist Open
                </p>
                {scReg ? (
                  <a
                    href={scReg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                  >
                    Join the Waitlist
                  </a>
                ) : (
                  <Link
                    href="/registration"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-purple-dark active:scale-95"
                  >
                    Join the Waitlist
                  </Link>
                )}
              </>
            ) : (
              <p className="text-brand-gold">Closed</p>
            )}
            {orgCaps.coachingInterest ? (
              <a
                href={volunteerRegistrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex text-sm font-semibold text-white underline decoration-brand-gold underline-offset-4 hover:text-brand-gold"
              >
                Volunteer Registration (Coaches &amp; Umpires)
              </a>
            ) : null}
          </div>
          <div>
            <div className="text-6xl mb-3">📱</div>
            <h3 className="font-semibold text-xl mb-1 text-white">
              {scheduleLive ? "Live Scores" : "Schedules"}
            </h3>
            <p className="text-zinc-400">{homepageCopy.liveScoresText}</p>
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

      {/* Schedule Table — honest empty when no Assignr source */}
      {scheduleLive ? (
        <ScheduleTable
          siteName={site.name}
          initialGames={games}
          initialError={error}
          currentViewMode={viewMode}
          standings={[]}
          forceRainout={
            orgAlert
              ? { allParksOut: orgAlert.allParksOut, venues: orgAlert.venues }
              : undefined
          }
        />
      ) : (
        <section
          id="schedule"
          className="border-b border-zinc-800 bg-zinc-950 py-12 sm:py-16"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <div className="mb-4 inline-block rounded-full bg-zinc-800 px-4 py-1.5 text-[11px] tracking-[0.18em] text-zinc-300">
              SCHEDULES
            </div>
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Schedules publish when the league is set up
            </h2>
            <p className="text-zinc-400">
              {homepageCopy.liveScoresText} Check back once game days are
              announced, or follow coaching and registration updates above.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
