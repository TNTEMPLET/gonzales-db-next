"use client";

import { useMemo, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";

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
  const [totals, setTotals] = useState({ games: 0, assignments: 0, pay: 0 });
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
      setTotals(json.data.totals);
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
      setTotals({ games: 0, assignments: 0, pay: 0 });
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
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const autoTable = autoTableModule.default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt" });

      const title =
        mode === "main"
          ? "AP Baseball Umpire Main Report"
          : "AP Baseball Umpire Report by Umpire";

      doc.setFontSize(14);
      doc.text(title, 40, 38);
      doc.setFontSize(10);
      doc.text(`Range: ${startDate} to ${endDate}`, 40, 56);
      doc.text(
        `Totals: Games ${totals.games} | Assignments ${totals.assignments} | Estimated Pay ${formatMoney(totals.pay)}`,
        40,
        72,
      );

      let currentY = 88;
      if (mode === "main") {
        for (const parkGroup of mainReportGroups) {
          doc.setFontSize(12);
          doc.text(
            `${parkGroup.park} (Total Pay: ${formatMoney(parkGroup.totalPay)})`,
            40,
            currentY,
          );

          let currentY = 88;
          if (mode === "main") {
            mainReportGroups.forEach((parkGroup, parkIdx) => {
              if (parkIdx > 0) {
                doc.addPage();
                currentY = 40;
              }
              // Draw Park section outline
              doc.setDrawColor(170, 20, 20);
              doc.setLineWidth(1.2);
              doc.roundedRect(32, currentY - 18, doc.internal.pageSize.getWidth() - 64, 30, 8, 8, 'S');
              doc.setFontSize(12);
              doc.text(`${parkGroup.park} (Total Pay: ${formatMoney(parkGroup.totalPay)})`, 40, currentY);
              currentY += 18;
              parkGroup.days.forEach((day, dayIdx) => {
                if (dayIdx > 0) {
                  doc.addPage();
                  currentY = 40;
                }
                doc.setFontSize(10);
                doc.text(`${day.dayName} — ${day.date} (Total Pay: ${formatMoney(day.totalPay)})`, 60, currentY);
                currentY += 16;
                const tableBody = day.games.map((game) => {
                  const u0 = game.umpires[0];
                  const u1 = game.umpires[1];
                  let assignments = "";
                  if (game.status === "Cancelled") {
                    assignments = "Cancelled — $0";
                  } else if (game.umpires.length === 0) {
                    assignments = "No Assignment";
                  } else if (game.umpires.length === 1) {
                    assignments = `${u0.name} — $${u0.pay}`;
                  } else {
                    assignments = `${u0.name} — $${u0.pay}; ${u1.name} — $${u1.pay}`;
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
                  head: [[
                    "Date",
                    "Time",
                    "Home Team",
                    "Away Team",
                    "Park",
                    "Field",
                    "Age Group",
                    "Assignment(s)",
                  ]],
                  body: tableBody,
                  styles: {
                    fontSize: 9,
                    cellPadding: 4,
                  },
                  headStyles: {
                    fillColor: [170, 20, 20],
                  },
                  margin: { left: 40, right: 40 },
                  theme: "grid",
                });
                currentY = (doc as any).lastAutoTable.finalY + 10;
                doc.setFontSize(9);
                doc.text(`Total Pay for ${day.date}: ${formatMoney(day.totalPay)}`, 60, currentY);
                currentY += 16;
              });
              currentY += 10;
            });
          } else {
            umpireGroups.forEach((parkGroup, parkIdx) => {
              if (parkIdx > 0) {
                doc.addPage();
                currentY = 40;
              }
              // Draw Park section outline
              doc.setDrawColor(170, 20, 20);
              doc.setLineWidth(1.2);
              doc.roundedRect(32, currentY - 18, doc.internal.pageSize.getWidth() - 64, 30, 8, 8, 'S');
              doc.setFontSize(12);
              doc.text(`${parkGroup.park} (Total Pay: ${formatMoney(parkGroup.totalPay)})`, 40, currentY);
              currentY += 18;
              parkGroup.days.forEach((day, dayIdx) => {
                if (dayIdx > 0) {
                  doc.addPage();
                  currentY = 40;
                }
                doc.setFontSize(10);
                doc.text(`${getDayName(day.date)} — ${day.date} (Total Pay: ${formatMoney(day.totalPay)})`, 60, currentY);
                currentY += 16;
                const tableBody = day.entries.map((entry) => [
                  entry.umpireName,
                  formatMoney(entry.totalPay),
                ]);
                autoTable(doc, {
                  startY: currentY,
                  head: [["Umpire Name", "Pay"]],
                  body: tableBody,
                  styles: {
                    fontSize: 9,
                    cellPadding: 4,
                  },
                  headStyles: {
                    fillColor: [170, 20, 20],
                  },
                  margin: { left: 60, right: 40 },
                  theme: "grid",
                });
                currentY = (doc as any).lastAutoTable.finalY + 10;
              });
              currentY += 10;
            });
          }
        });
      } else {
        umpireGroups.forEach((parkGroup, parkIdx) => {
          if (parkIdx > 0) {
            doc.addPage();
            currentY = 40;
          }
          // Draw Park section outline
          doc.setDrawColor(170, 20, 20);
          doc.setLineWidth(1.2);
          doc.roundedRect(32, currentY - 18, doc.internal.pageSize.getWidth() - 64, 30, 8, 8, 'S');
          doc.setFontSize(12);
          doc.text(`${parkGroup.park} (Total Pay: ${formatMoney(parkGroup.totalPay)})`, 40, currentY);
          currentY += 18;
          parkGroup.days.forEach((day, dayIdx) => {
            if (dayIdx > 0) {
              doc.addPage();
              currentY = 40;
            }
            doc.setFontSize(10);
            doc.text(`${getDayName(day.date)} — ${day.date} (Total Pay: ${formatMoney(day.totalPay)})`, 60, currentY);
            currentY += 16;
            const tableBody = day.entries.map((entry) => [
              entry.umpireName,
              formatMoney(entry.totalPay),
            ]);
            autoTable(doc, {
              startY: currentY,
              head: [["Umpire Name", "Pay"]],
              body: tableBody,
              styles: {
                fontSize: 9,
                cellPadding: 4,
              },
              headStyles: {
                fillColor: [170, 20, 20],
              },
              margin: { left: 60, right: 40 },
              theme: "grid",
            });
            currentY = (doc as any).lastAutoTable.finalY + 10;
          });
          currentY += 10;
        });
      }

      doc.save(`umpire-report-${mode}-${startDate}-to-${endDate}.pdf`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export PDF");
      setNotice("");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.94),rgba(9,9,11,0.98))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_180px_auto]">
          <label className="space-y-1 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Start Date
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              End Date
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              League
            </span>
            <select
              value={league}
              onChange={(event) =>
                setLeague(event.target.value as LeagueFilter)
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            >
              <option value="all">All Leagues</option>
              <option value="littleleague">Ascension LL</option>
              <option value="diamond">Gonzales DB</option>
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runReport("main")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                activeMode === "main"
                  ? "border-red-500/50 bg-red-500/15 text-red-100 ring-1 ring-red-500/40"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {busy && generatingMode === "main"
                ? "Working..."
                : "Games Report"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runReport("umpire")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                activeMode === "umpire"
                  ? "border-red-500/50 bg-red-500/15 text-red-100 ring-1 ring-red-500/40"
                  : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {busy && generatingMode === "umpire"
                ? "Working..."
                : "Umpire Reports"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="Print Report"
              aria-label="Print Report"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <PrinterIcon />
            </button>
            <details className="relative">
              <summary
                title="Download Report"
                className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-zinc-200 hover:bg-zinc-800"
              >
                <DownloadIcon />
                <ChevronDownIcon />
                <span className="sr-only">Download Report</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={downloadPdf}
                  className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
                >
                  {exportBusy ? "Preparing PDF..." : "Download PDF"}
                </button>
              </div>
            </details>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
            {notice}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            Games
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {totals.games}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            Assignments
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {totals.assignments}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            Estimated Pay
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {formatMoney(totals.pay)}
          </p>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950/85">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            No report rows yet. Choose dates and generate a report.
          </p>
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
    </section>
  );
}
