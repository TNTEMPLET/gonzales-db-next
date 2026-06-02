import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  toAdminRole,
  type AdminModule,
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
  type ContentOrgId,
} from "@/lib/siteConfig";
import { isCommunicationsModuleEnabled } from "@/lib/communications/config";
import prisma from "@/lib/prisma";
import { inferDefaultAdminTargetOrgForMasterDashboard } from "@/lib/auth/inferDefaultAdminTargetOrg";
import {
  getAdminDashboardCategory,
  sortAdminDashboardCards,
} from "@/lib/admin/dashboardModules";

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
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const masterMode = isMasterDeployment();
  const requestedOrg =
    org && CONTENT_ORGS.includes(org as ContentOrgId)
      ? (org as ContentOrgId)
      : null;

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin");
  }

  if (masterMode && !requestedOrg && !adminUser.isMaster) {
    const inferred = await inferDefaultAdminTargetOrgForMasterDashboard(
      adminUser.id,
      adminUser.email,
      adminUser.isMaster,
    );
    if (inferred) {
      redirect(`/admin?org=${inferred}`);
    }
  }

  const currentOrg = masterMode ? requestedOrg : getDefaultContentOrg();

  const displayName =
    [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") ||
    adminUser.name ||
    adminUser.email;
  const roleByOrg = {
    gonzales:
      (await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, "gonzales")) ??
      toAdminRole(adminUser.role, adminUser.isMaster),
    ascension:
      (await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, "ascension")) ??
      toAdminRole(adminUser.role, adminUser.isMaster),
  };
  const adminRole = currentOrg ? roleByOrg[currentOrg] : toAdminRole(adminUser.role, adminUser.isMaster);
  const allowRolePreview = hasAdminRoleAtLeast(adminRole, "ADMIN");
  const communicationsEnabled = isCommunicationsModuleEnabled();
  const allStarLinkedUsers = await prisma.registeredUser.findMany({
    where: { email: { equals: adminUser.email, mode: "insensitive" } },
    select: { id: true, organizationId: true },
  });
  const allStarVaultViewByOrg: Record<ContentOrgId, boolean> = {
    gonzales: false,
    ascension: false,
  };
  for (const row of allStarLinkedUsers) {
    if (row.organizationId !== "gonzales" && row.organizationId !== "ascension") continue;
    if (await canViewAllStarVault(row.id, row.organizationId)) {
      allStarVaultViewByOrg[row.organizationId] = true;
    }
  }
  const allStarVaultView = currentOrg
    ? allStarVaultViewByOrg[currentOrg]
    : allStarVaultViewByOrg.gonzales || allStarVaultViewByOrg.ascension;

  const currentSite = currentOrg ? getSiteConfigForOrg(currentOrg) : null;
  const hasModuleAccess = (orgId: ContentOrgId, module: AdminModule) => {
    if (module === "ALL_STAR_VAULT") {
      return adminUser.isMaster || allStarVaultViewByOrg[orgId];
    }
    return canAccessAdminModule(roleByOrg[orgId], module);
  };
  const hasModuleAnyOrg = (module: AdminModule) =>
    hasModuleAccess("gonzales", module) || hasModuleAccess("ascension", module);
  const preferredOrgForModule = (module: AdminModule): ContentOrgId => {
    if (currentOrg) return currentOrg;
    if (hasModuleAccess("ascension", module)) return "ascension";
    return "gonzales";
  };
  const moduleHref = (basePath: string, module: AdminModule) =>
    `${basePath}?org=${preferredOrgForModule(module)}`;
  const cards = sortAdminDashboardCards(
    [
      {
        module: "TEAMS" as AdminModule,
        href: moduleHref("/admin/teams", "TEAMS"),
        title: "Teams Management",
        description: masterMode
          ? "Import players, build rosters, assign coaches, and maintain team operations by site."
          : "Manage team rosters, coach assignments, and season setup.",
        action: masterMode ? "Open Teams Console" : "Open Teams",
      },
      {
        module: "SCORES" as AdminModule,
        href: moduleHref("/admin/scores", "SCORES"),
        title: "Scores & Standings",
        description: masterMode
          ? "Capture game outcomes, correct results, and keep standings accurate for the selected site."
          : "Enter game scores and automatically power standings by age group.",
        action: masterMode ? "Open Game Ops" : "Open Score Entry",
      },
      {
        module: "ALL_STAR_VAULT" as AdminModule,
        href: moduleHref("/admin/all-star", "ALL_STAR_VAULT"),
        title: "All-Star Vault",
        description: masterMode
          ? "Manage All-Star voting cycles, invitations, and exports for both organizations."
          : "Manage All-Star voting cycles and ballot administration.",
        action: masterMode ? "Open All-Star Vault" : "Open All-Star",
      },
      {
        module: "ALL_STAR_VAULT" as AdminModule,
        href: moduleHref("/admin/payments", "ALL_STAR_VAULT"),
        title: "All-Star Payments",
        description: masterMode
          ? "Track All-Star fee collection across all organizations, grouped by roster."
          : "Track All-Star fee payments per player for each finalized roster.",
        action: "Open Payments",
      },
      {
        module: "ALL_STAR_VAULT" as AdminModule,
        href: moduleHref("/admin/cap-orders", "ALL_STAR_VAULT"),
        title: "Parent Cap Orders",
        description: masterMode
          ? "View and export All-Star cap orders submitted by parents via PayPal, grouped by organization."
          : "View and export All-Star cap orders submitted by parents via PayPal.",
        action: "View Cap Orders",
      },
      {
        module: "TOURNAMENT_BRACKETS" as AdminModule,
        href: "/admin/tournament-brackets",
        title: "Tournament Brackets",
        description:
          "Master-only: tournament brackets for any event—auto single-elim from seeds, preview, optional XLSX import, HTML export, flyer PDF.",
        action: "Open Bracket Creator",
      },
      {
        module: "SPONSORS" as AdminModule,
        href: moduleHref("/admin/sponsors", "SPONSORS"),
        title: "Sponsors",
        description: masterMode
          ? "Manage sponsorship packages, logo assets, and site placements for footer sponsorship visibility."
          : "Manage sponsors, package enrollments, and footer logo display.",
        action: masterMode ? "Open Sponsors Console" : "Open Sponsors",
      },
      {
        module: "NEWS_ADMIN" as AdminModule,
        href: moduleHref("/news/admin", "NEWS_ADMIN"),
        title: "News Management",
        description: masterMode
          ? "Coordinate announcements, featured stories, and publishing cadence from the AP Baseball desk."
          : "Create, edit, publish, and delete site news posts.",
        action: masterMode ? "Open Content Desk" : "Open News Admin",
      },
      {
        module: "SOCIAL_MEDIA" as AdminModule,
        href: "/admin/social",
        title: "Social media",
        description: masterMode
          ? "Draft posts for the shared AP Baseball Facebook Page (not per league site)."
          : "Compose posts and publish to your Facebook Page (Meta credentials required).",
        action: masterMode ? "Open Social Desk" : "Open Social Media",
      },
      {
        module: "COMMUNICATIONS" as AdminModule,
        href: moduleHref("/admin/communications", "COMMUNICATIONS"),
        title: "Communications",
        description: masterMode
          ? "Coordinate approved broadcast communications across organizations with audience targeting."
          : "Send approved organization communications by audience rules and roles.",
        action: masterMode ? "Open Comms Hub" : "Open Communications",
      },
      {
        module: "ORG_DOCUMENTS" as AdminModule,
        href: "/admin/documents",
        title: "Google Drive",
        description: masterMode
          ? "Open the shared AP Baseball Google Drive folder for policies, templates, and org files."
          : "Open the shared Google Drive folder for organizational documents.",
        action: masterMode ? "Open Google Drive" : "Open Google Drive",
      },
      {
        module: "ASSIGNR" as const,
        href: "/admin/assignr",
        title: "Assignr",
        description: masterMode
          ? "Connect roster, schedule, and registration workflows with Assignr read/write access."
          : "Connect roster, schedule, and registration workflows with Assignr.",
        action: masterMode ? "Open Assignr Hub" : "Open Assignr",
      },
      {
        module: "USERS" as AdminModule,
        href: moduleHref("/admin/users", "USERS"),
        title: "User Management",
        description: masterMode
          ? "Control admin access, role elevation, and account governance for the active organization."
          : "Promote/demote admins and manage user access roles.",
        action: masterMode ? "Open Access Console" : "Open Users",
      },
      {
        module: "REPORTS" as AdminModule,
        href: moduleHref("/admin/reports", "REPORTS"),
        title: "Reporting",
        description: masterMode
          ? "Run umpire payout reports and operational summaries from the AP Baseball reporting desk."
          : "Generate umpire reports and payout summaries.",
        action: masterMode ? "Open Reporting Desk" : "Open Reports",
      },
      {
        module: "PARK_ALERTS" as AdminModule,
        href: moduleHref("/admin/alerts", "PARK_ALERTS"),
        title: "Park Alerts",
        description: masterMode
          ? "Post manual rainout alerts on either site that override Assignr detection and expire automatically."
          : "Post a rainout alert on the public site. Overrides Assignr detection and expires automatically.",
        action: masterMode ? "Open Alerts Console" : "Open Park Alerts",
      },
      {
        module: "DUGOUT_MODERATION" as AdminModule,
        href: moduleHref("/admin/dugout", "DUGOUT_MODERATION"),
        title: "Dugout Moderation",
        description: masterMode
          ? "Monitor internal coach conversations and enforce moderation standards from one command post."
          : "Edit or remove any post in The Dugout feed.",
        action: masterMode ? "Open Dugout Watch" : "Open Dugout Moderation",
      },
    ]
      .map((card) => ({
        ...card,
        category: getAdminDashboardCategory(card.module)!,
      }))
      .filter((card) => (card.module === "COMMUNICATIONS" ? communicationsEnabled : true))
      .filter((card) =>
        card.module === "ASSIGNR"
          ? currentOrg
            ? hasModuleAccess(currentOrg, "ASSIGNR")
            : hasModuleAnyOrg("ASSIGNR")
          : currentOrg
            ? hasModuleAccess(currentOrg, card.module)
            : hasModuleAnyOrg(card.module),
      ),
  );

  const statusChips = [
    {
      label: "Platform",
      value: masterMode
        ? "AP Baseball Master"
        : getOrgDisplayName(getDefaultContentOrg()),
    },
    { label: "Target Site", value: currentOrg ? getOrgDisplayName(currentOrg) : "Not selected" },
    {
      label: "Endpoint",
      value: currentSite ? currentSite.siteUrl.replace("https://", "") : "Select a target site",
      href: currentSite ? currentSite.siteUrl : undefined,
    },
  ];

  const oversightCards = [
    {
      title: "Organization Target",
      value: currentOrg ? getOrgDisplayName(currentOrg) : "Not selected",
      detail: currentOrg
        ? `Operations currently pointed at ${currentSite?.name}.`
        : "Choose a target site or continue with access-based module defaults.",
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
                  ? "Direct operations for Gonzales DYB and Ascension Little League from a single administrative surface. Switch target sites, publish updates, manage access, and monitor league operations without dropping context."
                  : "Manage users, publish league updates, and moderate dugout posts from one place."}
              </p>
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
          <div className="mb-8 flex flex-wrap gap-2 sm:gap-3">
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
        ) : null}

        <AdminDashboardModuleGrid
          cards={cards}
          masterMode={masterMode}
          allowRolePreview={allowRolePreview}
          allStarVaultView={allStarVaultView}
          currentOrg={currentOrg}
        />
      </section>
    </main>
  );
}
