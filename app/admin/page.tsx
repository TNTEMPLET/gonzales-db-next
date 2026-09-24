import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { canViewAllStarVault } from "@/lib/allStar/auth";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import AdminRolePreviewControl from "@/components/admin/AdminRolePreviewControl";
import AdminDashboardModuleGrid from "@/components/admin/AdminDashboardModuleGrid";
import {
  CONTENT_ORGS,
  getDefaultContentOrg,
  getOrgDisplayName,
  getSiteConfig,
  getSiteConfigForOrg,
  isMasterDeployment,
  isAdminModuleEnabledForOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";
import {
  getPrimaryLiveContentOrg,
  getSeasonConfigForOrg,
  isSeasonLiveForOrg,
} from "@/lib/seasonConfig";
import { isCommunicationsModuleEnabled } from "@/lib/communications/config";
import prisma from "@/lib/prisma";
import {
  getAdminDashboardCategory,
  sortAdminDashboardCards,
} from "@/lib/admin/dashboardModules";
import { getRegistrationSummary } from "@/lib/admin/dashboard/registrationSummary";
import { getComplianceSummary } from "@/lib/admin/dashboard/complianceSummary";
import { getEngagementSummary } from "@/lib/admin/dashboard/engagementSummary";
import { getBoardContactSummary } from "@/lib/admin/dashboard/boardContactSummary";
import { getNeedsAttentionSummary } from "@/lib/admin/dashboard/needsAttentionSummary";
import RegistrationRevenueSection from "@/components/admin/dashboard/RegistrationRevenueSection";
import ComplianceSection from "@/components/admin/dashboard/ComplianceSection";
import EngagementSection from "@/components/admin/dashboard/EngagementSection";
import BoardContactWidget from "@/components/admin/dashboard/BoardContactWidget";
import NeedsAttentionPanel from "@/components/admin/dashboard/NeedsAttentionPanel";
import GameDayPanel from "@/components/admin/dashboard/GameDayPanel";
import ParkDirectorMenu from "@/components/admin/dashboard/ParkDirectorMenu";
import ParkDirectorScope from "@/components/admin/ParkDirectorScope";
import { loadDirectorParks, loadParkDirectorUmpirePay } from "@/lib/admin/dashboard/parkDirectorPay";
import type { DayParkUmpirePay } from "@/lib/admin/umpirePayRows";

const SAMPLE_UMPIRE_PAY: DayParkUmpirePay[] = [
  { umpireId: "sample-1", name: "Maria Alvarez", games: 2, totalPay: 80 },
  { umpireId: "sample-2", name: "James Whitfield", games: 3, totalPay: 150 },
  { umpireId: "sample-3", name: "Denise Porter", games: 1, totalPay: 40 },
  { umpireId: "sample-4", name: "Caleb Nguyen", games: 2, totalPay: 100 },
];
import { leagueCalendarDate } from "@/lib/seasonConfig";
import InSeasonBoard, { type SeasonFinanceSlice } from "@/components/admin/dashboard/InSeasonBoard";
import type { GameDayStatus } from "@/lib/admin/dashboard/gameDay";
import {
  loadGameDayStatuses,
  loadInSeasonBoard,
  type AssignrSyncView,
  type InSeasonBoardData,
  type OperationsView,
} from "@/lib/admin/dashboard/loadInSeasonBoard";
import { seasonDashboardLinks, type SeasonDashboardLinks } from "@/lib/admin/dashboard/seasonLinks";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Admin Dashboard | ${site.name}`,
    description:
      "Central admin dashboard for users, news posts, and dugout moderation.",
  };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; day?: string; park?: string }>;
}) {
  const { org, day, park } = await searchParams;
  const masterMode = isMasterDeployment();
  const requestedOrg =
    org && CONTENT_ORGS.includes(org as ContentOrgId)
      ? (org as ContentOrgId)
      : null;
  const allSitesRequested = masterMode && org === "all";

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    const nextOrg =
      requestedOrg ?? (allSitesRequested ? "all" : getPrimaryLiveContentOrg());
    redirect(`/admin/login?next=/admin?org=${nextOrg}`);
  }

  // Bare /admin on master used to land on All Sites, which forced a click
  // into the live org every visit. Redirect onto that org so the switcher,
  // sidebar, and module links share the same target. Explicit ?org=all
  // still opens the aggregate view.
  if (masterMode && !requestedOrg && !allSitesRequested) {
    redirect(`/admin?org=${getPrimaryLiveContentOrg()}`);
  }

  const currentOrg = masterMode ? requestedOrg : getDefaultContentOrg();
  const moduleOrgFallback = currentOrg ?? getPrimaryLiveContentOrg();

  const displayName =
    [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") ||
    adminUser.name ||
    adminUser.email;
  const roleEntries = await Promise.all(
    CONTENT_ORGS.map(async (orgId) => [
      orgId,
      await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, orgId),
    ] as const),
  );
  const roleByOrg = Object.fromEntries(roleEntries) as Record<ContentOrgId, AdminRole | null>;

  const adminRole: AdminRole = currentOrg
    ? (roleByOrg[currentOrg] ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR"))
    : (adminUser.isMaster ? "MASTER_ADMIN" : (Object.values(roleByOrg).find((r): r is AdminRole => !!r) ?? "PARK_DIRECTOR"));

  const allowRolePreview = hasAdminRoleAtLeast(adminRole, "ADMIN");
  const communicationsEnabled = isCommunicationsModuleEnabled();
  const allStarVaultViewByOrg = Object.fromEntries(
    CONTENT_ORGS.map((orgId) => [orgId, false] as const),
  ) as Record<ContentOrgId, boolean>;
  try {
    const globalLinkedUsers = await prisma.registeredUser.findMany({
      where: { email: { equals: adminUser.email, mode: "insensitive" } },
      select: { id: true },
    });
    for (const u of globalLinkedUsers) {
      for (const orgId of CONTENT_ORGS) {
        const prof = await (prisma as any).registeredUserOrgProfile.findUnique({
          where: {
            registeredUserId_organizationId: {
              registeredUserId: u.id,
              organizationId: orgId,
            },
          },
          select: { registeredUserId: true },
        });
        if (prof && (await canViewAllStarVault(u.id, orgId))) {
          allStarVaultViewByOrg[orgId] = true;
        }
      }
    }
  } catch (err) {
    console.error(
      "Admin dashboard All-Star org-profile lookup failed (continuing):",
      err instanceof Error ? err.message : err,
    );
  }
  const allStarVaultView = currentOrg
    ? allStarVaultViewByOrg[currentOrg]
    : CONTENT_ORGS.some((orgId) => allStarVaultViewByOrg[orgId]);

  const currentSite = currentOrg ? getSiteConfigForOrg(currentOrg) : null;
  const hasModuleAccess = (orgId: ContentOrgId, module: AdminModule) => {
    if (!isAdminModuleEnabledForOrg(orgId, module)) return false;
    if (module === "ALL_STAR_VAULT") {
      return adminUser.isMaster || allStarVaultViewByOrg[orgId];
    }
    const r = roleByOrg[orgId] ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
    return canAccessAdminModule(r, module);
  };

  const preferredOrgForModule = (module: AdminModule): ContentOrgId => {
    if (currentOrg) return currentOrg;
    return CONTENT_ORGS.find((orgId) => hasModuleAccess(orgId, module)) ?? CONTENT_ORGS[0];
  };

  const moduleHref = (basePath: string, module: AdminModule) =>
    `${basePath}?org=${preferredOrgForModule(module)}`;

  // "State of the organization" dashboard section -- scorecards/charts/
  // leaderboards above the module-launcher grid. Board Member+ only (same
  // bar as allowRolePreview); a Park Director still gets the plain grid.
  const showStateOfOrg = hasAdminRoleAtLeast(adminRole, "BOARD_MEMBER");
  const dashboardOrgs: ContentOrgId[] = currentOrg ? [currentOrg] : CONTENT_ORGS;
  let stateOfOrg: {
    registration: Awaited<ReturnType<typeof getRegistrationSummary>>;
    compliance: Awaited<ReturnType<typeof getComplianceSummary>>;
    engagement: Awaited<ReturnType<typeof getEngagementSummary>>;
    boardContact: Awaited<ReturnType<typeof getBoardContactSummary>>;
    needsAttention: Awaited<ReturnType<typeof getNeedsAttentionSummary>>;
  } | null = null;
  if (showStateOfOrg) {
    try {
      const registration = await getRegistrationSummary(dashboardOrgs);
      const [compliance, engagement, boardContact] = await Promise.all([
        getComplianceSummary(dashboardOrgs, registration.perDivision),
        getEngagementSummary(dashboardOrgs),
        getBoardContactSummary(dashboardOrgs),
      ]);
      const needsAttention = await getNeedsAttentionSummary(dashboardOrgs, compliance, boardContact);
      stateOfOrg = { registration, compliance, engagement, boardContact, needsAttention };
    } catch (err) {
      console.error(
        "Admin dashboard state-of-org summary failed (continuing with plain module grid):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const liveDashboardOrgs = dashboardOrgs.filter((orgId) => isSeasonLiveForOrg(orgId));
  const roleForOrg = (orgId: ContentOrgId): AdminRole =>
    roleByOrg[orgId] ?? (adminUser.isMaster ? "MASTER_ADMIN" : adminRole);
  let inSeason: InSeasonBoardData | null = null;
  let seasonLinks: Partial<Record<ContentOrgId, SeasonDashboardLinks>> = {};
  let seasonFinance: Partial<Record<ContentOrgId, SeasonFinanceSlice>> = {};
  if (showStateOfOrg && liveDashboardOrgs.length > 0) {
    const operationsOrgs = liveDashboardOrgs.filter((orgId) =>
      hasAdminRoleAtLeast(roleForOrg(orgId), "ADMIN"),
    );
    seasonLinks = Object.fromEntries(
      liveDashboardOrgs.map((orgId) => [orgId, seasonDashboardLinks(orgId, roleForOrg(orgId))]),
    );
    if (stateOfOrg) {
      seasonFinance = Object.fromEntries(
        stateOfOrg.registration.byOrg
          .filter((row) => liveDashboardOrgs.includes(row.organizationId))
          .map((row) => [
            row.organizationId,
            {
              collectedCents: row.collectedCents,
              outstandingCents: row.outstandingCents,
              grossCents: row.grossCents,
              divisions: stateOfOrg.registration.perDivision
                .filter((division) => division.organizationId === row.organizationId)
                .map((division) => ({
                  ageGroup: division.ageGroup,
                  enrolled: division.enrolled,
                  rostered: division.rostered,
                  collectedCents: division.collectedCents,
                  grossCents: division.grossCents,
                })),
            } satisfies SeasonFinanceSlice,
          ]),
      );
    }
    const outstandingCentsByOrg: Partial<Record<ContentOrgId, number>> = {};
    for (const orgId of liveDashboardOrgs) {
      outstandingCentsByOrg[orgId] = seasonFinance[orgId]?.outstandingCents ?? 0;
    }
    try {
      inSeason = await loadInSeasonBoard({
        orgs: liveDashboardOrgs,
        outstandingCentsByOrg,
        operationsOrgs,
        includeDistrictIncome: allSitesRequested && adminUser.isMaster,
      });
    } catch (err) {
      console.error(
        "In-season board summary failed (continuing with the registration dashboard):",
        err instanceof Error ? err.message : err,
      );
    }
  }
  let parkDirectorGameDay: GameDayStatus[] = [];
  if (!inSeason && liveDashboardOrgs.length > 0) {
    const gameDayOrgs = liveDashboardOrgs.filter((orgId) => {
      const role = roleByOrg[orgId];
      return adminUser.isMaster || (role != null && hasAdminRoleAtLeast(role, "PARK_DIRECTOR"));
    });
    if (gameDayOrgs.length > 0) {
      try {
        parkDirectorGameDay = await loadGameDayStatuses(gameDayOrgs);
      } catch (err) {
        console.error(
          "Game day status failed (continuing without the rainout panel):",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  let directorParks: string[] = [];
  let directorDay = leagueCalendarDate();
  let directorPark: string | null = null;
  let directorPay: DayParkUmpirePay[] | null = null;
  let directorPayError: string | null = null;
  if (!showStateOfOrg) {
    try {
      directorParks = await loadDirectorParks(moduleOrgFallback);
    } catch (err) {
      console.error("Park director park list failed:", err instanceof Error ? err.message : err);
    }
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) directorDay = day;
    const requestedPark = park?.trim() || "";
    directorPark = directorParks.includes(requestedPark) ? requestedPark : null;
    if (directorPark) {
      try {
        directorPay = await loadParkDirectorUmpirePay({
          org: moduleOrgFallback,
          day: directorDay,
          parkName: directorPark,
        });
      } catch (err) {
        directorPayError = "Umpire pay could not be loaded for this day.";
        console.error("Park director umpire pay failed:", err instanceof Error ? err.message : err);
      }
    }
  }
  const syncByOrg: Partial<Record<ContentOrgId, AssignrSyncView>> = Object.fromEntries(
    (inSeason?.sync ?? []).map((row) => [row.organizationId, row]),
  );
  const operationsByOrg: Partial<Record<ContentOrgId, OperationsView>> = Object.fromEntries(
    (inSeason?.operations ?? []).map((row) => [row.organizationId, row]),
  );

  const cards = sortAdminDashboardCards([
    {
      module: "USERS" as AdminModule,
      href: `/admin/people?org=${moduleOrgFallback}`,
      title: "People & Access Hub",
      description: masterMode
        ? "Accounts, volunteer compliance cards (JDP / Abuse Awareness), coaching interest, and Master Role Assignments."
        : "Directory, volunteer compliance cards, coaching interest, and organization access.",
      action: masterMode ? "Open People Hub" : "Open People",
    },
    {
      module: "SEASON_SETUP" as AdminModule,
      href: `/admin/season-setup?org=${moduleOrgFallback}`,
      title: "Season Setup",
      description: "Track season-setup progress: registration, coaches, drafts, jerseys, and schedule.",
      action: "Open Season Setup",
    },
    {
      module: "TEAMS" as AdminModule,
      href: `/admin/competition?org=${moduleOrgFallback}`,
      title: "Competition & Play Hub",
      description: masterMode
        ? "Teams & rosters, game scores, Fall Ball scheduler, Assignr umpires, SportsConnect imports, and registration windows."
        : "Manage team rosters, game scores, scheduler, and Assignr umpires in one place.",
      action: masterMode ? "Open Competition Hub" : "Open Competition",
    },
    {
      module: "TOURNAMENT_BRACKETS" as AdminModule,
      href: `/admin/park?org=${moduleOrgFallback}`,
      title: "Park & Tournament Hub",
      description: masterMode
        ? "Bracket creator, tournament monitor readiness, rainout alerts, and park rules/field layouts."
        : "Build brackets, monitor alerts, post rainouts, and manage park rules.",
      action: masterMode ? "Open Park Hub" : "Open Park Desk",
    },
    {
      module: "COMMUNICATIONS" as AdminModule,
      href: `/admin/publishing?org=${moduleOrgFallback}`,
      title: "Publishing & Comms Center",
      description: masterMode
        ? "Email broadcast campaigns (Resend), news announcements, Facebook post drafts, Dugout moderation, and shared Drive files."
        : "Publish emails, news stories, social posts, moderate dugout feed, and open shared files.",
      action: masterMode ? "Open Publishing Center" : "Open Publishing",
    },
    {
      module: "ENROLLMENT_KPI" as AdminModule,
      href: `/admin/enrollment?org=${moduleOrgFallback}`,
      title: "Enrollment & KPIs",
      description: masterMode
        ? "Registration counts, revenue collected vs. outstanding, fee-tier breakdown, and team fill status across organizations."
        : "Registration counts, revenue collected vs. outstanding, fee-tier breakdown, and team rosters at a glance.",
      action: "Open Enrollment & KPIs",
    },
    {
      module: "ALL_STAR_PAYMENTS" as AdminModule,
      href: `/admin/orders?org=${moduleOrgFallback}`,
      title: "Orders & Commerce Desk",
      description: masterMode
        ? "Fulfill cap orders, manage championship shirt orders, review merch catalog PayPal links, sponsors, and payment reports."
        : "Cap orders, championship shirt orders, merch shop catalog, and payment audit log.",
      action: masterMode ? "Open Orders Desk" : "Open Orders",
    },
    {
      module: "ALL_STAR_VAULT" as AdminModule,
      href: moduleHref("/admin/all-star", "ALL_STAR_VAULT"),
      title: "All-Star Program",
      description: masterMode
        ? "Vault, payments, cap orders, and shirt orders for All-Star season work across organizations."
        : "Vault (cycles & ballots), payments, cap orders, and championship shirt orders in one program.",
      action: masterMode ? "Open All-Star Program" : "Open All-Star",
    },
  ].map((card) => ({
    ...card,
    category: getAdminDashboardCategory(card.module)!,
  })));

  const visibleModuleCount = cards.length;
  const liveSeasonLabel = currentOrg
    ? getSeasonConfigForOrg(currentOrg).label
    : null;
  const currentOrgIsLive = currentOrg ? isSeasonLiveForOrg(currentOrg) : false;
  const targetExplanation = currentOrg
    ? currentOrgIsLive
      ? `Operating on behalf of ${getOrgDisplayName(currentOrg)} — ${liveSeasonLabel} is the live season.`
      : `Operating on behalf of ${getOrgDisplayName(currentOrg)} (${liveSeasonLabel}).`
    : "Showing tools available across all sites.";

  const statusChips = [
    {
      label: "Selected Site",
      value: currentOrg
        ? getOrgDisplayName(currentOrg)
        : masterMode
        ? "AP Baseball Master"
        : getOrgDisplayName(getDefaultContentOrg()),
    },
    {
      label: "Target Site",
      value: currentOrg ? getOrgDisplayName(currentOrg) : "All Sites",
    },
    { label: "Visible Modules", value: visibleModuleCount + " available" },
    {
      label: "Communications",
      value: communicationsEnabled ? "Available" : "Disabled",
    },
    {
      label: "Endpoint",
      value: currentSite ? currentSite.siteUrl.replace("https://", "") : "Aggregate view",
      href: currentSite ? currentSite.siteUrl : undefined,
    },
  ];

  const oversightCards = [
    {
      title: "Organization Target",
      value: currentOrg ? getOrgDisplayName(currentOrg) : "All Sites",
      detail: currentOrg
        ? `Operations currently pointed at ${currentSite?.name}.`
        : "Showing tools available across your sites. Cards pick an eligible site when they need one.",
    },
    {
      title: "Publishing Scope",
      value: masterMode ? "Cross-site capable" : "Single-site",
      detail: masterMode
        ? "Switch target org at any time without leaving the control plane."
        : "Admin actions apply only to this organization.",
    },
    {
      title: "Operator",
      value: displayName,
      detail: masterMode
        ? "Authenticated for AP Baseball administrative control."
        : "Authenticated for organization-level operations.",
    },
  ];

  return (
    <main
      className={`min-h-screen py-10 text-white sm:py-14 ${
        masterMode
          ? "bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_22%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_24%),linear-gradient(180deg,#09090b,#111827_45%,#09090b)]"
          : "bg-zinc-950"
      }`}
    >
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className={`mb-8 ${
            masterMode
              ? "rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(9,9,11,0.98))] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.35)] sm:rounded-4xl sm:p-8"
              : ""
          }`}
        >
          <div
            className={
              masterMode
                ? "flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between"
                : ""
            }
          >
            <div>
              <div
                className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px] ${
                  masterMode
                    ? "border border-red-500/30 bg-red-500/10 text-red-100"
                    : "bg-brand-purple"
                }`}
              >
                {masterMode ? (
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                ) : null}
                {masterMode ? "AP BASEBALL CONTROL CENTER" : "ADMIN DASHBOARD"}
              </div>
              <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-5xl">
                {masterMode
                  ? "Command and Control for AP Baseball"
                  : `Welcome, ${displayName}`}
              </h1>
              <p className="text-zinc-400 max-w-3xl">
                {masterMode
                  ? "Direct operations for Gonzales DYB, Ascension Little League, and AP Baseball Fall Ball from a single administrative surface. Switch target sites, publish updates, manage access, and monitor league operations without dropping context."
                  : showStateOfOrg
                    ? "Manage users, publish league updates, and moderate dugout posts from one place."
                    : "Rainouts, scoreboard controllers, umpire cards, scores, and umpire pay. In that order."}
              </p>
              <div className="mt-5 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                <span className="font-semibold text-white">Selected target: </span>
                {targetExplanation}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4 xl:min-w-[320px] xl:max-w-90">
              {masterMode ? (
                <AdminOrgSwitcher currentOrg={currentOrg} currentPath="/admin" />
              ) : null}
              <AdminRolePreviewControl
                enabled={allowRolePreview}
                currentOrg={currentOrg ?? undefined}
                allowViewByUser={adminUser.isMaster}
              />
              {masterMode ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
                    Active Operator
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {displayName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {adminUser.email}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {masterMode ? (
            <div className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
              {oversightCards.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/75 p-4 sm:p-5"
                >
                  <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                    {item.title}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {item.value}
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">{item.detail}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {masterMode ? (
          <div className="mb-8 space-y-3">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {statusChips.map((item) => (
                <div
                  key={item.label}
                  className="rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-2 sm:px-4"
                >
                  <span className="mr-2 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                    {item.label}
                  </span>
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-zinc-200"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-zinc-200">
                      {item.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!showStateOfOrg ? (
          <ParkDirectorScope
            org={moduleOrgFallback}
            parks={directorParks}
            day={directorDay}
            selectedPark={directorPark}
          />
        ) : null}

        {inSeason ? (
          <InSeasonBoard
            pictures={inSeason.pictures}
            gameDayByOrg={Object.fromEntries(inSeason.gameDays.map((row) => [row.organizationId, row]))}
            syncByOrg={syncByOrg}
            operationsByOrg={operationsByOrg}
            linksByOrg={seasonLinks}
            financeByOrg={seasonFinance}
            district={inSeason.district}
            districtHref={
              allSitesRequested && adminUser.isMaster ? "/admin/reports/tournament-income" : null
            }
          />
        ) : parkDirectorGameDay.length > 0 ? (
          <div className="mb-8 space-y-4">
            {parkDirectorGameDay.map((status) => (
              <GameDayPanel key={status.organizationId} status={status} />
            ))}
          </div>
        ) : null}

        {stateOfOrg ? (
          <div className="mb-8 space-y-6">
            {inSeason ? null : <RegistrationRevenueSection summary={stateOfOrg.registration} />}
            <div className="grid gap-6 lg:grid-cols-2">
              <ComplianceSection summary={stateOfOrg.compliance} />
              <EngagementSection summary={stateOfOrg.engagement} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <BoardContactWidget summary={stateOfOrg.boardContact} />
              <NeedsAttentionPanel summary={stateOfOrg.needsAttention} hideZeros={Boolean(inSeason)} />
            </div>
          </div>
        ) : null}

        {showStateOfOrg ? (
          <AdminDashboardModuleGrid
            cards={cards}
            masterMode={masterMode}
            allowRolePreview={allowRolePreview}
            allStarVaultView={allStarVaultView}
            currentOrg={currentOrg}
          />
        ) : (
          <>
            <ParkDirectorMenu org={moduleOrgFallback} />
            <section id="umpire-pay" className="mt-10 scroll-mt-24 space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Umpire pay</h2>
                <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                  {directorPark
                    ? `${directorPark} on ${directorDay}.`
                    : "Choose the park you are working at."}
                </p>
              </div>
              {!(directorPay && directorPay.length > 0) ? (
                <p className="text-sm text-amber-100">
                  Sample names so you can see the layout. These are not real assignments
                  {directorPayError ? ", and live pay did not load for this day." : "."}
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Umpire&apos;s name</th>
                      <th className="px-3 py-2">Games umpired</th>
                      <th className="px-3 py-2">Total pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(directorPay && directorPay.length > 0 ? directorPay : SAMPLE_UMPIRE_PAY).map((row) => (
                      <tr key={row.umpireId} className="border-t border-zinc-800">
                        <td className="px-3 py-3 text-white">{row.name}</td>
                        <td className="px-3 py-3">{row.games}</td>
                        <td className="px-3 py-3">
                          {row.totalPay.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
