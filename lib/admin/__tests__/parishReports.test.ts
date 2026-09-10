import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bookedPrepSlots, buildParishFieldPrepPdf, parishPrepDayCell } from "../parishFieldPrepReport";
import { buildFieldPrepCodes, fieldTokenFromName, parkCodeFromName } from "../fieldPrepCodes";
import { buildParishEnrollmentPdf, parishEnrollmentCsv } from "../parishEnrollmentReport";
import {
  capParishEnrollmentRow,
  groupParishEnrollmentByDivision,
  rebuildParishEnrollmentSummary,
  resolveParishRegistrationFeeCents,
  type ParishEnrollmentRow,
} from "../parishEnrollmentMoney";
import { parseReportEmails } from "../parseReportEmails";
import type { EnrollmentKpiSummary } from "@/lib/enrollment/kpi";
import { heatmapCellKey, type FieldCapacityHeatmap } from "../fieldCapacityHeatmap";
import { buildPayByParkPdf, buildPayByUmpirePdf } from "../umpirePayPdf";

describe("parish and umpire reports", () => {
  it("lists only booked heatmap cells for parish prep", () => {
    const grid: FieldCapacityHeatmap = {
      columns: [{ fieldId: "f1", label: "Field 1", parkLabel: "Paula" }],
      rows: [{ date: "2026-09-28", startTime: "17:45", dayLabel: "Mon" }],
      cells: {
        [heatmapCellKey("2026-09-28", "17:45", "f1")]: {
          status: "booked",
          divisions: ["4U TB"],
          game: { division: "4U TB", homeTeamName: "Yankees", awayTeamName: "Dodgers" },
        },
      },
      booked: 1,
      open: 0,
    };
    const slots = bookedPrepSlots(grid);
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.division, "4U TB");
    assert.equal(slots[0]?.parkLabel, "Paula");
  });

  it("marks a date booked if any time that night has a game", () => {
    const grid: FieldCapacityHeatmap = {
      columns: [{ fieldId: "f1", label: "Field 1", parkLabel: "Paula" }],
      rows: [
        { date: "2026-09-28", startTime: "17:45", dayLabel: "Mon" },
        { date: "2026-09-28", startTime: "19:15", dayLabel: "Mon" },
      ],
      cells: {
        [heatmapCellKey("2026-09-28", "17:45", "f1")]: {
          status: "open",
          divisions: ["4U TB"],
          game: null,
        },
        [heatmapCellKey("2026-09-28", "19:15", "f1")]: {
          status: "booked",
          divisions: ["8U CP"],
          game: { division: "8U CP", homeTeamName: "Astros", awayTeamName: "Cubs" },
        },
      },
      booked: 1,
      open: 1,
    };
    const cell = parishPrepDayCell(grid, "2026-09-28", "f1");
    assert.equal(cell.booked, true);
    assert.deepEqual(cell.divisions, ["8U CP"]);
    assert.equal(parishPrepDayCell(grid, "2026-09-29", "f1").booked, false);
  });

  it("builds an enrollment CSV with paid and balance", () => {
    const rows: ParishEnrollmentRow[] = [
      {
        fullName: "Jane Doe",
        ageGroup: "6U MOD",
        teamName: "Astros",
        feeDescription: "Fall Ball",
        amountCents: 12500,
        paidCents: 12500,
        balanceCents: 0,
        paymentStatus: "Paid",
      },
    ];
    const csv = parishEnrollmentCsv(rows, "AP Fall Ball");
    assert.match(csv, /AP Fall Ball/);
    assert.match(csv, /Jane Doe/);
    assert.match(csv, /125\.00/);
    assert.match(csv, /Paid/);
  });

  it("rejects empty recipient lists", () => {
    assert.deepEqual(parseReportEmails("not-an-email"), { emails: [], skipped: 1 });
    assert.deepEqual(parseReportEmails("a@b.com, a@b.com"), { emails: ["a@b.com"], skipped: 0 });
  });

  it("builds umpire PDF buffers", () => {
    const park = buildPayByParkPdf({
      orgName: "AP Fall Ball",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      rows: [
        {
          date: "Sep 8, 2026",
          time: "6:00 PM",
          homeTeam: "Astros",
          awayTeam: "Yankees",
          venue: "Clouatre",
          subvenue: "Field 2",
          ageGroup: "17U",
          umpires: [{ name: "Pat Ump", pay: 60 }],
          gamePayTotal: 60,
        },
      ],
    });
    const person = buildPayByUmpirePdf({
      orgName: "AP Fall Ball",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      rows: [{ park: "Clouatre", date: "Sep 8, 2026", umpireName: "Pat Ump", games: 1, totalPay: 60 }],
    });
    assert.equal(park.subarray(0, 5).toString(), "%PDF-");
    assert.equal(person.subarray(0, 5).toString(), "%PDF-");
  });

  it("builds a parish field-prep PDF", () => {
    const { pdf, bookedCount } = buildParishFieldPrepPdf({
      orgName: "AP Fall Ball",
      seasonName: "Fall 2026",
      gamesWindow: "2026-09-01 – 2026-10-31",
      parks: [],
      games: [],
      gamesStartsOn: "2026-09-01",
      gamesEndsOn: "2026-10-31",
    });
    assert.equal(bookedCount, 0);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });

  it("builds 3-letter park codes and numbered or abbreviated fields", () => {
    assert.equal(parkCodeFromName("Paula Park"), "PAU");
    assert.equal(parkCodeFromName("Clouatre", "JLS"), "JLS");
    assert.equal(fieldTokenFromName("Field 1"), "1");
    assert.equal(fieldTokenFromName("F2"), "2");
    assert.equal(fieldTokenFromName("Major"), "MAJ");
    const codes = buildFieldPrepCodes(
      [
        {
          id: "p1",
          name: "Paula Park",
          shortName: "Paula",
          fields: [
            { id: "f1", parkId: "p1", name: "Field 1", shortName: null, isActive: true },
            { id: "f2", parkId: "p1", name: "Field 2", shortName: "2", isActive: true },
          ],
          availabilities: [],
        },
        {
          id: "p2",
          name: "Clouatre",
          shortName: null,
          fields: [{ id: "f3", parkId: "p2", name: "Major", shortName: null, isActive: true }],
          availabilities: [],
        },
      ],
      ["f1", "f2", "f3"],
    );
    assert.deepEqual(
      codes.map((code) => code.columnCode),
      ["CLO MAJ", "PAU 1", "PAU 2"],
    );
  });

  it("does not reuse a field code in the same park", () => {
    const codes = buildFieldPrepCodes(
      [
        {
          id: "p1",
          name: "Paula",
          shortName: null,
          fields: [
            { id: "a", parkId: "p1", name: "Major", shortName: null, isActive: true },
            { id: "b", parkId: "p1", name: "Majors", shortName: null, isActive: true },
          ],
          availabilities: [],
        },
      ],
      ["a", "b"],
    );
    assert.equal(new Set(codes.map((code) => code.columnCode)).size, 2);
  });

  it("caps parish fees at the registration amount", () => {
    const late = capParishEnrollmentRow(
      {
        fullName: "Late Kid",
        ageGroup: "6U MOD",
        teamName: "Astros",
        feeDescription: "Fall Ball Late",
        amountCents: 10000,
        paidCents: 10000,
        balanceCents: 0,
        paymentStatus: "Paid",
      },
      8000,
    );
    assert.equal(late.amountCents, 8000);
    assert.equal(late.paidCents, 8000);
    assert.equal(late.balanceCents, 0);
    assert.equal(late.feeDescription, "Registration");

    const partial = capParishEnrollmentRow(
      {
        fullName: "Partial",
        ageGroup: "6U MOD",
        teamName: "Astros",
        feeDescription: "Fall Ball",
        amountCents: 8000,
        paidCents: 4000,
        balanceCents: 4000,
        paymentStatus: "Partial",
      },
      8000,
    );
    assert.equal(partial.amountCents, 8000);
    assert.equal(partial.paidCents, 4000);
    assert.equal(partial.balanceCents, 4000);

    const scholarship = capParishEnrollmentRow(
      {
        fullName: "Scholarship",
        ageGroup: "8U CP",
        teamName: "Yankees",
        feeDescription: "Fall Ball",
        amountCents: 6000,
        paidCents: 6000,
        balanceCents: 0,
        paymentStatus: "Paid",
      },
      8000,
    );
    assert.equal(scholarship.amountCents, 6000);
    assert.equal(scholarship.paidCents, 6000);

    const gonzales = capParishEnrollmentRow(
      {
        fullName: "Spring Kid",
        ageGroup: "10U",
        teamName: "Cubs",
        feeDescription: "Spring",
        amountCents: 15000,
        paidCents: 15000,
        balanceCents: 0,
        paymentStatus: "Paid",
      },
      null,
    );
    assert.equal(gonzales.amountCents, 15000);
  });

  it("defaults Fall Ball to $80 and leaves other orgs uncapped", () => {
    assert.equal(resolveParishRegistrationFeeCents({ organizationId: "fallball", storedCents: null }), 8000);
    assert.equal(resolveParishRegistrationFeeCents({ organizationId: "gonzales", storedCents: null }), null);
    assert.equal(resolveParishRegistrationFeeCents({ organizationId: "fallball", storedCents: 7500 }), 7500);
  });

  it("groups parish rows by division in age order", () => {
    const groups = groupParishEnrollmentByDivision([
      {
        fullName: "Zoe",
        ageGroup: "8U CP",
        teamName: "A",
        feeDescription: "Registration",
        amountCents: 8000,
        paidCents: 8000,
        balanceCents: 0,
        paymentStatus: "Paid",
      },
      {
        fullName: "Amy",
        ageGroup: "6U MOD",
        teamName: "B",
        feeDescription: "Registration",
        amountCents: 8000,
        paidCents: 8000,
        balanceCents: 0,
        paymentStatus: "Paid",
      },
    ]);
    assert.deepEqual(
      groups.map((group) => group.ageGroup),
      ["6U MOD", "8U CP"],
    );
  });

  it("rebuilds parish totals from capped rows", () => {
    const original: EnrollmentKpiSummary = {
      organizationId: "fallball",
      seasonYear: 2026,
      totalEnrollments: 1,
      unassignedEnrollments: 0,
      grossCents: 10000,
      collectedCents: 10000,
      outstandingCents: 0,
      ccProcessingFeeCents: 340,
      onlineFeeCents: 300,
      netDueCents: 9360,
      feeTierBreakdown: [{ orderDetailDescription: "Late", count: 1, grossCents: 10000, collectedCents: 10000 }],
      perDivision: [
        { ageGroup: "6U MOD", enrolled: 1, rostered: 1, unrostered: 0, grossCents: 10000, collectedCents: 10000 },
      ],
      priorSeasonComparison: null,
    };
    const capped = [
      capParishEnrollmentRow(
        {
          fullName: "Late Kid",
          ageGroup: "6U MOD",
          teamName: "Astros",
          feeDescription: "Late",
          amountCents: 10000,
          paidCents: 10000,
          balanceCents: 0,
          paymentStatus: "Paid",
        },
        8000,
      ),
    ];
    const summary = rebuildParishEnrollmentSummary(capped, original, 8000);
    assert.equal(summary.grossCents, 8000);
    assert.equal(summary.collectedCents, 8000);
    assert.equal(summary.feeTierBreakdown[0]?.orderDetailDescription, "Registration");
    assert.equal(summary.perDivision[0]?.collectedCents, 8000);
  });

  it("puts division headings in the parish enrollment PDF", () => {
    const original: EnrollmentKpiSummary = {
      organizationId: "fallball",
      seasonYear: 2026,
      totalEnrollments: 2,
      unassignedEnrollments: 0,
      grossCents: 16000,
      collectedCents: 16000,
      outstandingCents: 0,
      ccProcessingFeeCents: 0,
      onlineFeeCents: 0,
      netDueCents: 0,
      feeTierBreakdown: [],
      perDivision: [],
      priorSeasonComparison: null,
    };
    const { pdf } = buildParishEnrollmentPdf({
      orgName: "AP Fall Ball",
      seasonLabel: "Fall Ball 2026",
      summary: original,
      rows: [
        {
          fullName: "Amy",
          ageGroup: "6U MOD",
          teamName: "Astros",
          feeDescription: "Registration",
          amountCents: 8000,
          paidCents: 8000,
          balanceCents: 0,
          paymentStatus: "Paid",
        },
        {
          fullName: "Zoe",
          ageGroup: "8U CP",
          teamName: "Yankees",
          feeDescription: "Registration",
          amountCents: 8000,
          paidCents: 8000,
          balanceCents: 0,
          paymentStatus: "Paid",
        },
      ],
    });
    const text = pdf.toString("latin1");
    assert.match(text, /6U MOD/);
    assert.match(text, /8U CP/);
  });
});
