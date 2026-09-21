import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";
import {
  CREDIT_CARD_PROCESSING_FEE_RATE,
  ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER,
  PARISH_REC_SHARE_RATE,
} from "@/lib/enrollment/feeConstants";
import type { EnrollmentKpiSummary } from "@/lib/enrollment/kpi";

export type ParishEnrollmentRow = {
  fullName: string;
  ageGroup: string;
  teamName: string;
  address: string;
  dob: string;
  feeDescription: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  paymentStatus: string;
};

export type ParishPaidByAmount = {
  amountCents: number;
  count: number;
  collectedCents: number;
};

export type ParishEnrollmentSummary = EnrollmentKpiSummary & {
  parishRecDueCents: number;
  paidByAmount: ParishPaidByAmount[];
};

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

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function formatParishAddress(input: {
  streetAddress?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string {
  const street = [blankToNull(input.streetAddress), blankToNull(input.unit)].filter(Boolean).join(", ");
  const city = blankToNull(input.city);
  const stateZip = [blankToNull(input.state), blankToNull(input.postalCode)].filter(Boolean).join(" ");
  const locality = [city, stateZip].filter(Boolean).join(", ");
  const line = [street, locality].filter(Boolean).join(", ");
  return line || "—";
}

export function formatParishDob(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const iso = date.toISOString().slice(0, 10);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "—";
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function parishRecDueCents(netDueCents: number): number {
  return Math.max(0, Math.round(netDueCents * PARISH_REC_SHARE_RATE));
}

/** $0 registrations stay internal; they are not sent to the parish. */
export function parishOutboundRows(rows: ParishEnrollmentRow[]): ParishEnrollmentRow[] {
  return rows.filter((row) => row.amountCents > 0);
}

export function groupParishPaidByAmount(rows: ParishEnrollmentRow[]): ParishPaidByAmount[] {
  const byAmount = new Map<number, ParishPaidByAmount>();
  for (const row of parishOutboundRows(rows)) {
    const existing = byAmount.get(row.amountCents) ?? {
      amountCents: row.amountCents,
      count: 0,
      collectedCents: 0,
    };
    existing.count += 1;
    existing.collectedCents += row.paidCents;
    byAmount.set(row.amountCents, existing);
  }
  return [...byAmount.values()].sort((a, b) => b.amountCents - a.amountCents);
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
): ParishEnrollmentSummary {
  const reportable = parishOutboundRows(rows);
  const totalEnrollments = reportable.length;
  const grossCents = reportable.reduce((sum, row) => sum + row.amountCents, 0);
  const collectedCents = reportable.reduce((sum, row) => sum + row.paidCents, 0);
  const outstandingCents = reportable.reduce((sum, row) => sum + row.balanceCents, 0);
  const ccProcessingFeeCents = Math.round(collectedCents * CREDIT_CARD_PROCESSING_FEE_RATE);
  const onlineFeeCents = totalEnrollments * ONLINE_REGISTRATION_FEE_CENTS_PER_PLAYER;
  const netDueCents = collectedCents - ccProcessingFeeCents - onlineFeeCents;
  const rosteredByAge = new Map(original.perDivision.map((row) => [row.ageGroup, row.rostered]));

  const perDivision = groupParishEnrollmentByDivision(reportable).map((group) => {
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
        for (const row of reportable) {
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
    netDueCents,
    parishRecDueCents: parishRecDueCents(netDueCents),
    feeTierBreakdown,
    paidByAmount: groupParishPaidByAmount(reportable),
    perDivision,
  };
}
