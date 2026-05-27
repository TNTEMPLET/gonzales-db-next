import { NextRequest, NextResponse } from "next/server";
// xlsx-js-style is a drop-in fork of xlsx with XLSX cell-style support (fill, font color, bold)
import * as XLSX from "xlsx-js-style";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

const ORG_LABELS: Record<ContentOrgId, string> = {
  gonzales: "Gonzales Diamond Baseball",
  ascension: "Ascension Little League",
};

const ALL_STAR_FEE_CENTS = 9500;

// ─── Team color → Excel fill / text color ────────────────────────────────────
// Light pastel backgrounds with dark matching text, matching the UI palette.
const TEAM_PALETTE: Record<string, { bg: string; fg: string }> = {
  NAVY:   { bg: "DBEAFE", fg: "1E40AF" }, // blue-100 / blue-800
  RED:    { bg: "FEE2E2", fg: "B91C1C" }, // red-100  / red-700
  PURPLE: { bg: "EDE9FE", fg: "6D28D9" }, // violet-100 / violet-700
  GOLD:   { bg: "FEF9C3", fg: "92400E" }, // yellow-100 / amber-800
};

type CellStyle = Record<string, unknown>;
type StyledCell = { v: string; t: "s"; s?: CellStyle };

function cell(value: string, style?: CellStyle): StyledCell {
  return style ? { v: value, t: "s", s: style } : { v: value, t: "s" };
}

function blankCells(count: number, style?: CellStyle): StyledCell[] {
  return Array.from({ length: count }, () => cell("", style));
}

// Bold dark header for a cycle/age-group section
const SECTION_STYLE: CellStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "1E293B" } }, // slate-900
  font: { bold: true, color: { rgb: "F1F5F9" }, sz: 11 },     // slate-100
};

// Column header row (top of each sheet)
const COL_HEADER_STYLE: CellStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "334155" } }, // slate-700
  font: { bold: true, color: { rgb: "F8FAFC" }, sz: 10 },     // slate-50
};

function rosterSubHeaderStyle(teamColor: string): CellStyle {
  const p = TEAM_PALETTE[teamColor.toUpperCase()] ?? { bg: "F1F5F9", fg: "334155" };
  return {
    fill: { patternType: "solid", fgColor: { rgb: p.bg } },
    font: { bold: true, color: { rgb: p.fg }, sz: 11 },
  };
}

// Extract the trailing team-color word from a rosterTag like "2026 - 11U - NAVY"
function parseTeamColor(rosterTag: string): string {
  const parts = rosterTag.split(" - ");
  return parts[parts.length - 1] ?? "";
}

const ORG_COL_NAMES = [
  "Age Group", "Player Name", "League Team", "Payer Name",
  "Amount", "Status", "Paid Date", "PayPal TX", "Notes",
];

