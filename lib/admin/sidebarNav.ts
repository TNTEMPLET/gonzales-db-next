/**
 * Master Admin left-sidebar accordion nav: Group > Subcategory > leaf item.
 * Subcategory ids/labels reuse ADMIN_DASHBOARD_CATEGORY_META (the taxonomy
 * already used to group the /admin dashboard's hub cards) so this isn't a
 * second, driftable copy of the same grouping.
 */
import type { AdminModule } from "@/lib/auth/adminRoles";
import { ADMIN_DASHBOARD_CATEGORY_META } from "@/lib/admin/dashboardModules";

export type AdminSidebarLeaf = {
  id: string;
  label: string;
  href: string;
};

export type AdminSidebarSubcategory = {
  id: string;
  label: string;
  leaves: AdminSidebarLeaf[];
};

export type AdminSidebarGroup = {
  id: string;
  label: string;
  subcategories: AdminSidebarSubcategory[];
};

export type AdminSidebarNav = {
  dashboardHref: string;
  groups: AdminSidebarGroup[];
};

type AllowModuleFn = (module: AdminModule) => boolean;

/** People needs an org to render at all -- default to gonzales like the old top-nav link did. */
function peopleHref(section: string, orgSuffix: string): string {
  const suffix = orgSuffix || "?org=gonzales";
  return `/admin/people${suffix}&section=${section}`;
}

/** Every other hub tolerates no org param (cross-org/default view). */
function hubHref(basePath: string, orgSuffix: string, tabValue: string): string {
  return orgSuffix ? `${basePath}${orgSuffix}&tab=${tabValue}` : `${basePath}?tab=${tabValue}`;
}

/** A leaf that's its own real page (no ?tab=/?section= needed) -- just append the org param, if any. */
function leafHref(basePath: string, orgSuffix: string): string {
  return `${basePath}${orgSuffix}`;
}

