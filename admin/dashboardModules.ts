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
    description: "Bracket creator, tournament monitors, rainout alerts, and field rules.",
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
  USERS: { category: "people", sortOrder: 10 },
  VOLUNTEERS: { category: "people", sortOrder: 11 },
  ROLE_ASSIGNMENT: { category: "people", sortOrder: 12 },
  TEAMS: { category: "competition", sortOrder: 10 },
  DRAFT: { category: "competition", sortOrder: 15 },
  SCORES: { category: "competition", sortOrder: 20 },
  ENROLLMENT_KPI: { category: "competition", sortOrder: 25 },
  ASSIGNR: { category: "competition", sortOrder: 30 },
  REGISTRATION_WINDOWS: { category: "competition", sortOrder: 40 },
  TOURNAMENT_BRACKETS: { category: "park", sortOrder: 10 },
  TOURNAMENT_ALERTS: { category: "park", sortOrder: 20 },
  PARK_ALERTS: { category: "park", sortOrder: 30 },
  PARK_INFO: { category: "park", sortOrder: 40 },
  COMMUNICATIONS: { category: "publishing", sortOrder: 10 },
  NEWS_ADMIN: { category: "publishing", sortOrder: 20 },
  SOCIAL_MEDIA: { category: "publishing", sortOrder: 30 },
  DUGOUT_MODERATION: { category: "publishing", sortOrder: 40 },
  ORG_DOCUMENTS: { category: "publishing", sortOrder: 50 },
  ALL_STAR_PAYMENTS: { category: "orders", sortOrder: 10 },
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
  return (
    getAdminDashboardSortOrder(left.module) - getAdminDashboardSortOrder(right.module)
  );
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
