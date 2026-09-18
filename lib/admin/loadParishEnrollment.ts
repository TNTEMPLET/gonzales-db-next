import "server-only";

import { getEnrollmentKpiSummary } from "@/lib/enrollment/kpi";
import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";
import {
  capParishEnrollmentRow,
  formatParishAddress,
  formatParishDob,
  rebuildParishEnrollmentSummary,
  resolveParishRegistrationFeeCents,
  type ParishEnrollmentRow,
} from "@/lib/admin/parishEnrollmentMoney";
import {
  buildParishIncomePdf,
  buildParishRegistrationPdf,
  parishEnrollmentCsv,
} from "@/lib/admin/parishEnrollmentReport";
import prisma from "@/lib/prisma";

export async function loadParishEnrollmentRows(params: {
  organizationId: string;
  seasonYear: number;
}): Promise<ParishEnrollmentRow[]> {
  const rows = await prisma.enrollment.findMany({
    where: { organizationId: params.organizationId, seasonYear: params.seasonYear },
    select: {
      fullName: true,
      firstName: true,
      lastName: true,
      ageGroup: true,
      teamNameRaw: true,
      birthDate: true,
      streetAddress: true,
      unit: true,
      city: true,
      state: true,
      postalCode: true,
      orderDetailDescription: true,
      amountCents: true,
      amountPaidCents: true,
      balanceCents: true,
      orderPaymentStatus: true,
    },
    orderBy: [{ ageGroup: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
  return rows
    .map((row) => ({
      fullName: row.fullName || [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
      ageGroup: row.ageGroup,
      teamName: row.teamNameRaw?.trim() || "Unassigned",
      address: formatParishAddress({
        streetAddress: row.streetAddress,
        unit: row.unit,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
      }),
      dob: formatParishDob(row.birthDate),
      feeDescription: row.orderDetailDescription?.trim() || "—",
      amountCents: row.amountCents ?? 0,
      paidCents: row.amountPaidCents ?? 0,
      balanceCents: row.balanceCents ?? 0,
      paymentStatus: row.orderPaymentStatus?.trim() || "—",
    }))
    .sort(
      (a, b) =>
        sortTeamsManagementAgeGroups(a.ageGroup, b.ageGroup) || a.fullName.localeCompare(b.fullName),
    );
}

export async function loadParishEnrollmentReport(params: {
  organizationId: string;
  seasonYear: number;
  orgName: string;
  seasonLabel: string;
}) {
  const [rawSummary, rawRows, stored] = await Promise.all([
    getEnrollmentKpiSummary({ organizationId: params.organizationId, seasonYear: params.seasonYear }),
    loadParishEnrollmentRows({ organizationId: params.organizationId, seasonYear: params.seasonYear }),
    prisma.seasonOrgSettings.findUnique({
      where: {
        organizationId_seasonYear: {
          organizationId: params.organizationId,
          seasonYear: params.seasonYear,
        },
      },
      select: { parishRegistrationFeeCents: true },
    }),
  ]);
  const capCents = resolveParishRegistrationFeeCents({
    organizationId: params.organizationId,
    storedCents: stored?.parishRegistrationFeeCents,
  });
  const rows = rawRows.map((row) => capParishEnrollmentRow(row, capCents));
  const summary = rebuildParishEnrollmentSummary(rows, rawSummary, capCents);
  const income = buildParishIncomePdf({
    orgName: params.orgName,
    seasonLabel: params.seasonLabel,
    summary,
  });
  const registration = buildParishRegistrationPdf({
    orgName: params.orgName,
    seasonLabel: params.seasonLabel,
    rows,
  });
  return {
    incomePdf: income.pdf,
    incomeFilename: income.filename,
    registrationPdf: registration.pdf,
    registrationFilename: registration.filename,
    csv: parishEnrollmentCsv(rows, params.orgName),
    csvFilename: registration.filename.replace(/\.pdf$/, ".csv"),
    summary,
    rowCount: rows.length,
    capCents,
  };
}
