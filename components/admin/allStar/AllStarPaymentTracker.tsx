"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type PaymentRecord = {
  id: string;
  organizationId: string;
  ballotCycleId: string;
  candidateId: string | null;
  playerFullName: string;
  ageGroup: string;
  team: string;
  payerName: string | null;
  paypalTxId: string | null;
  paypalTxDate: string | null;
  paypalNote: string | null;
  amountCents: number;
  isPaid: boolean;
  paidAt: string | null;
  markedPaidByAdminId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentSummary = {
  total: number;
  paidCount: number;
  unpaidCount: number;
  totalCollectedCents: number;
  totalOutstandingCents: number;
};

type AllStarPaymentTrackerProps = {
  cycleId: string;
  org: string;
  cycleName: string;
};

type FilterMode = "all" | "paid" | "unpaid";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AllStarPaymentTracker({ cycleId, org, cycleName }: AllStarPaymentTrackerProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSource, setSeedSource] = useState<"final_roster" | "all_candidates" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [rosterSize, setRosterSize] = useState(12);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Edit payer name / notes inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPayerName, setEditPayerName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/all-star/payments?cycleId=${encodeURIComponent(cycleId)}&org=${encodeURIComponent(org)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load payments");
      setPayments(data.payments ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [cycleId, org]);

  useEffect(() => { void fetchPayments(); }, [fetchPayments]);

  async function seedFromRoster() {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "seed_from_roster", cycleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to seed roster");
      if (data.source) setSeedSource(data.source as "final_roster" | "all_candidates");
      await fetchPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSeeding(false);
    }
  }

  async function togglePaid(payment: PaymentRecord) {
    setTogglingId(payment.id);
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, isPaid: !payment.isPaid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update payment");
      setPayments((prev) => prev.map((p) => (p.id === payment.id ? data.payment : p)));
      setSummary((prev) => {
        if (!prev) return prev;
        const delta = !payment.isPaid ? 1 : -1;
        return {
          ...prev,
          paidCount: prev.paidCount + delta,
          unpaidCount: prev.unpaidCount - delta,
          totalCollectedCents: prev.totalCollectedCents + delta * payment.amountCents,
          totalOutstandingCents: prev.totalOutstandingCents - delta * payment.amountCents,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTogglingId(null);
    }
  }

  function startEdit(payment: PaymentRecord) {
    setEditingId(payment.id);
    setEditPayerName(payment.payerName ?? "");
    setEditNotes(payment.notes ?? "");
  }

  async function saveEdit(paymentId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, payerName: editPayerName, notes: editNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? data.payment : p)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(paymentId: string) {
    setRemovingId(paymentId);
    try {
      const target = payments.find((p) => p.id === paymentId);
      const res = await fetch("/api/admin/all-star/payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      setSummary((prev) => {
        if (!prev || !target) return prev;
        return {
          ...prev,
          total: prev.total - 1,
          paidCount: target.isPaid ? prev.paidCount - 1 : prev.paidCount,
          unpaidCount: !target.isPaid ? prev.unpaidCount - 1 : prev.unpaidCount,
          totalCollectedCents: target.isPaid ? prev.totalCollectedCents - target.amountCents : prev.totalCollectedCents,
          totalOutstandingCents: !target.isPaid ? prev.totalOutstandingCents - target.amountCents : prev.totalOutstandingCents,
        };
      });
      setConfirmRemoveId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const res = await fetch(
        `/api/admin/all-star/payments/export?cycleId=${encodeURIComponent(cycleId)}&org=${encodeURIComponent(org)}`,
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileMatch = disposition.match(/filename="(.+)"/);
      a.download = fileMatch?.[1] ?? `AllStar_Payments.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  }

  async function handlePayPalSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/all-star/payments/paypal-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId }),
      });
      const data = await res.json();
      if (res.status === 501) {
        setSyncMsg("PayPal not configured yet. See .env.local for setup instructions.");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setSyncMsg(`Synced: ${data.matched} matched, ${data.alreadyPaid} already paid, ${data.unmatched?.length ?? 0} unmatched.`);
      await fetchPayments();
    } catch (err) {
      setSyncMsg(`${err instanceof Error ? err.message : "Sync failed"}`);
    } finally {
      setSyncing(false);
    }
  }

  const visible = useMemo(() => {
    let list = payments;
    if (filter === "paid") list = list.filter((p) => p.isPaid);
    if (filter === "unpaid") list = list.filter((p) => !p.isPaid);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.playerFullName.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q) ||
          (p.payerName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [payments, filter, search]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-8 text-center text-zinc-400">
        Loading payment records…
      </div>
    );
  }

  const overRoster = payments.length > rosterSize;
  const atRoster = payments.length === rosterSize;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">All-Star Fee Tracker</h3>
            <p className="text-sm text-zinc-400 mt-0.5">{cycleName} · $95.00 per player</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePayPalSync()}
              disabled={syncing}
              title="Sync with PayPal (requires API credentials)"
              className="flex items-center gap-1.5 rounded-lg border border-blue-700/60 bg-blue-950/30 px-3 py-2 text-sm text-blue-300 hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PayPalIcon />
              {syncing ? "Syncing…" : "Sync PayPal"}
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exportLoading || payments.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ExcelIcon />
              {exportLoading ? "Exporting…" : "Export to Excel"}
            </button>
          </div>
        </div>
        {syncMsg && (
          <p className="mt-3 text-sm text-zinc-300 rounded-lg bg-zinc-800 px-3 py-2">{syncMsg}</p>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-400 rounded-lg bg-red-950/30 border border-red-800/40 px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Summary Cards */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Players" value={String(summary.total)} />
          <SummaryCard label="Paid" value={String(summary.paidCount)} accent="emerald" sub={fmtMoney(summary.totalCollectedCents)} />
          <SummaryCard label="Unpaid" value={String(summary.unpaidCount)} accent={summary.unpaidCount > 0 ? "amber" : undefined} sub={fmtMoney(summary.totalOutstandingCents)} />
          <SummaryCard label="Collected" value={fmtMoney(summary.totalCollectedCents)} accent="emerald" />
        </div>
      )}

      {/* Empty state */}
      {payments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center space-y-4">
          <p className="text-zinc-400">No payment records yet for this cycle.</p>
          <p className="text-zinc-500 text-sm">
            Loads the <strong className="text-zinc-300">final roster</strong> (admin-selected players) if it has been set in the Ballot tab.
            Falls back to all active candidates if the final roster hasn't been marked yet.
          </p>
          <button
            type="button"
            onClick={() => void seedFromRoster()}
            disabled={seeding}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {seeding ? "Loading roster…" : "📋 Load Final Roster"}
          </button>
        </div>
      ) : (
        <>
          {/* Roster Size Control */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-400">Roster size target:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={rosterSize}
                onChange={(e) => setRosterSize(Math.max(1, Number(e.target.value)))}
                className="w-16 rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:border-zinc-500"
              />
              <span className="text-sm text-zinc-500">players</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={"text-sm font-semibold tabular-nums " + (overRoster ? "text-amber-400" : "text-emerald-300")}>
                {payments.length} loaded
              </span>
              {overRoster && (
                <span className="text-xs text-amber-500 bg-amber-950/30 border border-amber-800/40 rounded-full px-2 py-0.5">
                  {payments.length - rosterSize} over roster — use ✕ to remove players not on the final team
                </span>
              )}
              {atRoster && (
                <span className="text-xs text-emerald-500 bg-emerald-950/30 border border-emerald-800/40 rounded-full px-2 py-0.5">
                  ✓ Roster complete
                </span>
              )}
              {!overRoster && !atRoster && (
                <span className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-full px-2 py-0.5">
                  {rosterSize - payments.length} spots open
                </span>
              )}
            </div>
          </div>

          {/* Source badge */}
          {seedSource && (
            <div className={"flex items-center gap-2 text-xs px-3 py-2 rounded-lg border " + (
              seedSource === "final_roster"
                ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-400"
                : "bg-amber-950/20 border-amber-800/40 text-amber-400"
            )}>
              {seedSource === "final_roster" ? (
                <>✓ Loaded from <strong>final roster</strong> — these are the admin-selected All-Star players.</>
              ) : (
                <>⚠ Final roster not yet set — loaded all active candidates. Go to the <strong>Ballots</strong> tab to mark the final roster, then use ↻ Refresh to reload.</>
              )}
            </div>
          )}

          {/* Filters + Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1">
              {(["all", "paid", "unpaid"] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilter(mode)}
                  className={"rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors " + (
                    filter === mode
                      ? "bg-brand-purple/20 text-brand-purple border border-brand-purple/40"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {mode}{" "}
                  {mode === "all" ? `(${payments.length})` : mode === "paid" ? `(${summary?.paidCount ?? 0})` : `(${summary?.unpaidCount ?? 0})`}
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="Search player, team, payer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={() => void seedFromRoster()}
              disabled={seeding}
              title="Sync any new roster additions"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {seeding ? "Refreshing…" : "↻ Refresh Roster"}
            </button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Player</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Team</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Age</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Payer</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Paid Date</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 text-right">Actions</th>
                  <th className="px-2 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">No records match your filter.</td>
                  </tr>
                ) : (
                  visible.map((payment) => (
                    <tr
                      key={payment.id}
                      className={"border-b border-zinc-800/60 last:border-0 transition-colors " + (payment.isPaid ? "bg-emerald-950/10" : "")}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-200 whitespace-nowrap">
                        {payment.playerFullName}
                        {payment.candidateId === null && (
                          <span className="ml-1.5 text-[10px] text-zinc-500 border border-zinc-700 rounded px-1">manual</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{payment.team || "—"}</td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{payment.ageGroup}</td>
                      <td className="px-4 py-3 text-zinc-300 min-w-[150px]">
                        {editingId === payment.id ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              placeholder="Payer name"
                              value={editPayerName}
                              onChange={(e) => setEditPayerName(e.target.value)}
                              className="w-full rounded bg-zinc-800 border border-zinc-600 px-2 py-1 text-xs focus:outline-none"
                            />
                            <input
                              type="text"
                              placeholder="Notes"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="w-full rounded bg-zinc-800 border border-zinc-600 px-2 py-1 text-xs focus:outline-none"
                            />
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer hover:text-zinc-100 group"
                            onClick={() => startEdit(payment)}
                            title="Click to edit payer name / notes"
                          >
                            {payment.payerName ?? (
                              <span className="text-zinc-600 group-hover:text-zinc-400 text-xs italic">add payer…</span>
                            )}
                            {payment.notes && (
                              <span className="block text-[11px] text-zinc-500 mt-0.5">{payment.notes}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-300 tabular-nums whitespace-nowrap">{fmtMoney(payment.amountCents)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold " + (
                          payment.isPaid
                            ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/50"
                            : "bg-amber-950/30 text-amber-400 border border-amber-800/40"
                        )}>
                          {payment.isPaid ? "✓ Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">{fmtDate(payment.paidAt ?? payment.paypalTxDate)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {editingId === payment.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void saveEdit(payment.id)}
                              disabled={saving}
                              className="rounded px-2.5 py-1 text-xs bg-brand-purple/20 text-brand-purple border border-brand-purple/40 hover:bg-brand-purple/30 disabled:opacity-50"
                            >
                              {saving ? "…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void togglePaid(payment)}
                            disabled={togglingId === payment.id}
                            className={"rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " + (
                              payment.isPaid
                                ? "border-amber-800/50 text-amber-400 hover:bg-amber-950/30"
                                : "border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/30"
                            )}
                          >
                            {togglingId === payment.id ? "…" : payment.isPaid ? "Mark Unpaid" : "Mark Paid ✓"}
                          </button>
                        )}
                      </td>
                      {/* Remove cell */}
                      <td className="px-2 py-3 text-center">
                        {confirmRemoveId === payment.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              type="button"
                              onClick={() => void removePayment(payment.id)}
                              disabled={removingId === payment.id}
                              className="rounded px-1.5 py-1 text-[10px] bg-red-950/40 text-red-400 border border-red-800/50 hover:bg-red-900/40 disabled:opacity-50"
                            >
                              {removingId === payment.id ? "…" : "Yes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              className="rounded px-1.5 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(payment.id)}
                            title="Remove this player from tracker"
                            className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                          >
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                              <line x1="3" y1="3" x2="13" y2="13" />
                              <line x1="13" y1="3" x2="3" y2="13" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PayPal TX details */}
          {payments.some((p) => p.paypalTxId) && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs">
              <summary className="px-4 py-3 cursor-pointer text-zinc-400 hover:text-zinc-200 font-medium">
                PayPal Transaction Details ({payments.filter((p) => p.paypalTxId).length} matched)
              </summary>
              <div className="px-4 pb-4 space-y-1">
                {payments.filter((p) => p.paypalTxId).map((p) => (
                  <div key={p.id} className="flex gap-4 text-zinc-400 py-1 border-t border-zinc-800">
                    <span className="w-40 font-medium text-zinc-300">{p.playerFullName}</span>
                    <span className="font-mono text-zinc-500">{p.paypalTxId}</span>
                    <span>{fmtDate(p.paypalTxDate)}</span>
                    <span className="text-zinc-500 italic">{p.paypalNote}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "emerald" | "amber" }) {
  const valueColor = accent === "emerald" ? "text-emerald-300" : accent === "amber" ? "text-amber-300" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={"text-xl font-bold tabular-nums mt-0.5 " + valueColor}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function PayPalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M7.76 22H5l1.5-9.5H3L4.5 3h7c2.5 0 4.25 1.25 4 4-.25 2.5-2 4-4.5 4H9.5L8.25 16H11l-.75 4H7.76z" opacity=".6"/>
      <path d="M12.5 3h4.5c2.5 0 4 1.5 3.5 4C20 9.5 18 11 15.5 11H14l-1 6h-2.5l2-14z"/>
    </svg>
  );
}

function ExcelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
