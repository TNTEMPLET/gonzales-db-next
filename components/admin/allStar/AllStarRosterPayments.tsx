"use client";

import { useCallback, useEffect, useState } from "react";

type PaymentRow = {
  id: string;
  playerFullName: string;
  ageGroup: string;
  team: string;
  payerName: string | null;
  paypalTxId: string | null;
  paypalTxDate: string | null;
  amountCents: number;
  isPaid: boolean;
  paidAt: string | null;
  notes: string | null;
  rosterTag: string | null;
};

type RosterSummary = {
  rosterTag: string;
  ballotCycleId: string;
  seasonYear: number;
  summary: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  payments: PaymentRow[];
};

type UnseededCycle = {
  cycleId: string;
  cycleName: string;
  seasonYear: number;
  selectedCandidateCount: number;
};

type SummaryData = {
  rosters: RosterSummary[];
  grandTotals: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  availableYears: number[];
  unseededCycles: UnseededCycle[];
};

function fmtMoney(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paidPct(paid: number, total: number) {
  if (total === 0) return 0;
  return Math.round((paid / total) * 100);
}

function StatChip({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "amber" | "red" }) {
  let color = "text-zinc-200 border-zinc-700 bg-zinc-900/50";
  if (highlight === "green") color = "text-emerald-300 border-emerald-800/50 bg-emerald-950/30";
  if (highlight === "amber") color = "text-amber-300 border-amber-800/50 bg-amber-950/30";
  if (highlight === "red") color = "text-red-300 border-red-800/50 bg-red-950/30";
  return (
    <div className={"rounded-lg border px-3 py-2 text-center min-w-[90px] " + color}>
      <div className="text-xs opacity-70 mb-0.5">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = paidPct(paid, total);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: pct + "%" }} />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Edit row type ────────────────────────────────────────────────────────────

type EditRow = {
  id: string;
  playerFullName: string;
  team: string;
  amountCents: number;
};

// ─── Roster card ─────────────────────────────────────────────────────────────

function RosterCard({
  roster,
  org,
  onTogglePaid,
  onEdited,
}: {
  roster: RosterSummary;
  org: string;
  onTogglePaid: (paymentId: string, isPaid: boolean) => void;
  onEdited: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [bulkFee, setBulkFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const s = roster.summary;

  async function handleToggle(paymentId: string, newIsPaid: boolean) {
    setToggling(paymentId);
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, isPaid: newIsPaid }),
      });
      if (res.ok) onTogglePaid(paymentId, newIsPaid);
    } finally {
      setToggling(null);
    }
  }

  function startEdit() {
    setEditRows(
      roster.payments.map((p) => ({
        id: p.id,
        playerFullName: p.playerFullName,
        team: p.team,
        amountCents: p.amountCents,
      })),
    );
    setBulkFee("");
    setSaveError(null);
    setEditing(true);
  }

  function applyBulkFee() {
    const cents = Math.round(parseFloat(bulkFee) * 100);
    if (!isNaN(cents) && cents > 0) {
      setEditRows((rows) => rows.map((r) => ({ ...r, amountCents: cents })));
    }
  }

  function updateRow(id: string, field: keyof EditRow, value: string | number) {
    setEditRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function saveEdits() {
    setSaving(true);
    setSaveError(null);
    try {
      const original = new Map(roster.payments.map((p) => [p.id, p]));
      const dirty = editRows.filter((r) => {
        const orig = original.get(r.id);
        return orig && (
          r.playerFullName !== orig.playerFullName ||
          r.team !== orig.team ||
          r.amountCents !== orig.amountCents
        );
      });
      for (const row of dirty) {
        const res = await fetch("/api/admin/all-star/payments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: row.id,
            playerFullName: row.playerFullName,
            team: row.team,
            amountCents: row.amountCents,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Save failed");
        }
      }
      setEditing(false);
      onEdited();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-3 min-w-0 text-left flex-1 hover:opacity-80 transition-opacity"
        >
          <span className="text-base font-semibold text-white truncate">{roster.rosterTag}</span>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {s.total > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-emerald-400 font-medium">{s.paidCount}/{s.total} paid</span>
              <span className="text-zinc-400">{fmtMoney(s.collectedCents)}</span>
            </div>
          )}
          <div className="w-20 hidden md:block">
            <ProgressBar paid={s.paidCount} total={s.total} />
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => { startEdit(); setExpanded(true); }}
              title="Edit roster"
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              ✏ Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-zinc-500 hover:text-zinc-300 px-1"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-zinc-700/50 px-5 py-4 space-y-4">

          {/* Summary chips — hidden in edit mode */}
          {!editing && s.total > 0 && (
            <div className="flex flex-wrap gap-2">
              <StatChip label="Total" value={String(s.total)} />
              <StatChip label="Paid" value={String(s.paidCount)} highlight="green" />
              <StatChip label="Unpaid" value={String(s.unpaidCount)} highlight={s.unpaidCount > 0 ? "amber" : undefined} />
              <StatChip label="Collected" value={fmtMoney(s.collectedCents)} highlight="green" />
              <StatChip label="Outstanding" value={fmtMoney(s.outstandingCents)} highlight={s.outstandingCents > 0 ? "red" : undefined} />
              <div className="flex-1 min-w-[120px] flex items-center">
                <div className="w-full"><ProgressBar paid={s.paidCount} total={s.total} /></div>
              </div>
            </div>
          )}

          {/* ── Edit mode ── */}
          {editing && (
            <div className="space-y-3">
              {/* Bulk fee bar */}
              <div className="flex items-center gap-2 rounded-lg border border-violet-700/40 bg-violet-950/20 px-3 py-2.5">
                <span className="text-xs text-violet-300 font-medium shrink-0">Change fee for all:</span>
                <div className="flex items-center rounded border border-zinc-700 bg-zinc-900 overflow-hidden">
                  <span className="px-2 text-zinc-500 text-sm border-r border-zinc-700">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bulkFee}
                    onChange={(e) => setBulkFee(e.target.value)}
                    placeholder={editRows[0] ? String((editRows[0].amountCents / 100).toFixed(2)) : "95.00"}
                    className="w-20 bg-transparent px-2 py-1 text-sm text-zinc-200 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyBulkFee}
                  className="rounded border border-violet-700/50 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-900/30 transition-colors"
                >
                  Apply to All
                </button>
                <span className="text-xs text-zinc-600 ml-1">updates every row below</span>
              </div>

              {/* Per-row edit table */}
              <div className="overflow-x-auto rounded-lg border border-zinc-700/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500 border-b border-zinc-700/50 bg-zinc-900/60">
                      <th className="text-left px-3 py-2 font-medium">Player Name</th>
                      <th className="text-left px-3 py-2 font-medium">Team</th>
                      <th className="text-right px-3 py-2 font-medium">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editRows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-800/40 last:border-0">
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={row.playerFullName}
                            onChange={(e) => updateRow(row.id, "playerFullName", e.target.value)}
                            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={row.team}
                            onChange={(e) => updateRow(row.id, "team", e.target.value)}
                            className="w-32 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end rounded border border-zinc-700 bg-zinc-800 overflow-hidden w-28 ml-auto">
                            <span className="px-1.5 text-zinc-500 text-sm border-r border-zinc-700">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={(row.amountCents / 100).toFixed(2)}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v >= 0) updateRow(row.id, "amountCents", Math.round(v * 100));
                              }}
                              className="w-full bg-transparent px-2 py-1 text-sm text-zinc-200 text-right focus:outline-none"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {saveError && (
                <p className="text-xs text-red-400 rounded border border-red-800/40 bg-red-950/20 px-3 py-2">{saveError}</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveEdits()}
                  disabled={saving}
                  className="rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition-colors"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* ── Read mode ── */}
          {!editing && (
            <>
              {roster.payments.length === 0 ? (
                <p className="text-zinc-500 text-sm italic">No payment records.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-zinc-500 border-b border-zinc-700/50">
                        <th className="text-left py-2 pr-4 font-medium">Player</th>
                        <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Team</th>
                        <th className="text-left py-2 pr-4 font-medium hidden md:table-cell">Payer</th>
                        <th className="text-center py-2 pr-4 font-medium">Status</th>
                        <th className="text-right py-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.payments.map((p) => (
                        <tr key={p.id} className="border-b border-zinc-800/50 last:border-0">
                          <td className="py-2 pr-4 text-zinc-200">{p.playerFullName}</td>
                          <td className="py-2 pr-4 text-zinc-400 text-xs hidden sm:table-cell">{p.team || "—"}</td>
                          <td className="py-2 pr-4 text-zinc-400 text-xs hidden md:table-cell">{p.payerName || "—"}</td>
                          <td className="py-2 pr-4 text-center">
                            <button
                              type="button"
                              disabled={toggling === p.id}
                              onClick={() => void handleToggle(p.id, !p.isPaid)}
                              className={
                                "text-xs font-medium px-2 py-0.5 rounded transition-colors disabled:opacity-50 " +
                                (p.isPaid
                                  ? "text-emerald-400 bg-emerald-950/40 hover:bg-emerald-950/70"
                                  : "text-amber-400 bg-amber-950/30 hover:bg-amber-950/60")
                              }
                            >
                              {toggling === p.id ? "…" : p.isPaid ? "Paid ✓" : "Unpaid"}
                            </button>
                          </td>
                          <td className="py-2 text-right text-zinc-300 text-xs">{fmtMoney(p.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Unseeded cycle seeder card ───────────────────────────────────────────────
function UnseededCycleCard({
  cycle,
  onSeeded,
}: {
  cycle: UnseededCycle;
  onSeeded: () => void;
}) {
  const [feeInput, setFeeInput] = useState("95.00");
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<{ created: number; skipped: number; removed: number } | null>(null);

  async function handleSeed() {
    const feeCents = Math.round(parseFloat(feeInput || "0") * 100);
    if (!feeCents || feeCents <= 0) {
      setSeedError("Enter a valid fee amount.");
      return;
    }
    setSeeding(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "seed_from_roster", cycleId: cycle.cycleId, feeCents }),
      });
      const json = (await res.json()) as { success?: boolean; created?: number; skipped?: number; removed?: number; error?: string };
      if (!res.ok) {
        setSeedError(json.error ?? "Seeding failed.");
        return;
      }
      setSeedResult({ created: json.created ?? 0, skipped: json.skipped ?? 0, removed: json.removed ?? 0 });
      setTimeout(() => onSeeded(), 1200);
    } catch {
      setSeedError("Network error.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-700/40 bg-amber-950/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">Ready to Seed</span>
        </div>
        <div className="text-base font-semibold text-white truncate">{cycle.cycleName}</div>
        <div className="text-xs text-zinc-400 mt-0.5">
          {cycle.selectedCandidateCount} selected player{cycle.selectedCandidateCount !== 1 ? "s" : ""} · no payment records yet
        </div>
        {seedError && <p className="text-xs text-red-400 mt-1">{seedError}</p>}
        {seedResult && (
          <p className="text-xs text-emerald-400 mt-1">
            ✓ Created {seedResult.created} record{seedResult.created !== 1 ? "s" : ""}
            {seedResult.skipped > 0 ? `, ${seedResult.skipped} already existed` : ""}
            {seedResult.removed > 0 ? `, ${seedResult.removed} removed` : ""}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-900/60 overflow-hidden">
          <span className="px-2.5 text-zinc-500 text-sm select-none border-r border-zinc-700">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
            disabled={seeding}
            className="w-20 bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none disabled:opacity-50"
            placeholder="95.00"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSeed()}
          disabled={seeding}
          className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium text-white transition-colors whitespace-nowrap"
        >
          {seeding ? "Seeding…" : "Seed Payments"}
        </button>
      </div>
    </div>
  );
}

export default function AllStarRosterPayments({ org }: { org: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");

  const fetchData = useCallback(
    (year: number | "all") => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ org });
      if (year !== "all") params.set("year", String(year));
      const url = `/api/admin/all-star/payments/org-rosters?${params.toString()}`;
      fetch(url)
        .then((res) => res.json().then((json) => ({ res, json })))
        .then(({ res, json }: { res: Response; json: unknown }) => {
          if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load payments");
          setData(json as SummaryData);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Unknown error");
        })
        .finally(() => setLoading(false));
    },
    [org],
  );

  useEffect(() => {
    fetchData(selectedYear);
  }, [selectedYear, fetchData]);

  function handleTogglePaid(rosterTag: string, paymentId: string, newIsPaid: boolean) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rosters: prev.rosters.map((r) => {
          if (r.rosterTag !== rosterTag) return r;
          const payments = r.payments.map((p) =>
            p.id === paymentId ? { ...p, isPaid: newIsPaid, paidAt: newIsPaid ? new Date().toISOString() : null } : p,
          );
          const paidCount = payments.filter((p) => p.isPaid).length;
          const unpaidCount = payments.length - paidCount;
          const collectedCents = payments.filter((p) => p.isPaid).reduce((s, p) => s + p.amountCents, 0);
          const outstandingCents = payments.filter((p) => !p.isPaid).reduce((s, p) => s + p.amountCents, 0);
          return { ...r, payments, summary: { ...r.summary, paidCount, unpaidCount, collectedCents, outstandingCents } };
        }),
        grandTotals: {
          ...prev.grandTotals,
          paidCount: prev.grandTotals.paidCount + (newIsPaid ? 1 : -1),
          unpaidCount: prev.grandTotals.unpaidCount + (newIsPaid ? -1 : 1),
        },
      };
    });
  }

  const unseededCycles = data?.unseededCycles ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">All-Star Payment Rosters</h2>
          {data && (
            <p className="text-xs text-zinc-400 mt-0.5">
              {data.grandTotals.total} players · {data.grandTotals.paidCount} paid · {fmtMoney(data.grandTotals.collectedCents)} collected
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data && data.availableYears.length > 1 && (
            <select
              value={String(selectedYear)}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedYear(v === "all" ? "all" : Number(v));
              }}
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 min-w-[110px]"
            >
              <option value="all">All Years</option>
              {data.availableYears.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => fetchData(selectedYear)}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm py-4">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          Loading payment rosters…
        </div>
      )}
      {!loading && error && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {!loading && !error && data && (
        <>
          {unseededCycles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider px-0.5">
                Rosters Ready to Seed
              </h3>
              {unseededCycles.map((cycle) => (
                <UnseededCycleCard
                  key={cycle.cycleId}
                  cycle={cycle}
                  onSeeded={() => fetchData(selectedYear)}
                />
              ))}
            </div>
          )}

          {data.rosters.length === 0 && unseededCycles.length === 0 ? (
            <p className="text-zinc-500 text-sm italic py-2">
              No payment records found{selectedYear !== "all" ? ` for ${selectedYear}` : ""}.
            </p>
          ) : data.rosters.length > 0 ? (
            <div className="space-y-3">
              {data.rosters.map((roster) => (
                <RosterCard
                  key={roster.rosterTag}
                  roster={roster}
                  org={org}
                  onTogglePaid={(paymentId, newIsPaid) =>
                    handleTogglePaid(roster.rosterTag, paymentId, newIsPaid)
                  }
                  onEdited={() => fetchData(selectedYear)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
