import type { AdminModule } from "@/lib/auth/adminRoles";

export const ADMIN_DASHBOARD_CATEGORIES = [
  "program",
  "publishing",
  "operations",
  "integrations",
  "community",
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
  program: {
    label: "Program",
    description: "Season setup, standings, sponsors, and All-Star operations.",
  },
  publishing: {
    label: "Publishing",
    description: "News, social, and organization communications.",
  },
  operations: {
    label: "Operations",
    description: "Access governance, reporting, and back-office administration.",
  },
  integrations: {
    label: "Integrations",
    description: "External services connected to AP Baseball administration.",
  },
  community: {
    label: "Community",
    description: "Coach and community moderation for internal league channels.",
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
  TEAMS: { category: "program", sortOrder: 10 },
  SCORES: { category: "program", sortOrder: 20 },
  ALL_STAR_VAULT: { category: "program", sortOrder: 30 },
  SPONSORS: { category: "program", sortOrder: 40 },
  NEWS_ADMIN: { category: "publishing", sortOrder: 10 },
  SOCIAL_MEDIA: { category: "publishing", sortOrder: 20 },
  COMMUNICATIONS: { category: "publishing", sortOrder: 30 },
  ORG_DOCUMENTS: { category: "integrations", sortOrder: 10 },
  ASSIGNR: { category: "integrations", sortOrder: 20 },
  USERS: { category: "operations", sortOrder: 10 },
  REPORTS: { category: "operations", sortOrder: 20 },
  DUGOUT_MODERATION: { category: "community", sortOrder: 10 },
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
