"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachRosterBuilderModal } from "@/components/admin/allStar/CoachRosterBuilderModal";
import AllStarPaypalCsvImport from "@/components/admin/allStar/AllStarPaypalCsvImport";
import AllStarPlayerSearch from "@/components/admin/allStar/AllStarPlayerSearch";

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

type RosterGroup = {
  rosterTag: string;
  summary: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  payments: PaymentRow[];
};

type CycleSummary = {
  cycleId: string;
  cycleName: string;
  seasonYear: number;
  ageGroup: string;
  finalizedCount: number;
  summary: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  rosters: RosterGroup[];
};

type OrgReport = {
  orgId: string;
  orgName: string;
  totals: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  cycles: CycleSummary[];
};

type SummaryData = {
  orgs: OrgReport[];
  grandTotals: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  availableYears: number[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paidPct(paid: number, total: number) {
  if (total === 0) return 0;
  return Math.round((paid / total) * 100);
}

// Parse a cycleName / rosterTag like "2026 - 8U MAJ LLB - NAVY"
// into { year, ageGroupLabel, teamColor }
function parseCycleName(tag: string): { year: number; ageGroupLabel: string; teamColor: string } {
  const parts = tag.split(" - ");
  if (parts.length < 2) return { year: 0, ageGroupLabel: tag, teamColor: "" };
  const year = parseInt(parts[0], 10);
  const teamColor = parts[parts.length - 1];
  const ageGroupLabel = parts.slice(1, -1).join(" - ");
  return { year, ageGroupLabel, teamColor };
}

// ─── Age-group grouping ───────────────────────────────────────────────────────

interface AgeGroupEntry {
  key: string;            // "2026 - 8U MAJ LLB"
  year: number;
  ageGroupLabel: string;
  cycles: CycleSummary[]; // all cycles with this year+ageGroupLabel
  combined: {
    total: number;
    paidCount: number;
    unpaidCount: number;
    collectedCents: number;
    outstandingCents: number;
  };
  seedableCycleIds: string[];  // unique cycleIds that are seedable (0 payments, >0 finalized)
  resyncableCycleIds: string[]; // unique cycleIds resyncable (>0 payments, >0 finalized)
  totalFinalized: number;      // sum of finalizedCount across all cycles (for Seed button label)
}

function buildAgeGroups(cycles: CycleSummary[]): AgeGroupEntry[] {
  // Hide cycles that have nothing to show (0 finalized AND 0 payment records)
  const visible = cycles.filter((c) => c.finalizedCount > 0 || c.summary.total > 0);

  const map = new Map<string, AgeGroupEntry>();
  for (const c of visible) {
    const { year, ageGroupLabel } = parseCycleName(c.cycleName);
    const key = `${year} - ${ageGroupLabel}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year,
        ageGroupLabel,
        cycles: [],
        combined: { total: 0, paidCount: 0, unpaidCount: 0, collectedCents: 0, outstandingCents: 0 },
        seedableCycleIds: [],
        resyncableCycleIds: [],
        totalFinalized: 0,
      });
    }
    const g = map.get(key)!;
    g.cycles.push(c);
    g.combined.total += c.summary.total;
    g.combined.paidCount += c.summary.paidCount;
    g.combined.unpaidCount += c.summary.unpaidCount;
    g.combined.collectedCents += c.summary.collectedCents;
    g.combined.outstandingCents += c.summary.outstandingCents;
    g.totalFinalized += c.finalizedCount;
    if (c.summary.total === 0 && c.finalizedCount > 0 && !g.seedableCycleIds.includes(c.cycleId)) {
      g.seedableCycleIds.push(c.cycleId);
    }
    if (c.summary.total > 0 && c.finalizedCount > 0 && !g.resyncableCycleIds.includes(c.cycleId)) {
      g.resyncableCycleIds.push(c.cycleId);
    }
  }

  function ageNum(label: string) { const m = label.match(/^(\d+)/); return m ? parseInt(m[1], 10) : 999; }
  return Array.from(map.values()).sort(
    (a, b) => b.year - a.year || ageNum(a.ageGroupLabel) - ageNum(b.ageGroupLabel),
  );
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  highlight,
  onClick,
  active,
}: {
  label: string;
  value: string;
  highlight?: "green" | "amber" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  let color = "text-zinc-200 border-zinc-700 bg-zinc-900/50";
  if (highlight === "green") color = "text-emerald-300 border-emerald-800/50 bg-emerald-950/30";
  if (highlight === "amber") color = "text-amber-300 border-amber-800/50 bg-amber-950/30";
  if (highlight === "red") color = "text-red-300 border-red-800/50 bg-red-950/30";
  const interactive = onClick
    ? " cursor-pointer hover:brightness-125 transition-all " + (active ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-zinc-950" : "")
    : "";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={"rounded-lg border px-3 py-2 text-center min-w-[90px] " + color + interactive}>
      <div className="text-xs opacity-70 mb-0.5">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </Tag>
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

// ─── Shared edit helpers ─────────────────────────────────────────────────────

type EditRow = { id: string; playerFullName: string; team: string; amountCents: number };

function useRosterEdit(payments: PaymentRow[], onSaved: () => void) {
  const [editing, setEditing] = React.useState(false);
  const [editRows, setEditRows] = React.useState<EditRow[]>([]);
  const [bulkFee, setBulkFee] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  function startEdit() {
    setEditRows(payments.map((p) => ({ id: p.id, playerFullName: p.playerFullName, team: p.team, amountCents: p.amountCents })));
    setBulkFee(""); setSaveError(null); setEditing(true);
  }
  function applyBulkFee() {
    const cents = Math.round(parseFloat(bulkFee) * 100);
    if (!isNaN(cents) && cents > 0) setEditRows((rows) => rows.map((r) => ({ ...r, amountCents: cents })));
  }
  function updateRow(id: string, field: keyof EditRow, value: string | number) {
    setEditRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  async function saveEdits() {
    setSaving(true); setSaveError(null);
    try {
      const original = new Map(payments.map((p) => [p.id, p]));
      const dirty = editRows.filter((r) => {
        const o = original.get(r.id);
        return o && (r.playerFullName !== o.playerFullName || r.team !== o.team || r.amountCents !== o.amountCents);
      });
      for (const row of dirty) {
        const res = await fetch("/api/admin/all-star/payments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId: row.id, playerFullName: row.playerFullName, team: row.team, amountCents: row.amountCents }),
        });
        if (!res.ok) { const j = (await res.json()) as { error?: string }; throw new Error(j.error ?? "Save failed"); }
      }
      setEditing(false); onSaved();
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Save failed"); }
    finally { setSaving(false); }
  }
  return { editing, editRows, bulkFee, setBulkFee, saving, saveError, startEdit, applyBulkFee, updateRow, saveEdits, cancelEdit: () => setEditing(false) };
}

function EditToolbar({ editing, editRows, bulkFee, setBulkFee, saving, saveError, startEdit, applyBulkFee, saveEdits, cancelEdit, paymentsLen }: {
  editing: boolean; editRows: EditRow[]; bulkFee: string; setBulkFee: (v: string) => void;
  saving: boolean; saveError: string | null; startEdit: () => void; applyBulkFee: () => void;
  saveEdits: () => Promise<void>; cancelEdit: () => void; paymentsLen: number;
}) {
  if (!editing) {
    return (
      <div className="flex justify-end mb-2">
        <button type="button" onClick={startEdit} className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          ✏ Edit Roster
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 mb-3">
      <div className="flex items-center gap-2 rounded-lg border border-violet-700/40 bg-violet-950/20 px-3 py-2">
        <span className="text-xs text-violet-300 font-medium shrink-0">Change fee for all:</span>
        <div className="flex items-center rounded border border-zinc-700 bg-zinc-900 overflow-hidden">
          <span className="px-2 text-zinc-500 text-sm border-r border-zinc-700">$</span>
          <input type="number" min="0" step="0.01" value={bulkFee} onChange={(e) => setBulkFee(e.target.value)}
            placeholder={editRows[0] ? String((editRows[0].amountCents / 100).toFixed(2)) : "95.00"}
            className="w-20 bg-transparent px-2 py-1 text-sm text-zinc-200 outline-none" />
        </div>
        <button type="button" onClick={applyBulkFee} className="rounded border border-violet-700/50 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-900/30 transition-colors">
          Apply to All
        </button>
      </div>
      {saveError && <p className="text-xs text-red-400 rounded border border-red-800/40 bg-red-950/20 px-3 py-1.5">{saveError}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={cancelEdit} disabled={saving} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-40">Cancel</button>
        <button type="button" onClick={() => void saveEdits()} disabled={saving} className="rounded bg-violet-700 hover:bg-violet-600 disabled:opacity-40 px-4 py-1.5 text-xs font-semibold text-white">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function EditTable({ editRows, updateRow }: { editRows: EditRow[]; updateRow: (id: string, field: keyof EditRow, value: string | number) => void }) {
  return (
    <div className="overflow-x-auto rounded border border-zinc-700/50 mb-2">
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
                <input type="text" value={row.playerFullName} onChange={(e) => updateRow(row.id, "playerFullName", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none" />
              </td>
              <td className="px-3 py-1.5">
                <input type="text" value={row.team} onChange={(e) => updateRow(row.id, "team", e.target.value)}
                  className="w-32 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-violet-600 focus:outline-none" />
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center justify-end rounded border border-zinc-700 bg-zinc-800 overflow-hidden w-28 ml-auto">
                  <span className="px-1.5 text-zinc-500 text-sm border-r border-zinc-700">$</span>
                  <input type="number" min="0" step="0.01" value={(row.amountCents / 100).toFixed(2)}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) updateRow(row.id, "amountCents", Math.round(v * 100)); }}
                    className="w-full bg-transparent px-2 py-1 text-sm text-zinc-200 text-right focus:outline-none" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── RosterRow: expanded payment list for one rosterTag ──────────────────────

function RosterRow({
  roster,
  onPaymentToggled,
  hideHeader = false,
}: {
  roster: RosterGroup;
  onPaymentToggled: (isPaidNow: boolean, amountCents: number) => void;
  hideHeader?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(hideHeader);
  const [payments, setPayments] = React.useState<PaymentRow[]>(roster.payments);
  const [toggling, setToggling] = React.useState<Set<string>>(new Set());

  const paidCount = payments.filter((p) => p.isPaid).length;
  const unpaidCount = payments.length - paidCount;
  const collectedCents = payments.filter((p) => p.isPaid).reduce((s, p) => s + p.amountCents, 0);
  const s = { total: payments.length, paidCount, unpaidCount, collectedCents };

  const edit = useRosterEdit(payments, () => {
    // Reload payments from API after save by re-fetching — simplest: just update local state from editRows
    setPayments((prev) => prev.map((p) => {
      const updated = edit.editRows.find((r) => r.id === p.id);
      return updated ? { ...p, playerFullName: updated.playerFullName, team: updated.team, amountCents: updated.amountCents } : p;
    }));
  });

  async function togglePayment(paymentId: string, currentIsPaid: boolean, amountCents: number) {
    if (toggling.has(paymentId)) return;
    setToggling((prev) => new Set(prev).add(paymentId));
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? { ...p, isPaid: !currentIsPaid, paidAt: !currentIsPaid ? new Date().toISOString() : null }
          : p,
      ),
    );
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, isPaid: !currentIsPaid }),
      });
      if (!res.ok) {
        setPayments((prev) =>
          prev.map((p) => (p.id === paymentId ? { ...p, isPaid: currentIsPaid, paidAt: null } : p)),
        );
      } else {
        onPaymentToggled(!currentIsPaid, amountCents);
      }
    } catch {
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, isPaid: currentIsPaid, paidAt: null } : p)),
      );
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  }

  return (
    <div className={hideHeader ? "" : "rounded-lg border border-zinc-700/40 bg-zinc-900/20 overflow-hidden"}>
      {!hideHeader && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition-colors text-left"
        >
          <span className="text-sm font-medium text-zinc-200 truncate">{roster.rosterTag}</span>
          <div className="flex items-center gap-4 shrink-0">
            {s.total > 0 && (
              <>
                <div className="hidden sm:flex items-center gap-3 text-xs">
                  <span className="text-emerald-400">{s.paidCount} paid</span>
                  {s.unpaidCount > 0 && <span className="text-amber-400">{s.unpaidCount} unpaid</span>}
                  <span className="text-zinc-400">{fmtMoney(s.collectedCents)}</span>
                </div>
                <div className="w-20 hidden md:block">
                  <ProgressBar paid={s.paidCount} total={s.total} />
                </div>
              </>
            )}
            <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
          </div>
        </button>
      )}
      {(expanded || hideHeader) && (
        <div className={hideHeader ? "" : "border-t border-zinc-700/40 px-4 py-3"}>
          <EditToolbar {...edit} paymentsLen={payments.length} />
          {edit.editing ? (
            <EditTable editRows={edit.editRows} updateRow={edit.updateRow} />
          ) : payments.length === 0 ? (
            <p className="text-zinc-500 text-sm italic">No payment records.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500 border-b border-zinc-700/50">
                    <th className="text-left py-2 pr-4 font-medium">Player</th>
                    <th className="text-left py-2 pr-4 font-medium">Team</th>
                    <th className="text-left py-2 pr-4 font-medium">Payer</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-800/50 last:border-0">
                      <td className="py-1.5 pr-4 text-zinc-200">{p.playerFullName}</td>
                      <td className="py-1.5 pr-4 text-zinc-400 text-xs">{p.team || "—"}</td>
                      <td className="py-1.5 pr-4 text-zinc-400 text-xs">{p.payerName || "—"}</td>
                      <td className="py-1.5 pr-4">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void togglePayment(p.id, p.isPaid, p.amountCents); }}
                          disabled={toggling.has(p.id)}
                          className={
                            "rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 " +
                            (p.isPaid
                              ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-950/80"
                              : "bg-amber-950/50 text-amber-300 border border-amber-800/50 hover:bg-amber-950/80")
                          }
                        >
                          {toggling.has(p.id) ? "…" : p.isPaid ? "✓ Paid" : "Mark Paid"}
                        </button>
                      </td>
                      <td className="py-1.5 text-right text-zinc-300 text-xs">{fmtMoney(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CycleRow: single flat row (single-team groups) ──────────────────────────

function CycleRow({
  cycle,
  onPaymentToggled,
  onSeedPayments,
}: {
  cycle: CycleSummary;
  onPaymentToggled: (isPaidNow: boolean, amountCents: number) => void;
  onSeedPayments: (cycleId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const s = cycle.summary;
  const seedable = s.total === 0 && cycle.finalizedCount > 0;
  const resyncable = s.total > 0 && cycle.finalizedCount > 0;

  async function handleSeed(e: React.MouseEvent) {
    e.stopPropagation();
    setSeeding(true);
    try {
      await onSeedPayments(cycle.cycleId);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30 overflow-hidden">
      {/* div instead of button — action buttons (seed/sync) cannot be nested inside a <button> */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((p) => !p); }}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-zinc-200 truncate">{cycle.cycleName}</span>
          {s.total === 0 && !seedable && <span className="text-xs text-zinc-500 italic">no payments</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {seedable && (
            <button
              type="button"
              disabled={seeding}
              onClick={(e) => void handleSeed(e)}
              className="text-xs border border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 disabled:opacity-50 px-2.5 py-1 rounded transition-colors"
            >
              {seeding ? "Seeding…" : `Seed Payments (${cycle.finalizedCount})`}
            </button>
          )}
          {resyncable && (
            <button
              type="button"
              disabled={seeding}
              onClick={(e) => void handleSeed(e)}
              className="text-xs border border-sky-700 bg-sky-900/30 text-sky-300 hover:bg-sky-800/40 disabled:opacity-50 px-2.5 py-1 rounded transition-colors"
            >
              {seeding ? "Syncing…" : "↻ Sync Roster"}
            </button>
          )}
          {s.total > 0 && (
            <>
              <div className="hidden sm:flex items-center gap-3 text-xs">
                <span className="text-emerald-400">{s.paidCount} paid</span>
                {s.unpaidCount > 0 && <span className="text-amber-400">{s.unpaidCount} unpaid</span>}
                <span className="text-zinc-400">{fmtMoney(s.collectedCents)} collected</span>
              </div>
              <div className="w-20 hidden md:block">
                <ProgressBar paid={s.paidCount} total={s.total} />
              </div>
            </>
          )}
          <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-zinc-700/50 px-4 py-3 space-y-2">
          {cycle.rosters.length === 0 ? (
            <p className="text-zinc-500 text-sm italic">
              {seedable
                ? `${cycle.finalizedCount} player${cycle.finalizedCount !== 1 ? "s" : ""} finalized — click "Seed Payments" to create records.`
                : "No payment records for this cycle."}
            </p>
          ) : (
            <>
              {cycle.rosters.length > 1 && (
                <p className="text-xs text-zinc-500 mb-2">{cycle.rosters.length} rosters</p>
              )}
              {cycle.rosters.map((roster) => (
                <RosterRow
                  key={roster.rosterTag}
                  roster={roster}
                  onPaymentToggled={onPaymentToggled}
                  hideHeader={cycle.rosters.length === 1}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TeamChildRow: one child inside a multi-team parent ──────────────────────

function TeamChildRow({
  cycle,
  teamColor,
  onPaymentToggled,
}: {
  cycle: CycleSummary;
  teamColor: string;
  onPaymentToggled: (cycleId: string, isPaidNow: boolean, amountCents: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = cycle.summary;
  const isUnseeded = s.total === 0 && cycle.finalizedCount > 0;

  return (
    <div className="rounded-md border border-zinc-700/30 bg-zinc-900/20 overflow-hidden ml-2">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2 hover:bg-zinc-800/20 text-left transition-colors"
      >
        <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{teamColor}</span>
        <div className="flex items-center gap-3 shrink-0">
          {isUnseeded && (
            <span className="text-xs text-zinc-500 italic">{cycle.finalizedCount} finalized</span>
          )}
          {s.total > 0 && (
            <>
              <div className="hidden sm:flex items-center gap-3 text-xs">
                <span className="text-emerald-400">{s.paidCount} paid</span>
                {s.unpaidCount > 0 && <span className="text-amber-400">{s.unpaidCount} unpaid</span>}
                <span className="text-zinc-400">{fmtMoney(s.collectedCents)}</span>
              </div>
              <div className="w-16 hidden md:block">
                <ProgressBar paid={s.paidCount} total={s.total} />
              </div>
            </>
          )}
          <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-700/30 px-4 py-3 space-y-2">
          {isUnseeded ? (
            <p className="text-zinc-500 text-sm italic">
              {cycle.finalizedCount} player{cycle.finalizedCount !== 1 ? "s" : ""} finalized — use &ldquo;Seed Payments&rdquo; above to create records.
            </p>
          ) : cycle.rosters.length === 0 ? (
            <p className="text-zinc-500 text-sm italic">No payment records.</p>
          ) : (
            cycle.rosters.map((roster) => (
              <RosterRow
                key={roster.rosterTag}
                roster={roster}
                onPaymentToggled={(isPaidNow, amountCents) =>
                  onPaymentToggled(cycle.cycleId, isPaidNow, amountCents)
                }
                hideHeader={cycle.rosters.length === 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── RosterChildRow: child for single-cycle multi-team (one rosterTag = one team) ──

function RosterChildRow({
  roster,
  teamColor,
  onPaymentToggled,
}: {
  roster: RosterGroup;
  teamColor: string;
  onPaymentToggled: (isPaidNow: boolean, amountCents: number) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentRow[]>(roster.payments);
  const [toggling, setToggling] = React.useState<Set<string>>(new Set());

  const paidCount = payments.filter((p) => p.isPaid).length;
  const unpaidCount = payments.length - paidCount;
  const collectedCents = payments.filter((p) => p.isPaid).reduce((s, p) => s + p.amountCents, 0);
  const s = { total: payments.length, paidCount, unpaidCount, collectedCents };

  const edit = useRosterEdit(payments, () => {
    setPayments((prev) => prev.map((p) => {
      const updated = edit.editRows.find((r) => r.id === p.id);
      return updated ? { ...p, playerFullName: updated.playerFullName, team: updated.team, amountCents: updated.amountCents } : p;
    }));
  });

  async function togglePayment(paymentId: string, currentIsPaid: boolean, amountCents: number) {
    if (toggling.has(paymentId)) return;
    setToggling((prev) => new Set(prev).add(paymentId));
    setPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? { ...p, isPaid: !currentIsPaid, paidAt: !currentIsPaid ? new Date().toISOString() : null }
          : p,
      ),
    );
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, isPaid: !currentIsPaid }),
      });
      if (!res.ok) {
        setPayments((prev) =>
          prev.map((p) => (p.id === paymentId ? { ...p, isPaid: currentIsPaid, paidAt: null } : p)),
        );
      } else {
        onPaymentToggled(!currentIsPaid, amountCents);
      }
    } catch {
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, isPaid: currentIsPaid, paidAt: null } : p)),
      );
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  }

  return (
    <div className="rounded-md border border-zinc-700/30 bg-zinc-900/20 overflow-hidden ml-2">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2 hover:bg-zinc-800/20 text-left transition-colors"
      >
        <span className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{teamColor}</span>
        <div className="flex items-center gap-3 shrink-0">
          {s.total > 0 && (
            <>
              <div className="hidden sm:flex items-center gap-3 text-xs">
                <span className="text-emerald-400">{s.paidCount} paid</span>
                {s.unpaidCount > 0 && <span className="text-amber-400">{s.unpaidCount} unpaid</span>}
                <span className="text-zinc-400">{fmtMoney(s.collectedCents)}</span>
              </div>
              <div className="w-16 hidden md:block">
                <ProgressBar paid={s.paidCount} total={s.total} />
              </div>
            </>
          )}
          <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-700/30 px-4 py-3">
          <EditToolbar {...edit} paymentsLen={payments.length} />
          {edit.editing ? (
            <EditTable editRows={edit.editRows} updateRow={edit.updateRow} />
          ) : payments.length === 0 ? (
            <p className="text-zinc-500 text-sm italic">No payment records.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500 border-b border-zinc-700/50">
                    <th className="text-left py-2 pr-4 font-medium">Player</th>
                    <th className="text-left py-2 pr-4 font-medium">Team</th>
                    <th className="text-left py-2 pr-4 font-medium">Payer</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-800/50 last:border-0">
                      <td className="py-1.5 pr-4 text-zinc-200">{p.playerFullName}</td>
                      <td className="py-1.5 pr-4 text-zinc-400 text-xs">{p.team || "—"}</td>
                      <td className="py-1.5 pr-4 text-zinc-400 text-xs">{p.payerName || "—"}</td>
                      <td className="py-1.5 pr-4">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void togglePayment(p.id, p.isPaid, p.amountCents); }}
                          disabled={toggling.has(p.id)}
                          className={
                            "rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 " +
                            (p.isPaid
                              ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-950/80"
                              : "bg-amber-950/50 text-amber-300 border border-amber-800/50 hover:bg-amber-950/80")
                          }
                        >
                          {toggling.has(p.id) ? "…" : p.isPaid ? "✓ Paid" : "Mark Paid"}
                        </button>
                      </td>
                      <td className="py-1.5 text-right text-zinc-300 text-xs">{fmtMoney(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SingleCycleMultiTeamRow: parent/child for one cycle with multiple rosterTags ──

function SingleCycleMultiTeamRow({
  group,
  cycle,
  onPaymentToggled,
  onSeedPayments,
}: {
  group: AgeGroupEntry;
  cycle: CycleSummary;
  onPaymentToggled: (isPaidNow: boolean, amountCents: number) => void;
  onSeedPayments: (cycleId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const s = cycle.summary;
  const resyncable = s.total > 0 && cycle.finalizedCount > 0;

  async function handleResync(e: React.MouseEvent) {
    e.stopPropagation();
    setSeeding(true);
    try {
      await onSeedPayments(cycle.cycleId);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30 overflow-hidden">
      {/* div instead of button — sync button cannot be nested inside a <button> */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((p) => !p); }}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left cursor-pointer"
      >
        <span className="text-sm font-medium text-zinc-200">{group.key}</span>
        <div className="flex items-center gap-3 shrink-0">
          {resyncable && (
            <button
              type="button"
              disabled={seeding}
              onClick={(e) => void handleResync(e)}
              className="text-xs border border-sky-700 bg-sky-900/30 text-sky-300 hover:bg-sky-800/40 disabled:opacity-50 px-2.5 py-1 rounded transition-colors"
            >
              {seeding ? "Syncing…" : "↻ Sync Roster"}
            </button>
          )}
          {s.total > 0 && (
            <>
              <div className="hidden sm:flex items-center gap-3 text-xs">
                <span className="text-emerald-400">{s.paidCount} paid</span>
                {s.unpaidCount > 0 && <span className="text-amber-400">{s.unpaidCount} unpaid</span>}
                <span className="text-zinc-400">{fmtMoney(s.collectedCents)} collected</span>
              </div>
              <div className="w-20 hidden md:block">
                <ProgressBar paid={s.paidCount} total={s.total} />
              </div>
            </>
          )}
          <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-zinc-700/50 px-4 py-3 space-y-2">
          {cycle.rosters.map((roster) => {
            const { teamColor } = parseCycleName(roster.rosterTag);
            return (
              <RosterChildRow
                key={roster.rosterTag}
                roster={roster}
                teamColor={teamColor || roster.rosterTag}
                onPaymentToggled={onPaymentToggled}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MultiTeamGroupRow: parent + children for multi-team age groups ───────────

function MultiTeamGroupRow({
  group,
  onPaymentToggled,
  onSeedPayments,
}: {
  group: AgeGroupEntry;
  onPaymentToggled: (cycleId: string, isPaidNow: boolean, amountCents: number) => void;
  onSeedPayments: (cycleId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const s = group.combined;
  const isSeedable = group.seedableCycleIds.length > 0;
  const isResyncable = group.resyncableCycleIds.length > 0;

  async function handleSeed(e: React.MouseEvent) {
    e.stopPropagation();
    setSeeding(true);
    try {
      for (const cycleId of group.seedableCycleIds) {
        await onSeedPayments(cycleId);
      }
    } finally {
      setSeeding(false);
    }
  }

  async function handleResync(e: React.MouseEvent) {
    e.stopPropagation();
    setSeeding(true);
    try {
      for (const cycleId of group.resyncableCycleIds) {
        await onSeedPayments(cycleId);
      }
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/30 overflow-hidden">
      {/* Parent row — div instead of button to avoid nesting <button> inside <button> */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((p) => !p); }}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left cursor-pointer"
      >
        <span className="text-sm font-medium text-zinc-200">{group.key}</span>
        <div className="flex items-center gap-3 shrink-0">
          {isSeedable && (
            <button
              type="button"
              disabled={seeding}
              onClick={(e) => void handleSeed(e)}
              className="text-xs border border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 disabled:opacity-50 px-2.5 py-1 rounded transition-colors"
            >
              {seeding ? "Seeding…" : `Seed Payments (${group.totalFinalized})`}
            </button>
          )}
          {isResyncable && (
            <button
              type="button"
              disabled={seeding}
              onClick={(e) => void handleResync(e)}
              className="text-xs border border-sky-700 bg-sky-900/30 text-sky-300 hover:bg-sky-800/40 disabled:opacity-50 px-2.5 py-1 rounded transition-colors"
            >
              {seeding ? "Syncing…" : "↻ Sync Roster"}
            </button>
          )}
          {s.total > 0 && (
            <>
              <div className="hidden sm:flex items-center gap-3 text-xs">
                <span className="text-emerald-400">{s.paidCount} paid</span>
                {s.unpaidCount > 0 && <span className="text-amber-400">{s.unpaidCount} unpaid</span>}
                <span className="text-zinc-400">{fmtMoney(s.collectedCents)} collected</span>
              </div>
              <div className="w-20 hidden md:block">
                <ProgressBar paid={s.paidCount} total={s.total} />
              </div>
            </>
          )}
          <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Child rows */}
      {expanded && (
        <div className="border-t border-zinc-700/50 px-4 py-3 space-y-2">
          {group.cycles.map((cycle) => {
            const { teamColor } = parseCycleName(cycle.cycleName);
            return (
              <TeamChildRow
                key={cycle.cycleId + "-" + teamColor}
                cycle={cycle}
                teamColor={teamColor}
                onPaymentToggled={onPaymentToggled}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AgeGroupRow: dispatcher — flat for single-team, grouped for multi-team ──

function AgeGroupRow({
  group,
  onPaymentToggled,
  onSeedPayments,
}: {
  group: AgeGroupEntry;
  onPaymentToggled: (cycleId: string, isPaidNow: boolean, amountCents: number) => void;
  onSeedPayments: (cycleId: string) => Promise<void>;
}) {
  if (group.cycles.length === 1) {
    const cycle = group.cycles[0];
    // Single cycle with multiple rosterTags (e.g. two-team cycle: NAVY + RED payments in one cycle)
    // → render parent/child just like multi-cycle groups
    if (cycle.rosters.length > 1) {
      return (
        <SingleCycleMultiTeamRow
          group={group}
          cycle={cycle}
          onPaymentToggled={(isPaidNow, amountCents) =>
            onPaymentToggled(cycle.cycleId, isPaidNow, amountCents)
          }
          onSeedPayments={onSeedPayments}
        />
      );
    }
    // Truly single-team: render flat with team color in the label
    return (
      <CycleRow
        cycle={cycle}
        onPaymentToggled={(isPaidNow, amountCents) =>
          onPaymentToggled(cycle.cycleId, isPaidNow, amountCents)
        }
        onSeedPayments={onSeedPayments}
      />
    );
  }
  return (
    <MultiTeamGroupRow
      group={group}
      onPaymentToggled={onPaymentToggled}
      onSeedPayments={onSeedPayments}
    />
  );
}

// ─── OrgSection ──────────────────────────────────────────────────────────────

function OrgSection({
  org,
  onPaymentToggled,
  onSeedPayments,
}: {
  org: OrgReport;
  onPaymentToggled: (cycleId: string, isPaidNow: boolean, amountCents: number) => void;
  onSeedPayments: (cycleId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const t = org.totals;
  const groups = buildAgeGroups(org.cycles);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-800/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-white">{org.orgName}</span>
          <span className="text-xs text-zinc-500">
            {groups.length} age group{groups.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {t.total > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-emerald-400 font-medium">{t.paidCount}/{t.total} paid</span>
              <span className="text-zinc-400">{fmtMoney(t.collectedCents)}</span>
            </div>
          )}
          <span className="text-zinc-500">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-700/50 px-5 py-4 space-y-3">
          {t.total > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <StatChip label="Total Players" value={String(t.total)} />
              <StatChip label="Paid" value={String(t.paidCount)} highlight="green" />
              <StatChip
                label="Unpaid"
                value={String(t.unpaidCount)}
                highlight={t.unpaidCount > 0 ? "amber" : undefined}
              />
              <StatChip label="Collected" value={fmtMoney(t.collectedCents)} highlight="green" />
              <StatChip
                label="Outstanding"
                value={fmtMoney(t.outstandingCents)}
                highlight={t.outstandingCents > 0 ? "red" : undefined}
              />
              <div className="flex-1 min-w-[120px] flex items-center">
                <div className="w-full">
                  <ProgressBar paid={t.paidCount} total={t.total} />
                </div>
              </div>
            </div>
          )}
          {groups.length === 0 ? (
            <p className="text-zinc-500 text-sm italic">No cycles with finalized players.</p>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <AgeGroupRow
                  key={group.key}
                  group={group}
                  onPaymentToggled={onPaymentToggled}
                  onSeedPayments={onSeedPayments}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AllStarCrossOrgPaymentSummary({ org }: { org?: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  const [collapsed, setCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showCoachRosterBuilder, setShowCoachRosterBuilder] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const [activeFilter, setActiveFilter] = useState<"total" | "paid" | "unpaid" | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const didFetch = useRef(false);

  const fetchData = useCallback((year: number | "all") => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (year !== "all") params.set("year", String(year));
    if (org) params.set("org", org);
    const qs = params.toString();
    const url = "/api/admin/all-star/payments/all-orgs" + (qs ? "?" + qs : "");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    fetch(url, { signal: controller.signal })
      .then((res) => res.json().then((json) => ({ res, json })))
      .then(({ res, json }: { res: Response; json: unknown }) => {
        if (!res.ok) {
          throw new Error((json as { error?: string }).error ?? "Failed to load summary");
        }
        setData(json as SummaryData);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Request timed out. The dev database can be slow — click Refresh to try again.");
          return;
        }
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        setLoading(false);
      });
  }, [org]);

  useEffect(() => {
    didFetch.current = true;
    fetchData(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, fetchData]);

  function handlePaymentToggled(
    orgId: string,
    cycleId: string,
    isPaidNow: boolean,
    amountCents: number,
  ) {
    const delta = isPaidNow ? 1 : -1;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        grandTotals: {
          ...prev.grandTotals,
          paidCount: prev.grandTotals.paidCount + delta,
          unpaidCount: prev.grandTotals.unpaidCount - delta,
          collectedCents: prev.grandTotals.collectedCents + delta * amountCents,
          outstandingCents: prev.grandTotals.outstandingCents - delta * amountCents,
        },
        orgs: prev.orgs.map((org) => {
          if (org.orgId !== orgId) return org;
          return {
            ...org,
            totals: {
              ...org.totals,
              paidCount: org.totals.paidCount + delta,
              unpaidCount: org.totals.unpaidCount - delta,
              collectedCents: org.totals.collectedCents + delta * amountCents,
              outstandingCents: org.totals.outstandingCents - delta * amountCents,
            },
            cycles: org.cycles.map((cycle) => {
              if (cycle.cycleId !== cycleId) return cycle;
              return {
                ...cycle,
                summary: {
                  ...cycle.summary,
                  paidCount: cycle.summary.paidCount + delta,
                  unpaidCount: cycle.summary.unpaidCount - delta,
                  collectedCents: cycle.summary.collectedCents + delta * amountCents,
                  outstandingCents: cycle.summary.outstandingCents - delta * amountCents,
                },
              };
            }),
          };
        }),
      };
    });
  }

  function handleDirectPaymentToggle(
    paymentId: string,
    orgId: string,
    cycleId: string,
    amountCents: number,
    newIsPaid: boolean,
  ) {
    const delta = newIsPaid ? 1 : -1;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        grandTotals: {
          ...prev.grandTotals,
          paidCount: prev.grandTotals.paidCount + delta,
          unpaidCount: prev.grandTotals.unpaidCount - delta,
          collectedCents: prev.grandTotals.collectedCents + delta * amountCents,
          outstandingCents: prev.grandTotals.outstandingCents - delta * amountCents,
        },
        orgs: prev.orgs.map((org) => {
          if (org.orgId !== orgId) return org;
          return {
            ...org,
            totals: {
              ...org.totals,
              paidCount: org.totals.paidCount + delta,
              unpaidCount: org.totals.unpaidCount - delta,
              collectedCents: org.totals.collectedCents + delta * amountCents,
              outstandingCents: org.totals.outstandingCents - delta * amountCents,
            },
            cycles: org.cycles.map((cycle) => {
              if (cycle.cycleId !== cycleId) return cycle;
              return {
                ...cycle,
                summary: {
                  ...cycle.summary,
                  paidCount: cycle.summary.paidCount + delta,
                  unpaidCount: cycle.summary.unpaidCount - delta,
                  collectedCents: cycle.summary.collectedCents + delta * amountCents,
                  outstandingCents: cycle.summary.outstandingCents - delta * amountCents,
                },
                rosters: cycle.rosters.map((roster) => {
                  const inRoster = roster.payments.some((p) => p.id === paymentId);
                  return {
                    ...roster,
                    summary: inRoster
                      ? {
                          ...roster.summary,
                          paidCount: roster.summary.paidCount + delta,
                          unpaidCount: roster.summary.unpaidCount - delta,
                          collectedCents: roster.summary.collectedCents + delta * amountCents,
                          outstandingCents: roster.summary.outstandingCents - delta * amountCents,
                        }
                      : roster.summary,
                    payments: roster.payments.map((p) =>
                      p.id === paymentId
                        ? { ...p, isPaid: newIsPaid, paidAt: newIsPaid ? new Date().toISOString() : null }
                        : p,
                    ),
                  };
                }),
              };
            }),
          };
        }),
      };
    });
  }

  async function handleSeedPayments(cycleId: string) {
    const res = await fetch("/api/admin/all-star/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "seed_from_roster", cycleId }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      throw new Error(json.error ?? "Failed to seed payments");
    }
    fetchData(selectedYear);
  }

  function handleExport() {
    setExporting(true);
    const url =
      selectedYear === "all"
        ? "/api/admin/all-star/payments/all-orgs/export"
        : "/api/admin/all-star/payments/all-orgs/export?year=" + String(selectedYear);
    fetch(url)
      .then((res) => {
        if (!res.ok) {
          setError("Export failed");
          return;
        }
        return res.blob().then((blob) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          const suffix = selectedYear === "all" ? "_AllYears" : "_" + String(selectedYear);
          link.download = "AllStar_Payments_AllLeagues" + suffix + ".xlsx";
          link.click();
          URL.revokeObjectURL(link.href);
        });
      })
      .catch(() => {
        setError("Export failed");
      })
      .finally(() => {
        setExporting(false);
      });
  }

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 overflow-hidden mb-8">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-700/50">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((p) => !p)}
            className="flex items-center gap-2 hover:text-white transition-colors text-zinc-300"
          >
            <span className="text-lg font-semibold">All-League Payments Summary</span>
            <span className="text-zinc-500 text-sm">{collapsed ? "▼" : "▲"}</span>
          </button>
          {data && (
            <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5">
              {data.grandTotals.total} players across all leagues
            </span>
          )}
        </div>
        {!collapsed && (
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
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => fetchData(selectedYear)}
              disabled={loading}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setShowCsvImport((p) => !p)}
              className={"rounded-lg border px-3 py-1.5 text-sm transition-colors " + (showCsvImport ? "border-sky-600 bg-sky-950/50 text-sky-300" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800")}
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => setShowCoachRosterBuilder(true)}
              className="rounded-lg border border-violet-700/60 bg-violet-950/30 px-3 py-1.5 text-sm text-violet-300 hover:bg-violet-950/60 transition-colors"
            >
              + Coach Roster
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading || !data}
              className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950/60 transition-colors disabled:opacity-40"
            >
              {exporting ? "Exporting..." : "Export XLSX"}
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-6 py-5 space-y-4">
          {showCsvImport && (
            <AllStarPaypalCsvImport
              controlled
              onClose={() => setShowCsvImport(false)}
              onApplied={() => fetchData(selectedYear)}
            />
          )}
          {/* Initial load spinner — only shown before any data arrives */}
          {loading && !data && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm py-4">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
              Loading payment summary across all leagues… (dev database can take 20–60 seconds)
            </div>
          )}
          {/* Error banner (shown alongside stale data if a refresh fails) */}
          {error && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {/* Keep orgs mounted during refresh so expanded state is preserved; just dim while loading */}
          {data && (
            <div className={`space-y-4 transition-opacity duration-150 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              {data.grandTotals.total > 0 && (
                <>
                  <div className="flex flex-wrap gap-2 p-4 rounded-xl border border-zinc-700/40 bg-zinc-900/30">
                    <div className="flex items-center gap-1 text-xs text-zinc-400 font-medium mr-2 self-center">
                      All Leagues:
                    </div>
                    <StatChip
                      label="Total"
                      value={String(data.grandTotals.total)}
                      onClick={() => { setActiveFilter(activeFilter === "total" ? null : "total"); setFilterQuery(""); }}
                      active={activeFilter === "total"}
                    />
                    <StatChip
                      label="Paid"
                      value={String(data.grandTotals.paidCount)}
                      highlight="green"
                      onClick={() => { setActiveFilter(activeFilter === "paid" ? null : "paid"); setFilterQuery(""); }}
                      active={activeFilter === "paid"}
                    />
                    <StatChip
                      label="Unpaid"
                      value={String(data.grandTotals.unpaidCount)}
                      highlight={data.grandTotals.unpaidCount > 0 ? "amber" : undefined}
                      onClick={() => { setActiveFilter(activeFilter === "unpaid" ? null : "unpaid"); setFilterQuery(""); }}
                      active={activeFilter === "unpaid"}
                    />
                    <StatChip
                      label="Collected"
                      value={fmtMoney(data.grandTotals.collectedCents)}
                      highlight="green"
                    />
                    <StatChip
                      label="Outstanding"
                      value={fmtMoney(data.grandTotals.outstandingCents)}
                      highlight={data.grandTotals.outstandingCents > 0 ? "red" : undefined}
                    />
                  </div>

                  {/* ── Filtered player list (always mounted, table expands on focus) ── */}
                  <AllStarPlayerSearch
                    activeFilter={activeFilter}
                    data={data}
                    onToggle={handleDirectPaymentToggle}
                  />
                </>
              )}
              {data.grandTotals.total === 0 && (
                <p className="text-zinc-500 text-sm italic py-2">
                  No payment records found
                  {selectedYear !== "all" ? " for " + String(selectedYear) : ""}.
                </p>
              )}
              {data.orgs.map((org) => (
                <OrgSection
                  key={org.orgId}
                  org={org}
                  onPaymentToggled={(cycleId, isPaidNow, amountCents) =>
                    handlePaymentToggled(org.orgId, cycleId, isPaidNow, amountCents)
                  }
                  onSeedPayments={handleSeedPayments}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {showCoachRosterBuilder && (
        <CoachRosterBuilderModal
          onClose={() => setShowCoachRosterBuilder(false)}
          onSuccess={() => fetchData(selectedYear)}
        />
      )}
    </div>
  );
}
