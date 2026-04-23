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
  umpireCount: number;
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

export default function AdminReportsManager({ targetOrg }: Props) {
  const [startDate, setStartDate] = useState(startOfMonthIsoDate());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [league, setLeague] = useState<LeagueFilter>("all");
  const [mode, setMode] = useState<ReportMode>("main");
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

  async function runReport(nextMode: ReportMode) {
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      setNotice("");
      return;
    }

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
            "Umpires",
            "Estimated Pay",
          ]
        : ["Park", "Date", "Umpire", "Games", "Estimated Pay"];

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
            row.umpireCount,
            row.gamePayTotal,
          ]
            .map(escapeCsv)
            .join(","),
        );
      }
    } else {
      for (const row of rows as UmpireReportRow[]) {
        lines.push(
          [row.park, row.date, row.umpireName, row.games, row.totalPay]
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

      const head =
        mode === "main"
          ? [
              [
                "Date",
                "Time",
                "Age",
                "Matchup",
                "Venue",
                "Status",
                "Umpires",
                "Pay",
              ],
            ]
          : [["Park", "Date", "Umpire", "Games", "Pay"]];

      const body =
        mode === "main"
          ? (rows as MainReportRow[]).map((row) => [
              row.date,
              row.time,
              row.ageGroup,
              `${row.awayTeam} @ ${row.homeTeam}`,
              row.subvenue ? `${row.venue} (${row.subvenue})` : row.venue,
              row.status,
              String(row.umpireCount),
              formatMoney(row.gamePayTotal),
            ])
          : (rows as UmpireReportRow[]).map((row) => [
              row.park,
              row.date,
              row.umpireName,
              String(row.games),
              formatMoney(row.totalPay),
            ]);

      autoTable(doc, {
        startY: 88,
        head,
        body,
        styles: {
          fontSize: 9,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [170, 20, 20],
        },
      });

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
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
            >
              {busy && mode === "main" ? "Working..." : "Generate Main Report"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runReport("umpire")}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-60"
            >
              {busy && mode === "umpire"
                ? "Working..."
                : "Generate Report by Umpire"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Print Report
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              Download CSV
            </button>
            <button
              type="button"
              disabled={exportBusy}
              onClick={downloadPdf}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
            >
              {exportBusy ? "Preparing PDF..." : "Download PDF"}
            </button>
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
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Age Group</th>
                <th className="px-3 py-2 text-left">Matchup</th>
                <th className="px-3 py-2 text-left">Venue</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Umpires</th>
                <th className="px-3 py-2 text-right">Est. Pay</th>
              </tr>
            </thead>
            <tbody>
              {(rows as MainReportRow[]).map((row) => (
                <tr
                  key={row.gameId}
                  className="border-b border-zinc-900/80 text-zinc-200"
                >
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.time}</td>
                  <td className="px-3 py-2">{row.ageGroup}</td>
                  <td className="px-3 py-2">
                    {row.awayTeam} @ {row.homeTeam}
                  </td>
                  <td className="px-3 py-2">
                    {row.venue}
                    {row.subvenue ? (
                      <span className="block text-xs text-zinc-500">
                        {row.subvenue}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2 text-right">{row.umpireCount}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(row.gamePayTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                      <div className="flex items-center justify-between bg-zinc-900/80 px-3 py-2 text-xs text-zinc-300">
                        <span className="font-semibold">{day.date}</span>
                        <span className="font-semibold text-zinc-100">
                          {formatMoney(day.totalPay)}
                        </span>
                      </div>
                      <table className="min-w-full text-sm">
                        <thead className="border-y border-zinc-800 bg-zinc-950/70 text-zinc-400">
                          <tr>
                            <th className="px-3 py-2 text-left">Umpire</th>
                            <th className="px-3 py-2 text-right">Games</th>
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
                                {entry.games}
                              </td>
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
