import { jsPDF } from "jspdf";
import type { CellHookData } from "jspdf-autotable";

import {
  buildFieldCapacityHeatmap,
  heatmapCellKey,
  type FieldCapacityHeatmap,
  type HeatmapGame,
  type HeatmapPark,
} from "@/lib/admin/fieldCapacityHeatmap";
import { buildFieldPrepCodes } from "@/lib/admin/fieldPrepCodes";
import {
  formatReportDate,
  pdfToBuffer,
  reportTable,
  stampReportFooter,
  writeReportLetterhead,
} from "@/lib/admin/reportPdf";

export type ParishPrepSlot = {
  date: string;
  dayLabel: string;
  startTime: string;
  parkLabel: string;
  fieldLabel: string;
  division: string;
};

const BOOKED_FILL: [number, number, number] = [255, 199, 206];
const BOOKED_TEXT: [number, number, number] = [156, 0, 6];
const DARK_FILL: [number, number, number] = [230, 230, 230];
const DARK_TEXT: [number, number, number] = [90, 90, 90];

export function bookedPrepSlots(grid: FieldCapacityHeatmap): ParishPrepSlot[] {
  const slots: ParishPrepSlot[] = [];
  for (const row of grid.rows) {
    for (const column of grid.columns) {
      const cell = grid.cells[heatmapCellKey(row.date, row.startTime, column.fieldId)];
      if (cell?.status !== "booked") continue;
      slots.push({
        date: row.date,
        dayLabel: row.dayLabel,
        startTime: row.startTime,
        parkLabel: column.parkLabel,
        fieldLabel: column.label,
        division: cell.game?.division || cell.divisions[0] || "—",
      });
    }
  }
  return slots.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.parkLabel.localeCompare(b.parkLabel) ||
      a.fieldLabel.localeCompare(b.fieldLabel),
  );
}

export function parishPrepDates(grid: FieldCapacityHeatmap): { date: string; dayLabel: string }[] {
  const seen = new Map<string, string>();
  for (const row of grid.rows) {
    if (!seen.has(row.date)) seen.set(row.date, row.dayLabel);
  }
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayLabel]) => ({ date, dayLabel }));
}

/** One block per field per date: booked if any time that night has a game. */
export function parishPrepDayCell(
  grid: FieldCapacityHeatmap,
  date: string,
  fieldId: string,
): { booked: boolean; divisions: string[] } {
  const divisions: string[] = [];
  for (const row of grid.rows) {
    if (row.date !== date) continue;
    const cell = grid.cells[heatmapCellKey(date, row.startTime, fieldId)];
    if (cell?.status !== "booked") continue;
    const division = cell.game?.division || cell.divisions[0] || "Booked";
    if (!divisions.includes(division)) divisions.push(division);
  }
  return { booked: divisions.length > 0, divisions };
}

function colorHeatmapCell(data: CellHookData) {
  if (data.section !== "body" || data.column.index < 1) return;
  const raw = String(data.cell.raw ?? "").trim();
  if (!raw || raw === "—") {
    data.cell.styles.fillColor = DARK_FILL;
    data.cell.styles.textColor = DARK_TEXT;
    return;
  }
  data.cell.styles.fillColor = BOOKED_FILL;
  data.cell.styles.textColor = BOOKED_TEXT;
}

export function buildParishFieldPrepPdf(input: {
  orgName: string;
  seasonName: string;
  gamesWindow: string;
  parks: HeatmapPark[];
  games: HeatmapGame[];
  gamesStartsOn: string;
  gamesEndsOn: string;
}): { pdf: Buffer; bookedCount: number; filename: string } {
  const grid = buildFieldCapacityHeatmap({
    parks: input.parks,
    gamesStartsOn: input.gamesStartsOn,
    gamesEndsOn: input.gamesEndsOn,
    games: input.games,
  });
  const dates = parishPrepDates(grid);
  const codes = buildFieldPrepCodes(
    input.parks,
    grid.columns.map((column) => column.fieldId),
  );
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 40;
  const parkIds = [...new Set(codes.map((code) => code.parkId))];
  let y = margin;

  if (!parkIds.length) {
    y = writeReportLetterhead(doc, margin, {
      orgName: input.orgName,
      title: "Parish field prep",
      subtitle: `${input.seasonName} · Games ${input.gamesWindow}`,
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("No fields on the weekly board for this season.", margin, y);
  }

  parkIds.forEach((parkId, index) => {
    const parkCodes = codes.filter((code) => code.parkId === parkId);
    const parkName = parkCodes[0]?.parkName || "Park";
    if (index > 0) doc.addPage();
    y = writeReportLetterhead(doc, margin, {
      orgName: input.orgName,
      title: parkName,
      subtitle: `${input.seasonName} · Games ${input.gamesWindow} · Red = prepare this field that night`,
    });
    const body = dates.map((row) => [
      `${row.dayLabel} ${formatReportDate(row.date)}`,
      ...parkCodes.map((code) => {
        const cell = parishPrepDayCell(grid, row.date, code.fieldId);
        return cell.booked ? cell.divisions.join(" / ") : "—";
      }),
    ]);
    y = reportTable(
      doc,
      y,
      margin,
      ["Date", ...parkCodes.map((code) => code.fieldName)],
      body,
      {
        fontSize: 8,
        striped: false,
        didParseCell: colorHeatmapCell,
      },
    );
  });

  stampReportFooter(doc, margin, `AP Baseball · ${input.orgName} · ${input.seasonName}`);
  const stem = `${input.seasonName} parish-field-prep`.replace(/[^a-zA-Z0-9]+/g, "-");
  let bookedCount = 0;
  for (const row of dates) {
    for (const code of codes) {
      if (parishPrepDayCell(grid, row.date, code.fieldId).booked) bookedCount += 1;
    }
  }
  return { pdf: pdfToBuffer(doc), bookedCount, filename: `${stem}.pdf` };
}
