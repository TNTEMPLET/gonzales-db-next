import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";
import type { EnrollmentKpiSummary } from "@/lib/enrollment/kpi";

export type ParishEnrollmentRow = {
  fullName: string;
  ageGroup: string;
  teamName: string;
  feeDescription: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  paymentStatus: string;
};
import {
  CREDIT_CARD_PROCESSING_FEE_RATE,
  ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER,
} from "@/lib/enrollment/feeConstants";

export const FALLBALL_DEFAULT_PARISH_REGISTRATION_FEE_CENTS = 8000;

export function defaultParishRegistrationFeeCents(organizationId: string): number | null {
  if (organizationId === "fallball") return FALLBALL_DEFAULT_PARISH_REGISTRATION_FEE_CENTS;
  return null;
}

export function resolveParishRegistrationFeeCents(input: {
  organizationId: string;
  storedCents: number | null | undefined;
}): number | null {
  if (typeof input.storedCents === "number" && Number.isInteger(input.storedCents) && input.storedCents > 0) {
    return input.storedCents;
  }
  return defaultParishRegistrationFeeCents(input.organizationId);
}

export function capParishEnrollmentRow(
  row: ParishEnrollmentRow,
  capCents: number | null,
): ParishEnrollmentRow {
  if (capCents == null || capCents <= 0) return row;
  const amountCents = Math.min(row.amountCents, capCents);
  const paidCents = Math.min(row.paidCents, capCents);
  return {
    ...row,
    feeDescription: "Registration",
    amountCents,
    paidCents,
    balanceCents: Math.max(0, amountCents - paidCents),
  };
}

export function groupParishEnrollmentByDivision(
  rows: ParishEnrollmentRow[],
): { ageGroup: string; rows: ParishEnrollmentRow[] }[] {
  const groups = new Map<string, ParishEnrollmentRow[]>();
  for (const row of rows) {
    const key = row.ageGroup.trim() || "Unassigned";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => sortTeamsManagementAgeGroups(a, b))
    .map(([ageGroup, grouped]) => ({ ageGroup, rows: grouped }));
}

export function rebuildParishEnrollmentSummary(
  rows: ParishEnrollmentRow[],
  original: EnrollmentKpiSummary,
  capCents: number | null,
): EnrollmentKpiSummary {
  const totalEnrollments = rows.length;
  const grossCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const collectedCents = rows.reduce((sum, row) => sum + row.paidCents, 0);
  const outstandingCents = rows.reduce((sum, row) => sum + row.balanceCents, 0);
  const ccProcessingFeeCents = Math.round(collectedCents * CREDIT_CARD_PROCESSING_FEE_RATE);
  const onlineFeeCents = totalEnrollments * ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER;
  const rosteredByAge = new Map(original.perDivision.map((row) => [row.ageGroup, row.rostered]));

  const perDivision = groupParishEnrollmentByDivision(rows).map((group) => {
    const enrolled = group.rows.length;
    const rostered = rosteredByAge.get(group.ageGroup) ?? 0;
    return {
      ageGroup: group.ageGroup,
      enrolled,
      rostered,
      unrostered: Math.max(0, enrolled - rostered),
      grossCents: group.rows.reduce((sum, row) => sum + row.amountCents, 0),
      collectedCents: group.rows.reduce((sum, row) => sum + row.paidCents, 0),
    };
  });

  const feeTierBreakdown = capCents
    ? [
        {
          orderDetailDescription: "Registration",
          count: totalEnrollments,
          grossCents,
          collectedCents,
        },
      ]
    : (() => {
        const byFee = new Map<string, { count: number; grossCents: number; collectedCents: number }>();
        for (const row of rows) {
          const key = row.feeDescription || "(unspecified)";
          const existing = byFee.get(key) ?? { count: 0, grossCents: 0, collectedCents: 0 };
          existing.count += 1;
          existing.grossCents += row.amountCents;
          existing.collectedCents += row.paidCents;
          byFee.set(key, existing);
        }
        return [...byFee.entries()]
          .map(([orderDetailDescription, value]) => ({ orderDetailDescription, ...value }))
          .sort((a, b) => b.count - a.count);
      })();

  return {
    ...original,
    totalEnrollments,
    grossCents,
    collectedCents,
    outstandingCents,
    ccProcessingFeeCents,
    onlineFeeCents,
    netDueCents: collectedCents - ccProcessingFeeCents - onlineFeeCents,
    feeTierBreakdown,
    perDivision,
  };
}
