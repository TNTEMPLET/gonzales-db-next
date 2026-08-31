import "server-only";

import prisma from "@/lib/prisma";
import { getAllActiveOrgAlerts } from "@/lib/orgAlerts";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { countOpenPlayerNameCollisions } from "@/lib/sportsConnect/playerNameCollisions";
import type { ContentOrgId } from "@/lib/siteConfig";
import type { ComplianceSummary } from "./complianceSummary";
import type { BoardContactSummary } from "./boardContactSummary";

export type NeedsAttentionItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export type NeedsAttentionSummary = {
  items: NeedsAttentionItem[];
};

/**
 * Checklist of concrete, actionable counts -- every item links straight to
 * the hub that resolves it. Deliberately not a generic "alerts" system:
 * OrgAlert (lib/orgAlerts.ts) only models weather/park closures, not a
 * general alert feed, so this assembles real counts from each domain's own
 * data instead of inventing new alert infrastructure.
 */
export async function getNeedsAttentionSummary(
  orgs: ContentOrgId[],
  compliance: ComplianceSummary,
  boardContact: BoardContactSummary,
): Promise<NeedsAttentionSummary> {
  const [unfulfilledCaps, unfulfilledShirts, pendingCoachingLeads, activeAlerts, openEquipmentCheckouts, playerNameCollisionCounts] =
    await Promise.all([
      prisma.capOrderItem.count({
        where: { status: { not: "fulfilled" }, order: { org: { in: orgs } } },
      }),
      prisma.shirtOrderItem.count({
        where: { status: { not: "fulfilled" }, order: { org: { in: orgs } } },
      }),
      prisma.coachingInterestSubmission.count({
        where: { status: "NEW", organizationId: { in: orgs } },
      }),
      getAllActiveOrgAlerts(),
      prisma.equipmentCheckout.count({
        where: { status: "open", organizationId: { in: orgs } },
      }),
      Promise.all(
        orgs.map((org) =>
          countOpenPlayerNameCollisions({ organizationId: org, seasonYear: getSeasonConfigForOrg(org).year }),
        ),
      ),
    ]);
  const openPlayerNameCollisions = playerNameCollisionCounts.reduce((sum, n) => sum + n, 0);

  const items: NeedsAttentionItem[] = [
    {
      key: "board-contact",
      label: "Open board contact requests",
      count: boardContact.openCount,
      href: "/admin/surveys?view=contacts",
    },
    {
      key: "volunteer-compliance",
      label: "Coaches/volunteers expired or blocked",
      count: compliance.readiness.EXPIRED + compliance.readiness.BLOCKED,
      href: "/admin/people",
    },
    {
      key: "cap-orders",
      label: "Unfulfilled cap orders",
      count: unfulfilledCaps,
      href: "/admin/orders",
    },
    {
      key: "shirt-orders",
      label: "Unfulfilled shirt orders",
      count: unfulfilledShirts,
      href: "/admin/orders",
    },
    {
      key: "coaching-leads",
      label: "New coaching interest leads",
      count: pendingCoachingLeads,
      href: "/admin/people",
    },
    {
      key: "park-alerts",
      label: "Active park/weather closures",
      count: activeAlerts.filter((a) => orgs.includes(a.organizationId as ContentOrgId)).length,
      href: "/admin/park",
    },
    {
      key: "equipment-checkout",
      label: "Coaches without equipment picked up",
      count: openEquipmentCheckouts,
      href: "/admin/competition?tab=teams",
    },
    {
      key: "player-name-collisions",
      label: "Player names to review",
      count: openPlayerNameCollisions,
      href: "/admin/competition?tab=sports-connect",
    },
  ];

  return { items };
}
