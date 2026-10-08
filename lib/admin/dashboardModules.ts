import type { AdminModule } from "@/lib/auth/adminRoles";

export const ADMIN_DASHBOARD_CATEGORIES = [
  "people",
  "competition",
  "park",
  "publishing",
  "orders",
  "allstar",
] as const;

export type AdminDashboardCategory = (typeof ADMIN_DASHBOARD_CATEGORIES)[number];

export const ADMIN_DASHBOARD_CATEGORY_ORDER: AdminDashboardCategory[] = [
  ...ADMIN_DASHBOARD_CATEGORIES,
];

type CategoryMeta = {
  label: string;
  description: string;
};

export const ADMIN_DASHBOARD_CATEGORY_META: Record<
  AdminDashboardCategory,
  CategoryMeta
> = {
  people: {
    label: "People & Access",
    description: "Accounts, volunteer compliance (JDP & Abuse Awareness), coaching leads, and admin role assignments.",
  },
  competition: {
    label: "Competition & Play",
    description: "Teams, game scores, season scheduler, umpires (Assignr), SportsConnect imports, and registration windows.",
  },
  park: {
    label: "Park & Tournaments",
    description: "Bracket creator, shared parks, tournament monitors, rainout alerts, and field rules.",
  },
  publishing: {
    label: "Publishing & Comms",
    description: "Email campaigns (Resend), news publishing, social media, dugout feed moderation, and shared Google Drive.",
  },
  orders: {
    label: "Orders & Commerce",
    description: "Cap orders, championship shirt orders, merch shop catalog, sponsors, and payment audit logs.",
  },
  allstar: {
    label: "All-Star Program",
    description: "Vault (cycles & ballots), candidate rosters, voting, and final roster overrides.",
  },
};

export const ADMIN_DASHBOARD_INTEGRATION_MODULES = ["ASSIGNR"] as const;

export type AdminDashboardIntegrationModule =
  (typeof ADMIN_DASHBOARD_INTEGRATION_MODULES)[number];

export type AdminDashboardCardModule = AdminModule | AdminDashboardIntegrationModule;

const moduleCatalog: Record<
  AdminDashboardCardModule,
  { category: AdminDashboardCategory; sortOrder: number } | null
> = {
  DASHBOARD: null,
  // Opened from Season Setup and the sidebar. No dashboard card in this slice.
  DIVISION_AGES: null,
  USERS: { category: "people", sortOrder: 10 },
  VOLUNTEERS: { category: "people", sortOrder: 11 },
  ROLE_ASSIGNMENT: { category: "people", sortOrder: 12 },
  SEASON_SETUP: { category: "competition", sortOrder: 5 },
  TEAMS: { category: "competition", sortOrder: 10 },
  SPORTS_CONNECT: { category: "competition", sortOrder: 12 },
  DRAFT: { category: "competition", sortOrder: 15 },
  SCORES: { category: "competition", sortOrder: 20 },
  SCHEDULER: { category: "competition", sortOrder: 22 },
  ENROLLMENT_KPI: { category: "competition", sortOrder: 25 },
  ASSIGNR: { category: "competition", sortOrder: 30 },
  REGISTRATION_WINDOWS: { category: "competition", sortOrder: 40 },
  TOURNAMENT_BRACKETS: { category: "park", sortOrder: 10 },
  TOURNAMENT_ALERTS: { category: "park", sortOrder: 20 },
  PARK_ALERTS: { category: "park", sortOrder: 30 },
  VENUES: { category: "park", sortOrder: 35 },
  PARK_INFO: { category: "park", sortOrder: 40 },
  GAME_DAY: { category: "park", sortOrder: 50 },
  COMMUNICATIONS: { category: "publishing", sortOrder: 10 },
  NEWS_ADMIN: { category: "publishing", sortOrder: 20 },
  SOCIAL_MEDIA: { category: "publishing", sortOrder: 30 },
  DUGOUT_MODERATION: { category: "publishing", sortOrder: 40 },
  ORG_DOCUMENTS: { category: "publishing", sortOrder: 50 },
  SURVEYS: { category: "publishing", sortOrder: 60 },
  ALL_STAR_PAYMENTS: { category: "orders", sortOrder: 10 },
  ORDERS: { category: "orders", sortOrder: 12 },
  SPONSORS: { category: "orders", sortOrder: 20 },
  REPORTS: { category: "orders", sortOrder: 30 },
  ALL_STAR_VAULT: { category: "allstar", sortOrder: 10 },
};

export type AdminDashboardCardDescriptor = {
  module: AdminDashboardCardModule;
  category: AdminDashboardCategory;
  href: string;
  title: string;
  description: string;
  action: string;
  comingSoon?: boolean;
  /** Overrides the module catalog order when several cards share a module. */
  sortOrder?: number;
};