export function buildAdminSidebarNav(
  allowModule: AllowModuleFn,
  canCoachingInterest: boolean,
  orgSuffix: string,
): AdminSidebarNav {
  const people: AdminSidebarSubcategory = {
    id: "people",
    label: ADMIN_DASHBOARD_CATEGORY_META.people.label,
    leaves: [
      ...(allowModule("USERS") ? [{ id: "directory", label: "Directory", href: peopleHref("directory", orgSuffix) }] : []),
      ...(allowModule("VOLUNTEERS")
        ? [{ id: "volunteer-cards", label: "Volunteer Cards", href: peopleHref("volunteers", orgSuffix) }]
        : []),
      ...(allowModule("ROLE_ASSIGNMENT")
        ? [{ id: "role-assignment", label: "Role Assignment", href: peopleHref("roles", orgSuffix) }]
        : []),
      ...(canCoachingInterest
        ? [{ id: "coaching-interest", label: "Coaching Interest", href: peopleHref("coaching-interest", orgSuffix) }]
        : []),
    ],
  };

  const competitionVisible =
    allowModule("TEAMS") ||
    allowModule("DRAFT") ||
    allowModule("SCORES") ||
    allowModule("ASSIGNR") ||
    allowModule("REGISTRATION_WINDOWS");
  const competition: AdminSidebarSubcategory = {
    id: "competition",
    label: ADMIN_DASHBOARD_CATEGORY_META.competition.label,
    leaves: [
      ...(allowModule("TEAMS")
        ? [{ id: "teams", label: "Teams & Rosters", href: leafHref("/admin/teams", orgSuffix) }]
        : []),
      // Scheduler / SportsConnect Import have no dedicated AdminModule --
      // each page gates on the same "competitionVisible" OR-check, so match
      // that here too: show whenever the subcategory itself is.
      ...(competitionVisible
        ? [
            {
              id: "sports-connect",
              label: "Import Registration Data",
              href: leafHref("/admin/sports-connect", orgSuffix),
            },
          ]
        : []),
      ...(allowModule("ENROLLMENT_KPI")
        ? [
            {
              id: "enrollment-kpi",
              label: "Enrollment & KPIs",
              href: leafHref("/admin/enrollment", orgSuffix),
            },
          ]
        : []),
      ...(allowModule("DRAFT")
        ? [{ id: "draft", label: "Online Draft", href: leafHref("/admin/draft", orgSuffix) }]
        : []),
      ...(allowModule("SCORES")
        ? [{ id: "scores", label: "Scores & Standings", href: leafHref("/admin/scores", orgSuffix) }]
        : []),
      ...(competitionVisible
        ? [{ id: "scheduler", label: "Scheduler", href: leafHref("/admin/scheduler", orgSuffix) }]
        : []),
      ...(allowModule("ASSIGNR")
        ? [{ id: "assignr", label: "Umpire Desk (Assignr)", href: leafHref("/admin/assignr", orgSuffix) }]
        : []),
      ...(allowModule("REGISTRATION_WINDOWS")
        ? [
            {
              id: "registration",
              label: "Registration Windows",
              href: leafHref("/admin/registration", orgSuffix),
            },
          ]
        : []),
    ],
  };

  const park: AdminSidebarSubcategory = {
    id: "park",
    label: ADMIN_DASHBOARD_CATEGORY_META.park.label,
    leaves: [
      ...(allowModule("TOURNAMENT_BRACKETS")
        ? [{ id: "brackets", label: "Tournament Brackets", href: leafHref("/admin/tournament-brackets", orgSuffix) }]
        : []),
      ...(allowModule("PARK_ALERTS") || allowModule("TOURNAMENT_ALERTS")
        ? [{ id: "alerts", label: "Park & Tournament Alerts", href: leafHref("/admin/alerts", orgSuffix) }]
        : []),
      ...(allowModule("PARK_INFO")
        ? [{ id: "facilities", label: "Park Info", href: leafHref("/admin/park-info", orgSuffix) }]
        : []),
    ],
  };

  const publishing: AdminSidebarSubcategory = {
    id: "publishing",
    label: ADMIN_DASHBOARD_CATEGORY_META.publishing.label,
    leaves: [
      ...(allowModule("COMMUNICATIONS")
        ? [{ id: "comms", label: "Communications", href: hubHref("/admin/publishing", orgSuffix, "comms") }]
        : []),
      ...(allowModule("NEWS_ADMIN")
        ? [{ id: "news", label: "News Publishing", href: hubHref("/admin/publishing", orgSuffix, "news") }]
        : []),
      ...(allowModule("SOCIAL_MEDIA")
        ? [{ id: "social", label: "Social Media", href: hubHref("/admin/publishing", orgSuffix, "social") }]
        : []),
      ...(allowModule("DUGOUT_MODERATION")
        ? [{ id: "dugout", label: "Dugout Moderation", href: hubHref("/admin/publishing", orgSuffix, "dugout") }]
        : []),
      ...(allowModule("ORG_DOCUMENTS")
        ? [{ id: "drive", label: "Org Documents", href: hubHref("/admin/publishing", orgSuffix, "drive") }]
        : []),
      // Surveys shares TEAMS' gate today (no dedicated module) -- placed
      // here per explicit product decision, not a Competition & Play leaf.
      ...(allowModule("TEAMS")
        ? [{ id: "surveys", label: "Surveys", href: `/admin/surveys${orgSuffix}` }]
        : []),
    ],
  };

  // Cap Orders / Shirt Orders have no dedicated AdminModule (same situation
  // as Scheduler/SportsConnect above) -- fall back to the subcategory's own
  // visibility rather than a per-module gate.
  const ordersVisible = allowModule("SPONSORS") || allowModule("REPORTS");
  const orders: AdminSidebarSubcategory = {
    id: "orders",
    label: ADMIN_DASHBOARD_CATEGORY_META.orders.label,
    leaves: [
      // OrdersHub.tsx's real OrdersTab type is "caps"|"shirts"|"sponsors"|"reports"
      // only -- no "shop"/"payments" tab exists, so those are deliberately
      // omitted rather than linking to a tab that would crash the page.
      ...(ordersVisible
        ? [
            { id: "caps", label: "Cap Orders", href: hubHref("/admin/orders", orgSuffix, "caps") },
            { id: "shirts", label: "Shirt Orders", href: hubHref("/admin/orders", orgSuffix, "shirts") },
          ]
        : []),
      ...(allowModule("SPONSORS")
        ? [{ id: "sponsors", label: "Sponsors", href: hubHref("/admin/orders", orgSuffix, "sponsors") }]
        : []),
      ...(allowModule("REPORTS")
        ? [{ id: "reports", label: "Umpire Pay Reports", href: hubHref("/admin/orders", orgSuffix, "reports") }]
        : []),
    ],
  };

  const allstar: AdminSidebarSubcategory = {
    id: "allstar",
    label: ADMIN_DASHBOARD_CATEGORY_META.allstar.label,
    leaves: allowModule("ALL_STAR_VAULT")
      ? [
          { id: "vault", label: "All-Star Vault", href: `/admin/all-star${orgSuffix}` },
          { id: "travel", label: "Travel Desk", href: `/admin/travel${orgSuffix}` },
        ]
      : [],
  };

  const withLeaves = (subs: AdminSidebarSubcategory[]) => subs.filter((s) => s.leaves.length > 0);

  const groups: AdminSidebarGroup[] = [
    { id: "operations", label: "Operations", subcategories: withLeaves([people, competition, park]) },
    { id: "program", label: "Program & Commerce", subcategories: withLeaves([publishing, orders, allstar]) },
  ].filter((g) => g.subcategories.length > 0);

  return { dashboardHref: `/admin${orgSuffix}`, groups };
}
