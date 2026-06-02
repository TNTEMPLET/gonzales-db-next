"use client";

import { useEffect, useState } from "react";

type PaymentRow = {
  id: string;
  playerFullName: string;
  ageGroup: string;
  team: string;
  payerName: string | null;
  amountCents: number;
  isPaid: boolean;
  paidAt: string | null;
  rosterTag: string | null;
};

type RosterGroup = { rosterTag: string; summary: unknown; payments: PaymentRow[] };
type CycleSummary = { cycleId: string; cycleName: string; rosters: RosterGroup[] };
type OrgReport = { orgId: string; orgName: string; totals: unknown; cycles: CycleSummary[] };
type SummaryData = { orgs: OrgReport[]; grandTotals: unknown; availableYears: number[] };
type FlatPayment = PaymentRow & { orgId: string; orgName: string; cycleId: string };

function fmtMoney(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

function flattenData(data: SummaryData): FlatPayment[] {
  return data.orgs.flatMap((org) =>
    org.cycles.flatMap((cycle) =>
      cycle.rosters.flatMap((roster) =>
        roster.payments.map((p) => ({
          ...p,
          orgId: org.orgId,
          orgName: org.orgName,
          cycleId: cycle.cycleId,
        })),
      ),
    ),
  );
}

export default function AllStarPlayerSearch({
  activeFilter,
  data,
  onToggle,
}: {
  activeFilter: "total" | "paid" | "unpaid" | null;
  data: SummaryData;
  onToggle: (paymentId: string, orgId: string, cycleId: string, amountCents: number, newIsPaid: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (activeFilter === "paid" || activeFilter === "unpaid") setShowTable(true);
  }, [activeFilter]);

  const allPlayers = flattenData(data);

  const filtered = allPlayers.filter((p) => {
    const matchesFilter =
      !activeFilter ||
      activeFilter === "total" ||
      (activeFilter === "paid" && p.isPaid) ||
      (activeFilter === "unpaid" && !p.isPaid);
    if (!matchesFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const words = p.playerFullName.toLowerCase().split(/\s+/);
    return words.some((w) => w.startsWith(q));
  });

  const filterLabel =
    activeFilter === "paid" ? "paid players" :
    activeFilter === "unpaid" ? "unpaid players" : "all players";

  async function handleToggle(p: FlatPayment) {
    setToggling(p.id);
    try {
      const res = await fetch("/api/admin/all-star/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: p.id, isPaid: !p.isPaid }),
      });
      if (res.ok) onToggle(p.id, p.orgId, p.cycleId, p.amountCents, !p.isPaid);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 overflow-visible">
      {/* Search bar — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowTable(true); }}
            onFocus={() => setShowTable(true)}
            onBlur={() => { if (!query.trim()) setShowTable(false); }}
            placeholder={`Search ${filterLabel}…`}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 pl-9 pr-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-sky-600 transition-colors"
          />
        </div>
        {showTable && (
          <span className="text-xs text-zinc-500 shrink-0">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        )}
        {showTable && (
          <button
            type="button"
            onClick={() => { setQuery(""); setShowTable(false); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
          >
            Close
          </button>
        )}
      </div>

      {/* Player table — only when focused or has query */}
      {showTable && (
        <div className="border-t border-zinc-700/40 overflow-x-auto max-h-96 overflow-y-auto">
          {filtered.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-900">
                <tr className="text-xs text-zinc-500 border-b border-zinc-700/50">
                  <th className="text-left px-4 py-2 font-medium">Player</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Roster</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Org</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Payer</th>
                  <th className="text-center px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-zinc-200">{p.playerFullName}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs hidden sm:table-cell">
                      {p.rosterTag ?? `${p.ageGroup} · ${p.team}`}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs hidden md:table-cell">{p.orgName}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs hidden lg:table-cell">{p.payerName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        disabled={toggling === p.id}
                        onClick={() => void handleToggle(p)}
                        className={
                          "text-xs font-medium px-2.5 py-0.5 rounded transition-colors disabled:opacity-50 " +
                          (p.isPaid
                            ? "text-emerald-400 bg-emerald-950/40 hover:bg-emerald-950/70"
                            : "text-amber-400 bg-amber-950/30 hover:bg-amber-950/60")
                        }
                      >
                        {toggling === p.id ? "…" : p.isPaid ? "Paid ✓" : "Mark Paid"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{fmtMoney(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-zinc-500 italic">
              No {filterLabel} found{query ? ` matching "${query}"` : ""}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
