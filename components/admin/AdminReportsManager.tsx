//
"use client";

import { useMemo, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";
import autoTable from "jspdf-autotable";

type LeagueFilter = "all" | "littleleague" | "diamond";
type ReportMode = "main" | "umpire";

type MainReportRow = {
  gameId: string;
  date: string;
  time: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  subvenue: string;
  status: string;
  umpires: { name: string; pay: number }[];
  gamePayTotal: number;
};

type UmpireReportRow = {
  park: string;
  date: string;
  umpireId: string;
  umpireName: string;
  games: number;
  totalPay: number;
};

type UmpireDayGroup = {
  date: string;
  totalPay: number;
  entries: UmpireReportRow[];
};

type UmpireParkGroup = {
  park: string;
  totalPay: number;
  days: UmpireDayGroup[];
};

type MainDayGroup = {
  date: string;
  dayName: string;
  totalPay: number;
  games: MainReportRow[];
};

type MainParkGroup = {
  park: string;
  totalPay: number;
  days: MainDayGroup[];
};

type ReportResponse = {
  data?: {
    mode: ReportMode;
    rows: MainReportRow[] | UmpireReportRow[];
    totals: {
      games: number;
      assignments: number;
      pay: number;
    };
  };
  error?: string;
};

type Props = {
  targetOrg: ContentOrgId;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIsoDate() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 1);
  return date.toISOString().slice(0, 10);
}

function dateLabelSortValue(label: string) {
  const parsed = new Date(label);
  return Number.isNaN(parsed.valueOf()) ? 0 : parsed.valueOf();
}

function getDayName(dateLabel: string): string {
  const parsed = new Date(dateLabel);
  if (Number.isNaN(parsed.valueOf())) return "";
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[parsed.getDay()];
}

function PrinterIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M6 9V3h12v6" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v5a2 2 0 0 1-2 2h-2" />
      <circle cx="18" cy="11" r="1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 3v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function AdminReportsManager({ targetOrg }: Props) {
  const [startDate, setStartDate] = useState(startOfMonthIsoDate());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [league, setLeague] = useState<LeagueFilter>("all");
  const [mode, setMode] = useState<ReportMode>("main");
  const [activeMode, setActiveMode] = useState<ReportMode | null>(null);
  const [generatingMode, setGeneratingMode] = useState<ReportMode | null>(null);
  const [rows, setRows] = useState<MainReportRow[] | UmpireReportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const orgQuery = useMemo(() => `org=${targetOrg}`, [targetOrg]);

  const umpireGroups = useMemo(() => {
    if (mode !== "umpire") return [] as UmpireParkGroup[];

    const byPark = new Map<string, Map<string, UmpireReportRow[]>>();
    for (const row of rows as UmpireReportRow[]) {
      if (!byPark.has(row.park)) {
        byPark.set(row.park, new Map<string, UmpireReportRow[]>());
      }
      const byDate = byPark.get(row.park)!;
      if (!byDate.has(row.date)) {
        byDate.set(row.date, []);
      }
      byDate.get(row.date)!.push(row);
    }

    return Array.from(byPark.entries())
      .map(([park, byDate]) => {
        const days: UmpireDayGroup[] = Array.from(byDate.entries())
          .map(([date, entries]) => ({
            date,
            totalPay: entries.reduce((sum, entry) => sum + entry.totalPay, 0),
            entries: [...entries].sort((a, b) =>
              a.umpireName.localeCompare(b.umpireName),
            ),
          }))
          .sort(
            (a, b) => dateLabelSortValue(a.date) - dateLabelSortValue(b.date),
          );

        return {
          park,
          days,
          totalPay: days.reduce((sum, day) => sum + day.totalPay, 0),
        };
      })
      .sort((a, b) => a.park.localeCompare(b.park));
  }, [mode, rows]);

  const mainReportGroups = useMemo(() => {
    if (mode !== "main") return [] as MainParkGroup[];

    const byPark = new Map<string, Map<string, MainReportRow[]>>();
    for (const row of rows as MainReportRow[]) {
      if (!byPark.has(row.venue)) {
        byPark.set(row.venue, new Map<string, MainReportRow[]>());
      }
      const byDate = byPark.get(row.venue)!;
      if (!byDate.has(row.date)) {
        byDate.set(row.date, []);
      }
      byDate.get(row.date)!.push(row);
    }

    return Array.from(byPark.entries())
      .map(([park, byDate]) => {
        const days: MainDayGroup[] = Array.from(byDate.entries())
          .map(([date, games]) => ({
            date,
            dayName: getDayName(date),
            totalPay: games.reduce((sum, g) => sum + g.gamePayTotal, 0),
            games,
          }))
          .sort(
            (a, b) => dateLabelSortValue(a.date) - dateLabelSortValue(b.date),
          );
        return {
          park,
          days,
          totalPay: days.reduce((sum, d) => sum + d.totalPay, 0),
        };
      })
      .sort((a, b) => a.park.localeCompare(b.park));
  }, [mode, rows]);

  async function runReport(nextMode: ReportMode) {
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      setNotice("");
      return;
    }

    setGeneratingMode(nextMode);
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/reports?${orgQuery}&startDate=${startDate}&endDate=${endDate}&league=${league}&mode=${nextMode}`,
      );

      const json = (await response.json()) as ReportResponse;
      if (!response.ok || !json.data) {
        throw new Error(json.error || "Failed to generate report");
      }

      setMode(nextMode);
      setActiveMode(nextMode);
      setRows(json.data.rows);
      setNotice(
        nextMode === "main"
          ? `Main report generated (${json.data.rows.length} rows).`
          : `Umpire report generated (${json.data.rows.length} rows).`,
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to generate report",
      );
      setRows([]);
    } finally {
      setGeneratingMode(null);
      setBusy(false);
    }
  }

  function escapeCsv(value: string | number) {
    const source = String(value ?? "");
    const escaped = source.replaceAll('"', '""');
    return `"${escaped}"`;
  }

  function downloadCsv() {
    if (rows.length === 0) {
      setError("Generate a report before exporting CSV.");
      setNotice("");
      return;
    }

    setExportBusy(true);
    setError("");
    try {
      const header =
        mode === "main"
          ? [
              "Date",
              "Time",
              "Age Group",
              "Away Team",
              "Home Team",
              "Venue",
              "Subvenue",
              "Status",
              "Assignment(s)",
              "Estimated Pay",
            ]
          : ["Park", "Date", "Umpire Name", "Estimated Pay"];

      const lines = [header.map(escapeCsv).join(",")];

      if (mode === "main") {
        for (const row of rows as MainReportRow[]) {
          lines.push(
            [
              row.date,
              row.time,
              row.ageGroup,
              row.awayTeam,
              row.homeTeam,
              row.venue,
              row.subvenue,
              row.status,
              row.umpires.map((u) => `${u.name} - $${u.pay}`).join("; "),
              row.gamePayTotal,
            ]
              .map(escapeCsv)
              .join(","),
          );
        }
      } else {
        for (const row of rows as UmpireReportRow[]) {
          lines.push(
            [row.park, row.date, row.umpireName, row.totalPay]
              .map(escapeCsv)
              .join(","),
          );
        }
      }

      const csv = `${lines.join("\n")}\n`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `umpire-report-${mode}-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadPdf() {
    if (rows.length === 0) {
      setError("Generate a report before exporting PDF.");
      setNotice("");
      return;
    }

    setExportBusy(true);
    setError("");
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "letter",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 36;
      const marginRight = 36;
      const marginTop = 36;
      const marginBottom = 48; // room for page number footer
      const contentWidth = pageWidth - marginLeft - marginRight;

      // ── Page number footer via didAddPage / end ───────────────────────────────
      function drawPageNumber() {
        const pageCount = (
          doc.internal as unknown as { getNumberOfPages: () => number }
        ).getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 18,
            {
              align: "center",
            },
          );
        }
      }

      // ── Title block ──────────────────────────────────────────────────────────
      let currentY = marginTop;

      doc.setFontSize(18);
      doc.setTextColor(139, 26, 26);
      doc.setFont("helvetica", "bold");
      doc.text("Pay by Park", marginLeft, currentY);
      currentY += 20;

      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.setFont("helvetica", "normal");
      const leagueLabel =
        league === "littleleague"
          ? "Little League"
          : league === "diamond"
            ? "Diamond"
            : "All Leagues";
      doc.text(
        `Date Range: ${startDate} — ${endDate}   |   League: ${leagueLabel}   |   Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        marginLeft,
        currentY,
      );
      currentY += 16;

      // Thin rule under title block
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);
      currentY += 14;

      if (mode === "main") {
        let isFirstPark = true;
        for (const parkGroup of mainReportGroups) {
          // ── Each park starts on a new page (except the first) ────────────────
          const parkBarHeight = 28;
          if (isFirstPark) {
            isFirstPark = false;
          } else {
            doc.addPage();
            currentY = marginTop;
          }

          doc.setFillColor(139, 26, 26);
          doc.rect(marginLeft, currentY, contentWidth, parkBarHeight, "F");
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(parkGroup.park, marginLeft + 8, currentY + 18);
          doc.text(
            `Total Pay: ${formatMoney(parkGroup.totalPay)}`,
            marginLeft + contentWidth - 8,
            currentY + 18,
            { align: "right" },
          );
          currentY += parkBarHeight + 6;

          for (const day of parkGroup.days) {
            // ── Day sub-header ────────────────────────────────────────────────
            const dayBarHeight = 16;
            if (currentY + dayBarHeight + 40 > pageHeight - marginBottom) {
              doc.addPage();
              currentY = marginTop;
            }

            doc.setFillColor(230, 230, 230);
            doc.rect(marginLeft, currentY, contentWidth, dayBarHeight, "F");
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(50, 50, 50);
            doc.text(
              `${day.dayName}  —  ${day.date}`,
              marginLeft + 6,
              currentY + 11,
            );
            doc.text(
              `Day Total: ${formatMoney(day.totalPay)}`,
              marginLeft + contentWidth - 6,
              currentY + 11,
              { align: "right" },
            );
            currentY += dayBarHeight;

            // ── Games table ───────────────────────────────────────────────────
            const tableBody = day.games.map((game) => {
              const u0 = game.umpires[0];
              const u1 = game.umpires[1];
              let assignments: string;
              if (game.status === "Cancelled") {
                assignments = "Cancelled — $0";
              } else if (game.umpires.length === 0) {
                assignments = "No Assignment";
              } else if (game.umpires.length === 1) {
                assignments = `${u0.name} — $${u0.pay}`;
              } else {
                assignments = `${u0.name} — $${u0.pay}\n${u1.name} — $${u1.pay}`;
              }
              return [
                game.date,
                game.time,
                game.homeTeam,
                game.awayTeam,
                game.venue,
                game.subvenue,
                game.ageGroup,
                assignments,
              ];
            });

            autoTable(doc, {
              startY: currentY,
              head: [
                [
                  "Date",
                  "Time",
                  "Home Team",
                  "Away Team",
                  "Park",
                  "Field",
                  "Age Group",
                  "Assignment(s)",
                ],
              ],
              body: tableBody,
              theme: "grid",
              styles: {
                fontSize: 8,
                cellPadding: 3,
                textColor: [30, 30, 30],
                lineColor: [210, 210, 210],
                lineWidth: 0.4,
              },
              headStyles: {
                fillColor: [60, 60, 60],
                textColor: [255, 255, 255],
                fontStyle: "bold",
                fontSize: 8,
              },
              alternateRowStyles: {
                fillColor: [248, 248, 248],
              },
              columnStyles: {
                0: { cellWidth: 56 }, // Date
                1: { cellWidth: 42 }, // Time
                2: { cellWidth: 90 }, // Home Team
                3: { cellWidth: 90 }, // Away Team
                4: { cellWidth: 80 }, // Park
                5: { cellWidth: 50 }, // Field
                6: { cellWidth: 52 }, // Age Group
                7: { cellWidth: "auto" }, // Assignment(s)
              },
              margin: { left: marginLeft, right: marginRight },
            });

            // Read true final Y from autoTable — the only reliable way
            const lastTable = (
              doc as unknown as { lastAutoTable: { finalY: number } }
            ).lastAutoTable;
            currentY = lastTable.finalY + 10;
          }

          // Spacer between parks
          currentY += 10;
        }
      }

      drawPageNumber();
      doc.save(`pay-by-park-${startDate}-to-${endDate}.pdf`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadUmpirePdf() {
    if (rows.length === 0) {
      setError("Generate a report before exporting PDF.");
      setNotice("");
      return;
    }

    setExportBusy(true);
    setError("");
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 36;
      const marginRight = 36;
      const marginTop = 36;
      const marginBottom = 48;
      const contentWidth = pageWidth - marginLeft - marginRight;

      function drawPageNumber() {
        const pageCount = (
          doc.internal as unknown as { getNumberOfPages: () => number }
        ).getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 18,
            {
              align: "center",
            },
          );
        }
      }

      // ── Title block ──────────────────────────────────────────────────────────
      let currentY = marginTop;

      doc.setFontSize(18);
      doc.setTextColor(139, 26, 26);
      doc.setFont("helvetica", "bold");
      doc.text("Pay by Umpire", marginLeft, currentY);
      currentY += 20;

      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.setFont("helvetica", "normal");
      const leagueLabel =
        league === "littleleague"
          ? "Little League"
          : league === "diamond"
            ? "Diamond"
            : "All Leagues";
      doc.text(
        `Date Range: ${startDate} — ${endDate}   |   League: ${leagueLabel}   |   Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        marginLeft,
        currentY,
      );
      currentY += 16;

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, currentY, marginLeft + contentWidth, currentY);
      currentY += 14;

      let isFirstPark = true;
      for (const parkGroup of umpireGroups) {
        // ── Each park starts on a new page (except the first) ────────────────
        const parkBarHeight = 28;
        if (isFirstPark) {
          isFirstPark = false;
        } else {
          doc.addPage();
          currentY = marginTop;
        }

        doc.setFillColor(139, 26, 26);
        doc.rect(marginLeft, currentY, contentWidth, parkBarHeight, "F");
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(parkGroup.park, marginLeft + 8, currentY + 18);
        doc.text(
          `Total Pay: ${formatMoney(parkGroup.totalPay)}`,
          marginLeft + contentWidth - 8,
          currentY + 18,
          { align: "right" },
        );
        currentY += parkBarHeight + 6;

        for (const day of parkGroup.days) {
          // ── Day sub-header ──────────────────────────────────────────────────
          const dayBarHeight = 16;
          if (currentY + dayBarHeight + 40 > pageHeight - marginBottom) {
            doc.addPage();
            currentY = marginTop;
          }

          doc.setFillColor(230, 230, 230);
          doc.rect(marginLeft, currentY, contentWidth, dayBarHeight, "F");
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(50, 50, 50);
          doc.text(
            `${getDayName(day.date)}  —  ${day.date}`,
            marginLeft + 6,
            currentY + 11,
          );
          doc.text(
            `Day Total: ${formatMoney(day.totalPay)}`,
            marginLeft + contentWidth - 6,
            currentY + 11,
            { align: "right" },
          );
          currentY += dayBarHeight;

          // ── Umpire table ────────────────────────────────────────────────────
          const tableBody = day.entries.map((entry) => [
            entry.umpireName,
            String(entry.games),
            formatMoney(entry.totalPay),
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [["Umpire Name", "Games", "Pay"]],
            body: tableBody,
            theme: "grid",
            styles: {
              fontSize: 9,
              cellPadding: 4,
              textColor: [30, 30, 30],
              lineColor: [210, 210, 210],
              lineWidth: 0.4,
            },
            headStyles: {
              fillColor: [60, 60, 60],
              textColor: [255, 255, 255],
              fontStyle: "bold",
              fontSize: 9,
            },
            alternateRowStyles: {
              fillColor: [248, 248, 248],
            },
            columnStyles: {
              0: { cellWidth: "auto" }, // Umpire Name
              1: { cellWidth: 50, halign: "center" }, // Games
              2: { cellWidth: 70, halign: "right" }, // Pay
            },
            margin: { left: marginLeft, right: marginRight },
          });

          const lastTable = (
            doc as unknown as { lastAutoTable: { finalY: number } }
          ).lastAutoTable;
          currentY = lastTable.finalY + 10;
        }

        currentY += 10;
      }

      drawPageNumber();
      doc.save(`pay-by-umpire-${startDate}-to-${endDate}.pdf`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Reports Manager
        </h2>

        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="startDate"
              className="mb-1 block text-sm text-zinc-400"
            >
              Start Date
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="endDate"
              className="mb-1 block text-sm text-zinc-400"
            >
              End Date
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="league"
              className="mb-1 block text-sm text-zinc-400"
            >
              League
            </label>
            <select
              id="league"
              value={league}
              onChange={(e) => setLeague(e.target.value as LeagueFilter)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="all">All</option>
              <option value="littleleague">Little League</option>
              <option value="diamond">Diamond</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <button
            onClick={() => runReport("main")}
            disabled={busy}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              activeMode === "main"
                ? "border-amber-300 bg-red-700 ring-2 ring-amber-300 ring-offset-2 ring-offset-zinc-900"
                : "border-transparent bg-red-600 hover:bg-red-700"
            }`}
          >
            {generatingMode === "main" && busy ? (
              <>
                <ChevronDownIcon />
                Generating...
              </>
            ) : (
              "Main Report"
            )}
          </button>

          <button
            onClick={() => runReport("umpire")}
            disabled={busy}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              activeMode === "umpire"
                ? "border-amber-300 bg-red-700 ring-2 ring-amber-300 ring-offset-2 ring-offset-zinc-900"
                : "border-transparent bg-red-600 hover:bg-red-700"
            }`}
          >
            {generatingMode === "umpire" && busy ? (
              <>
                <ChevronDownIcon />
                Generating...
              </>
            ) : (
              "Umpire Report"
            )}
          </button>

          {activeMode && rows.length > 0 && (
            <>
              <button
                onClick={downloadCsv}
                disabled={exportBusy}
                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              >
                <DownloadIcon />
                Export CSV
              </button>

              {activeMode === "main" && (
                <button
                  onClick={downloadPdf}
                  disabled={exportBusy}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                >
                  <PrinterIcon />
                  Export PDF
                </button>
              )}

              {activeMode === "umpire" && (
                <button
                  onClick={downloadUmpirePdf}
                  disabled={exportBusy}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                >
                  <PrinterIcon />
                  Export PDF
                </button>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-lg bg-emerald-900/20 border border-emerald-800 px-4 py-2 text-sm text-emerald-300">
            {notice}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-zinc-400">
          No results. Run a report above.
        </div>
      ) : mode === "main" ? (
        <div className="space-y-4 p-4">
          {mainReportGroups.map((parkGroup) => (
            <section
              key={parkGroup.park}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {parkGroup.park}
                </h3>
                <span className="text-sm font-semibold text-emerald-300">
                  Total Pay = {formatMoney(parkGroup.totalPay)}
                </span>
              </div>
              <p className="px-4 py-1 text-xs text-zinc-500">
                From: {startDate} To: {endDate}
              </p>
              <div className="space-y-3 px-3 pb-3">
                {parkGroup.days.map((day) => (
                  <div
                    key={`${parkGroup.park}-${day.date}`}
                    className="overflow-hidden rounded-lg border border-zinc-800"
                  >
                    <div className="bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-zinc-200">
                      {day.dayName}
                    </div>
                    <table className="min-w-full text-sm">
                      <thead className="border-y border-zinc-800 bg-zinc-950/70 text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Time</th>
                          <th className="px-3 py-2 text-left">Home Team</th>
                          <th className="px-3 py-2 text-left">Away Team</th>
                          <th className="px-3 py-2 text-left">Park</th>
                          <th className="px-3 py-2 text-left">Field</th>
                          <th className="px-3 py-2 text-left">Age Group</th>
                          <th className="px-3 py-2 text-center" colSpan={2}>
                            Assignment(s)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.games.map((game) => {
                          const u0 = game.umpires[0];
                          const u1 = game.umpires[1];
                          return (
                            <tr
                              key={game.gameId}
                              className="border-b border-zinc-900/80 text-zinc-200 last:border-b-0"
                            >
                              <td className="px-3 py-2">{game.date}</td>
                              <td className="px-3 py-2">{game.time}</td>
                              <td className="px-3 py-2">{game.homeTeam}</td>
                              <td className="px-3 py-2">{game.awayTeam}</td>
                              <td className="px-3 py-2">{game.venue}</td>
                              <td className="px-3 py-2">{game.subvenue}</td>
                              <td className="px-3 py-2">{game.ageGroup}</td>
                              {game.status === "Cancelled" ? (
                                <td
                                  colSpan={2}
                                  className="px-3 py-2 text-center text-zinc-500"
                                >
                                  Cancelled — $0
                                </td>
                              ) : game.umpires.length === 0 ? (
                                <td
                                  colSpan={2}
                                  className="px-3 py-2 text-center text-zinc-500"
                                >
                                  No Assignment
                                </td>
                              ) : game.umpires.length === 1 ? (
                                <td
                                  colSpan={2}
                                  className="px-3 py-2 text-center"
                                >
                                  {u0!.name} — ${u0!.pay}
                                </td>
                              ) : (
                                <>
                                  <td className="px-3 py-2 text-center">
                                    {u0!.name} — ${u0!.pay}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {u1!.name} — ${u1!.pay}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-zinc-700 bg-zinc-900/60">
                          <td
                            colSpan={8}
                            className="px-3 py-2 text-sm font-semibold text-zinc-200"
                          >
                            Total Pay for {day.date} ={" "}
                            {formatMoney(day.totalPay)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {umpireGroups.map((parkGroup) => (
            <section
              key={parkGroup.park}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {parkGroup.park}
                </h3>
                <span className="text-sm font-semibold text-emerald-300">
                  {formatMoney(parkGroup.totalPay)}
                </span>
              </div>

              <div className="space-y-3 p-3">
                {parkGroup.days.map((day) => (
                  <div
                    key={`${parkGroup.park}-${day.date}`}
                    className="overflow-hidden rounded-lg border border-zinc-800"
                  >
                    <div className="bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-zinc-200">
                      {getDayName(day.date)} — {day.date} —{" "}
                      {formatMoney(day.totalPay)}
                    </div>
                    <table className="min-w-full text-sm">
                      <thead className="border-y border-zinc-800 bg-zinc-950/70 text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Umpire Name</th>
                          <th className="px-3 py-2 text-right">Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.entries.map((entry) => (
                          <tr
                            key={`${entry.park}-${entry.date}-${entry.umpireId}`}
                            className="border-b border-zinc-900/80 text-zinc-200 last:border-b-0"
                          >
                            <td className="px-3 py-2">{entry.umpireName}</td>
                            <td className="px-3 py-2 text-right">
                              {formatMoney(entry.totalPay)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