export function getAdminDashboardCategory(
  module: AdminDashboardCardModule,
): AdminDashboardCategory | null {
  return moduleCatalog[module]?.category ?? null;
}

export function getAdminDashboardSortOrder(module: AdminDashboardCardModule): number {
  return moduleCatalog[module]?.sortOrder ?? Number.MAX_SAFE_INTEGER;
}

function compareDashboardCards(
  left: AdminDashboardCardDescriptor,
  right: AdminDashboardCardDescriptor,
) {
  const leftCategoryIndex = ADMIN_DASHBOARD_CATEGORY_ORDER.indexOf(left.category);
  const rightCategoryIndex = ADMIN_DASHBOARD_CATEGORY_ORDER.indexOf(right.category);
  if (leftCategoryIndex !== rightCategoryIndex) {
    return leftCategoryIndex - rightCategoryIndex;
  }
  const leftOrder = left.sortOrder ?? getAdminDashboardSortOrder(left.module);
  const rightOrder = right.sortOrder ?? getAdminDashboardSortOrder(right.module);
  return leftOrder - rightOrder;
}

export function sortAdminDashboardCards<T extends AdminDashboardCardDescriptor>(
  cards: T[],
): T[] {
  return [...cards].sort(compareDashboardCards);
}

export function groupAdminDashboardCards<T extends AdminDashboardCardDescriptor>(
  cards: T[],
): Array<{ category: AdminDashboardCategory; cards: T[] }> {
  const sortedCards = sortAdminDashboardCards(cards);
  const groups = new Map<AdminDashboardCategory, T[]>();

  for (const card of sortedCards) {
    const existing = groups.get(card.category);
    if (existing) {
      existing.push(card);
      continue;
    }
    groups.set(card.category, [card]);
  }

  return ADMIN_DASHBOARD_CATEGORY_ORDER.flatMap((category) => {
    const categoryCards = groups.get(category);
    if (!categoryCards?.length) return [];
    return [{ category, cards: categoryCards }];
  });
}

/** Legacy hub routes. They still redirect; dashboard cards must not link here. */
export const ADMIN_HUB_PATHS = [
  "/admin/people",
  "/admin/competition",
  "/admin/park",
  "/admin/publishing",
  "/admin/orders",
] as const;

export type AdminHubPath = (typeof ADMIN_HUB_PATHS)[number];

export function isAdminHubHref(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return (ADMIN_HUB_PATHS as readonly string[]).includes(path);
}

export type AdminDashboardCardSpec = {
  module: AdminDashboardCardModule;
  /**
   * Visible when any of these modules is allowed.
   * Defaults to the card's own module. Use this when the destination page
   * allows more than one module (alerts, reports).
   */
  accessModules?: readonly AdminModule[];
  path: string;
  title: string;
  description: string;
  action: string;
  sortOrder?: number;
};

/**
 * One card per real admin page. Hub URLs stay as bookmark redirects only.
 * Cap and shirt orders use ORDERS. Alerts is one page for park and tournament alerts.
 * Reports stays visible when any of its source modules is allowed.
 */
