/**
 * Master Admin left-sidebar accordion nav: Group > Subcategory > leaf item.
 * Subcategory ids/labels reuse ADMIN_DASHBOARD_CATEGORY_META (the taxonomy
 * already used to group the /admin dashboard cards) so this isn't a
 * second, driftable copy of the same grouping.
 */
import { ADMIN_DASHBOARD_CATEGORY_META } from "@/lib/admin/dashboardModules";
import { withDashboardView } from "@/lib/admin/gameDay/landing";
import {
  getMinimumRoleForModule,
  hasAdminRoleAtLeast,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { isSetupSeasonMode, type SeasonMode } from "@/lib/season/mode";
import { isAdminModuleEnabledForOrg, isMasterDeployment, type ContentOrgId } from "@/lib/siteConfig";

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

/**
 * The allow-check AdminSidebar uses for each leaf.
 * `ordersModuleEnabled` is read on the server and passed in. Do not read
 * `ORDERS_ENABLED` here: this runs in the client bundle.
 */
export function sidebarAllowsModule(input: {
  module: AdminModule;
  orgId: ContentOrgId | null;
  role: AdminRole | null;
  ordersModuleEnabled: boolean;
}): boolean {
  if (input.module === "ORDERS" && !input.ordersModuleEnabled) return false;
  if (!isAdminModuleEnabledForOrg(input.orgId, input.module)) return false;
  if (!input.role) return true;
  return hasAdminRoleAtLeast(input.role, getMinimumRoleForModule(input.module));
}

/**
 * Org query for a sidebar or header link.
 * Season Setup keeps `spring`. Every other module maps it to Gonzales so the
 * link does not arrive as an unknown org and fall through to Fall Ball.
 */
export function orgQueryForAdminHref(basePath: string, orgParam: string): string {
  if (orgParam !== "spring") return orgParam;
  const path = basePath.split("?")[0] ?? basePath;
  if (path === "/admin/season-setup" || path.startsWith("/admin/season-setup/")) return "spring";
  return "gonzales";
}

/** A leaf that's its own real page (no ?tab=/?section= needed) -- just append the org param, if any. */
function leafHref(basePath: string, orgSuffix: string): string {
  if (orgSuffix.startsWith("?org=")) {
    const orgParam = decodeURIComponent(orgSuffix.slice("?org=".length));
    const mapped = orgQueryForAdminHref(basePath, orgParam);
    if (mapped !== orgParam) return `${basePath}?org=${encodeURIComponent(mapped)}`;
  }
  return `${basePath}${orgSuffix}`;
}

export function buildAdminSidebarNav(
  allowModule: AllowModuleFn,
  canCoachingInterest: boolean,
  orgSuffix: string,
  masterDeployment = isMasterDeployment(),
): AdminSidebarNav {
  const people: AdminSidebarSubcategory = {
    id: "people",
    label: ADMIN_DASHBOARD_CATEGORY_META.people.label,
    leaves: [
      ...(allowModule("USERS") ? [{ id: "directory", label: "Directory", href: leafHref("/admin/users", orgSuffix) }] : []),
      ...(allowModule("VOLUNTEERS")
        ? [{ id: "volunteer-cards", label: "Volunteer Cards", href: leafHref("/admin/volunteers", orgSuffix) }]
        : []),
      ...(allowModule("ROLE_ASSIGNMENT")
        ? [{ id: "role-assignment", label: "Role Assignment", href: leafHref("/admin/roles", orgSuffix) }]
        : []),
      ...(canCoachingInterest
        ? [{ id: "coaching-interest", label: "Coaching Interest", href: leafHref("/admin/coaching-interest", orgSuffix) }]
        : []),
    ],
  };

  const competition: AdminSidebarSubcategory = {
    id: "competition",
    label: ADMIN_DASHBOARD_CATEGORY_META.competition.label,
    leaves: [
      ...(allowModule("SEASON_SETUP")
        ? [{ id: "season-setup", label: "Season Setup", href: leafHref("/admin/season-setup", orgSuffix) }]
        : []),
      ...(allowModule("DIVISION_AGES")
        ? [
            {
              id: "division-ages",
              label: "Division Ages",
              href: leafHref("/admin/season-setup/division-ages", orgSuffix),
            },
          ]
        : []),
      ...(allowModule("TEAMS")
        ? [{ id: "teams", label: "Teams & Rosters", href: leafHref("/admin/teams", orgSuffix) }]
        : []),
      ...(allowModule("SPORTS_CONNECT")
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
      ...(allowModule("SCHEDULER")
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
      ...(allowModule("GAME_DAY")
        ? [
            { id: "game-day", label: "Game Day", href: leafHref("/admin/game-day", orgSuffix) },
            { id: "game-day-remotes", label: "Remotes", href: leafHref("/admin/game-day/remotes", orgSuffix) },
          ]
        : []),
      ...(allowModule("TOURNAMENT_BRACKETS")
        ? [{ id: "brackets", label: "Tournament Brackets", href: leafHref("/admin/tournament-brackets", orgSuffix) }]
        : []),
      ...(allowModule("PARK_ALERTS") || allowModule("TOURNAMENT_ALERTS")
        ? [{ id: "alerts", label: "Park & Tournament Alerts", href: leafHref("/admin/alerts", orgSuffix) }]
        : []),
      ...(masterDeployment && allowModule("VENUES")
        ? [{ id: "parks", label: "Parks", href: leafHref("/admin/parks", orgSuffix) }]
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
        ? [{ id: "comms", label: "Communications", href: leafHref("/admin/communications", orgSuffix) }]
        : []),
      ...(allowModule("NEWS_ADMIN")
        ? [{ id: "news", label: "News Publishing", href: leafHref("/admin/news", orgSuffix) }]
        : []),
      ...(allowModule("SOCIAL_MEDIA")
        ? [{ id: "social", label: "Social Media", href: leafHref("/admin/social", orgSuffix) }]
        : []),
      ...(allowModule("DUGOUT_MODERATION")
        ? [{ id: "dugout", label: "Dugout Moderation", href: leafHref("/admin/dugout", orgSuffix) }]
        : []),
      ...(allowModule("ORG_DOCUMENTS")
        ? [{ id: "drive", label: "Org Documents", href: leafHref("/admin/documents", orgSuffix) }]
        : []),
      // Surveys stay under Publishing. Moving them under Comms is a later slice.
      ...(allowModule("SURVEYS")
        ? [{ id: "surveys", label: "Surveys", href: leafHref("/admin/surveys", orgSuffix) }]
        : []),
    ],
  };

  const orders: AdminSidebarSubcategory = {
    id: "orders",
    label: ADMIN_DASHBOARD_CATEGORY_META.orders.label,
    leaves: [
      ...(allowModule("ORDERS")
        ? [
            { id: "caps", label: "Cap Orders", href: leafHref("/admin/cap-orders", orgSuffix) },
            { id: "shirts", label: "Shirt Orders", href: leafHref("/admin/shirt-orders", orgSuffix) },
          ]
        : []),
      ...(allowModule("SPONSORS")
        ? [{ id: "sponsors", label: "Sponsors", href: leafHref("/admin/sponsors", orgSuffix) }]
        : []),
      ...(allowModule("REPORTS")
        ? [{ id: "umpire-pay", label: "Umpire Pay", href: leafHref("/admin/reports/umpire-pay", orgSuffix) }]
        : []),
      ...(allowModule("REPORTS") || allowModule("ENROLLMENT_KPI") || allowModule("TEAMS") || allowModule("VOLUNTEERS")
        ? [{ id: "reports", label: "Reports", href: leafHref("/admin/reports", orgSuffix) }]
        : []),
    ],
  };

  const allstar: AdminSidebarSubcategory = {
    id: "allstar",
    label: ADMIN_DASHBOARD_CATEGORY_META.allstar.label,
    leaves: allowModule("ALL_STAR_VAULT")
      ? [
          { id: "vault", label: "All-Star Vault", href: leafHref("/admin/all-star", orgSuffix) },
          { id: "travel", label: "Travel Desk", href: leafHref("/admin/travel", orgSuffix) },
        ]
      : [],
  };

  const withLeaves = (subs: AdminSidebarSubcategory[]) => subs.filter((s) => s.leaves.length > 0);

  const groups: AdminSidebarGroup[] = [
    { id: "operations", label: "Operations", subcategories: withLeaves([people, competition, park]) },
    { id: "program", label: "Program & Commerce", subcategories: withLeaves([publishing, orders, allstar]) },
  ].filter((g) => g.subcategories.length > 0);

  return { dashboardHref: withDashboardView(leafHref("/admin", orgSuffix)), groups };
}

/** Same leaves, setup order. Unknown modes keep the order buildAdminSidebarNav emitted. */
const SETUP_LEAF_ORDER: Record<string, readonly string[]> = {
  competition: [
    "season-setup",
    "division-ages",
    "registration",
    "sports-connect",
    "teams",
    "draft",
    "scores",
    "scheduler",
    "assignr",
    "enrollment-kpi",
  ],
  park: ["parks", "game-day-remotes", "facilities", "game-day", "brackets", "alerts"],
};

export function applySeasonSidebarOrder(
  nav: AdminSidebarNav,
  mode: SeasonMode | null | undefined,
): AdminSidebarNav {
  if (!isSetupSeasonMode(mode)) return nav;
  return {
    ...nav,
    groups: nav.groups.map((group) => ({
      ...group,
      subcategories: group.subcategories.map((sub) => {
        const order = SETUP_LEAF_ORDER[sub.id];
        if (!order) return sub;
        const rank = new Map(order.map((id, index) => [id, index]));
        const indexed = sub.leaves.map((leaf, index) => ({ leaf, index }));
        indexed.sort((a, b) => {
          const aRank = rank.get(a.leaf.id);
          const bRank = rank.get(b.leaf.id);
          if (aRank == null && bRank == null) return a.index - b.index;
          if (aRank == null) return 1;
          if (bRank == null) return -1;
          return aRank - bRank;
        });
        return { ...sub, leaves: indexed.map((entry) => entry.leaf) };
      }),
    })),
  };
}