export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminUser.isMaster) return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });

  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;

  const cycles = await prisma.allStarBallotCycle.findMany({
    where: year ? { seasonYear: year } : undefined,
    orderBy: [{ organizationId: "asc" }, { seasonYear: "desc" }, { ageGroup: "asc" }],
    select: {
      id: true, organizationId: true, seasonYear: true, ageGroup: true,
      allStarAgeGroupLabel: true, title: true,
    },
  });

  const cycleIds = cycles.map((c) => c.id);
  const allPayments = cycleIds.length
    ? await prisma.allStarPayment.findMany({
        where: { ballotCycleId: { in: cycleIds } },
        orderBy: [{ rosterTag: "asc" }, { team: "asc" }, { playerFullName: "asc" }],
      })
    : [];

  const paymentsByCycle = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const list = paymentsByCycle.get(p.ballotCycleId) ?? [];
    list.push(p);
    paymentsByCycle.set(p.ballotCycleId, list);
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary (unchanged structure) ───────────────────────────────
  const summaryRows: Record<string, string>[] = [];
  for (const orgId of CONTENT_ORGS) {
    const orgCycles = cycles.filter((c) => c.organizationId === orgId);
    if (orgCycles.length === 0) continue;

    summaryRows.push({
      League: ORG_LABELS[orgId],
      "Age Group / Cycle": "", Total: "", Paid: "", Unpaid: "",
      "$ Collected": "", "$ Outstanding": "",
    });

    let orgTotal = 0, orgPaid = 0;
    for (const cycle of orgCycles) {
      const payments = paymentsByCycle.get(cycle.id) ?? [];
      const paidCount = payments.filter((p) => p.isPaid).length;
      const unpaidCount = payments.length - paidCount;
      orgTotal += payments.length;
      orgPaid += paidCount;

      const cycleName = [cycle.allStarAgeGroupLabel || cycle.ageGroup, cycle.title]
        .filter(Boolean).join(" — ");
      summaryRows.push({
        League: "",
        "Age Group / Cycle": `  ${cycle.seasonYear} ${cycleName}`,
        Total: String(payments.length),
        Paid: String(paidCount),
        Unpaid: String(unpaidCount),
        "$ Collected": `$${((paidCount * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
        "$ Outstanding": `$${((unpaidCount * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
      });
    }

    const orgUnpaid = orgTotal - orgPaid;
    summaryRows.push({
      League: `  ${ORG_LABELS[orgId]} Total`,
      "Age Group / Cycle": "",
      Total: String(orgTotal),
      Paid: String(orgPaid),
      Unpaid: String(orgUnpaid),
      "$ Collected": `$${((orgPaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
      "$ Outstanding": `$${((orgUnpaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
    });
    summaryRows.push({
      League: "", "Age Group / Cycle": "", Total: "", Paid: "", Unpaid: "",
      "$ Collected": "", "$ Outstanding": "",
    });
  }

  const grandPaid = allPayments.filter((p) => p.isPaid).length;
  const grandUnpaid = allPayments.length - grandPaid;
  summaryRows.push({
    League: "GRAND TOTAL",
    "Age Group / Cycle": "",
    Total: String(allPayments.length),
    Paid: String(grandPaid),
    Unpaid: String(grandUnpaid),
    "$ Collected": `$${((grandPaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
    "$ Outstanding": `$${((grandUnpaid * ALL_STAR_FEE_CENTS) / 100).toFixed(2)}`,
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 32 }, { wch: 36 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheets 2+: one per org, grouped by age group → roster ───────────────
  for (const orgId of CONTENT_ORGS) {
    const orgCycles = cycles.filter((c) => c.organizationId === orgId);
    const N = ORG_COL_NAMES.length;
    // aoa = array-of-arrays; each inner array is one row of StyledCells
    const aoa: StyledCell[][] = [];

    // Column header row
    aoa.push(ORG_COL_NAMES.map((name) => cell(name, COL_HEADER_STYLE)));

    for (const cycle of orgCycles) {
      const payments = paymentsByCycle.get(cycle.id) ?? [];
      if (payments.length === 0) continue;

      const ageLabel = cycle.allStarAgeGroupLabel || cycle.ageGroup;
      const cycleName = [cycle.seasonYear, ageLabel, cycle.title].filter(Boolean).join(" — ");

      // Group payments by rosterTag (preserving order from DB sort)
      const byRosterTag = new Map<string, typeof payments>();
      for (const p of payments) {
        const tag = p.rosterTag ?? cycleName;
        const list = byRosterTag.get(tag) ?? [];
        list.push(p);
        byRosterTag.set(tag, list);
      }

      const isMultiRoster = byRosterTag.size > 1;

      if (isMultiRoster) {
        // ── Parent section header (dark slate — the age group) ──────────────
        aoa.push([
          cell(cycleName, SECTION_STYLE),
          ...blankCells(N - 1, SECTION_STYLE),
        ]);

        for (const [rosterTag, rosterPayments] of byRosterTag) {
          const teamColor = parseTeamColor(rosterTag);
          const subStyle = rosterSubHeaderStyle(teamColor);

          // ── Colored sub-header row (team color) ──────────────────────────
          aoa.push([
            cell(`  ${rosterTag}`, subStyle),
            ...blankCells(N - 1, subStyle),
          ]);

          // ── Player rows ──────────────────────────────────────────────────
          for (const p of rosterPayments) {
            aoa.push([
              cell(""),
              cell(p.playerFullName),
              cell(p.team),
              cell(p.payerName ?? ""),
              cell(`$${(p.amountCents / 100).toFixed(2)}`),
              cell(p.isPaid ? "PAID" : "UNPAID"),
              cell(p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US") : ""),
              cell(p.paypalTxId ?? ""),
              cell(p.notes ?? ""),
            ]);
          }
        }
      } else {
        // ── Single-roster: section header then flat player list ──────────
        aoa.push([
          cell(cycleName, SECTION_STYLE),
          ...blankCells(N - 1, SECTION_STYLE),
        ]);

        for (const p of payments) {
          aoa.push([
            cell(""),
            cell(p.playerFullName),
            cell(p.team),
            cell(p.payerName ?? ""),
            cell(`$${(p.amountCents / 100).toFixed(2)}`),
            cell(p.isPaid ? "PAID" : "UNPAID"),
            cell(p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-US") : ""),
            cell(p.paypalTxId ?? ""),
            cell(p.notes ?? ""),
          ]);
        }
      }

      // Blank spacer row between age groups
      aoa.push(blankCells(N));
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 34 }, { wch: 28 }, { wch: 24 }, { wch: 24 },
      { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 32 },
    ];

    const sheetName = orgId === "gonzales" ? "Gonzales DYB" : "Ascension LL";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const suffix = year ? `_${year}` : "_AllYears";
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AllStar_Payments_AllLeagues${suffix}.xlsx"`,
    },
  });
}