export const ADMIN_DASHBOARD_CARD_SPECS: readonly AdminDashboardCardSpec[] = [
  {
    module: "USERS",
    path: "/admin/users",
    title: "Directory",
    description: "Accounts and the registered directory for this organization.",
    action: "Open Directory",
  },
  {
    module: "VOLUNTEERS",
    path: "/admin/volunteers",
    title: "Volunteer Cards",
    description: "JDP and Abuse Awareness compliance cards.",
    action: "Open Volunteer Cards",
  },
  {
    module: "ROLE_ASSIGNMENT",
    path: "/admin/roles",
    title: "Role Assignment",
    description: "Grant, change, and revoke organization admin roles.",
    action: "Open Role Assignment",
  },
  {
    module: "SEASON_SETUP",
    path: "/admin/season-setup",
    title: "Season Setup",
    description: "Track season-setup progress: registration, coaches, drafts, jerseys, and schedule.",
    action: "Open Season Setup",
  },
  {
    module: "TEAMS",
    path: "/admin/teams",
    title: "Teams & Rosters",
    description: "Rosters, coaches, and jersey numbers.",
    action: "Open Teams",
  },
  {
    module: "DRAFT",
    path: "/admin/draft",
    title: "Online Draft",
    description: "Live draft room, protections, and coach invites.",
    action: "Open Draft",
  },
  {
    module: "SCORES",
    path: "/admin/scores",
    title: "Scores & Standings",
    description: "Enter scores and review standings.",
    action: "Open Scores",
  },
  {
    module: "ENROLLMENT_KPI",
    path: "/admin/enrollment",
    title: "Enrollment & KPIs",
    description:
      "Registration counts, revenue collected vs. outstanding, fee-tier breakdown, and team rosters at a glance.",
    action: "Open Enrollment & KPIs",
  },
  {
    module: "ASSIGNR",
    path: "/admin/assignr",
    title: "Umpire Desk",
    description: "Assignr officials, game assignments, and umpire pay.",
    action: "Open Umpire Desk",
  },
  {
    module: "REGISTRATION_WINDOWS",
    path: "/admin/registration",
    title: "Registration Windows",
    description: "Open and close registration windows.",
    action: "Open Registration",
  },
  {
    module: "TOURNAMENT_BRACKETS",
    path: "/admin/tournament-brackets",
    title: "Tournament Brackets",
    description: "Build and publish tournament brackets.",
    action: "Open Brackets",
  },
  {
    module: "PARK_ALERTS",
    accessModules: ["PARK_ALERTS", "TOURNAMENT_ALERTS"],
    path: "/admin/alerts",
    title: "Park & Tournament Alerts",
    description: "Rainout alerts and tournament monitor messages.",
    action: "Open Alerts",
  },
  {
    module: "VENUES",
    path: "/admin/parks",
    title: "Parks",
    description: "Link each league's parks to one shared physical park.",
    action: "Open Parks",
  },
  {
    module: "PARK_INFO",
    path: "/admin/park-info",
    title: "Park Info",
    description: "Field rules and park layouts.",
    action: "Open Park Info",
  },
  {
    module: "COMMUNICATIONS",
    path: "/admin/communications",
    title: "Communications",
    description: "Email campaigns through Resend.",
    action: "Open Communications",
  },
  {
    module: "NEWS_ADMIN",
    path: "/admin/news",
    title: "News Publishing",
    description: "League news announcements.",
    action: "Open News",
  },
  {
    module: "SOCIAL_MEDIA",
    path: "/admin/social",
    title: "Social Media",
    description: "Facebook post drafts.",
    action: "Open Social",
  },
  {
    module: "DUGOUT_MODERATION",
    path: "/admin/dugout",
    title: "Dugout Moderation",
    description: "Review dugout posts and comments.",
    action: "Open Dugout",
  },
  {
    module: "ORG_DOCUMENTS",
    path: "/admin/documents",
    title: "Org Documents",
    description: "Shared Google Drive files.",
    action: "Open Documents",
  },
  {
    module: "ORDERS",
    path: "/admin/cap-orders",
    title: "Cap Orders",
    description: "Fulfill cap orders.",
    action: "Open Cap Orders",
    sortOrder: 10,
  },
  {
    module: "ORDERS",
    path: "/admin/shirt-orders",
    title: "Shirt Orders",
    description: "Championship shirt orders.",
    action: "Open Shirt Orders",
    sortOrder: 15,
  },
  {
    module: "SPONSORS",
    path: "/admin/sponsors",
    title: "Sponsors",
    description: "Sponsor records for this organization.",
    action: "Open Sponsors",
  },
  {
    module: "REPORTS",
    accessModules: ["REPORTS", "ENROLLMENT_KPI", "TEAMS", "VOLUNTEERS"],
    path: "/admin/reports",
    title: "Reports",
    description: "Parish, umpire pay, enrollment, and volunteer reports.",
    action: "Open Reports",
  },
  {
    module: "ALL_STAR_VAULT",
    path: "/admin/all-star",
    title: "All-Star Program",
    description: "Vault cycles, ballots, voting, and final roster overrides.",
    action: "Open All-Star",
  },
];

export function cardAccessModules(spec: AdminDashboardCardSpec): AdminModule[] {
  if (spec.accessModules && spec.accessModules.length > 0) {
    return [...spec.accessModules];
  }
  return [spec.module as AdminModule];
}

export function isAdminDashboardCardVisible(
  spec: AdminDashboardCardSpec,
  allowModule: (module: AdminModule) => boolean,
): boolean {
  return cardAccessModules(spec).some((module) => allowModule(module));
}

export function buildAdminDashboardCardDescriptors(input: {
  allowModule: (module: AdminModule) => boolean;
  orgFor: (spec: AdminDashboardCardSpec) => string;
}): AdminDashboardCardDescriptor[] {
  const descriptors: AdminDashboardCardDescriptor[] = [];
  for (const spec of ADMIN_DASHBOARD_CARD_SPECS) {
    if (!isAdminDashboardCardVisible(spec, input.allowModule)) continue;
    const category = getAdminDashboardCategory(spec.module);
    if (!category) continue;
    descriptors.push({
      module: spec.module,
      category,
      href: `${spec.path}?org=${input.orgFor(spec)}`,
      title: spec.title,
      description: spec.description,
      action: spec.action,
      ...(spec.sortOrder != null ? { sortOrder: spec.sortOrder } : {}),
    });
  }
  return sortAdminDashboardCards(descriptors);
}
