"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShirtOrder, ShirtOrderItem, ShirtOrdersResponse } from "@/app/api/admin/shirt-orders/route";
import {
  sizeLabelForItem,
  sizeLabelsForOrder,
  splitShirtNote,
} from "@/lib/merch/shirtSizes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function totalCents(orders: ShirtOrder[]) {
  return orders.reduce((s, o) => s + o.amountCents, 0);
}

function countFulfilled(orders: ShirtOrder[]) {
  return orders.reduce((s, o) => s + o.items.filter((i) => i.status === "fulfilled").length, 0);
}

function countTotal(orders: ShirtOrder[]) {
  return orders.reduce((s, o) => s + o.quantity, 0);
}

/** Compact size summary for the order row (e.g. "YS, YM, AL"). */
function orderSizeSummary(order: ShirtOrder): string {
  const labels = sizeLabelsForOrder(order.note, order.quantity).filter((l) => l.trim());
  if (labels.length === 0) {
    const { sizes, raw } = splitShirtNote(order.note);
    return (sizes || raw || "").trim();
  }
  return labels.join(", ");
}

// ─── Org meta ─────────────────────────────────────────────────────────────────

type OrgId = "gonzales" | "ascension";

const ORG_META: Record<OrgId, { label: string; abbr: string; color: string; border: string; bg: string }> = {
  gonzales: {
    label: "Gonzales Diamond Baseball",
    abbr: "Gonzales DYB",
    color: "text-blue-300",
    border: "border-blue-700/50",
    bg: "bg-blue-950/20",
  },
  ascension: {
    label: "Ascension Little League",
    abbr: "Ascension LLB",
    color: "text-emerald-300",
    border: "border-emerald-700/50",
    bg: "bg-emerald-950/20",
  },
};

// ─── Shirt item row (single shirt within an order) ────────────────────────────

function ShirtItemRow({
  item,
  sizeLabel,
  onToggle,
  toggling,
}: {
  item: ShirtOrderItem;
  sizeLabel: string;
  onToggle: (item: ShirtOrderItem) => void;
  toggling: boolean;
}) {
  const fulfilled = item.status === "fulfilled";
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${fulfilled ? "bg-emerald-950/20" : "bg-zinc-800/40"}`}>
      <span className={`font-medium ${fulfilled ? "text-emerald-300 line-through decoration-emerald-700/50" : "text-zinc-300"}`}>
        <span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-950/60 px-2 py-0.5 font-semibold tabular-nums text-zinc-100">
          {sizeLabel}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onToggle(item)}
        disabled={toggling}
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
          fulfilled
            ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-zinc-800 hover:text-zinc-400 hover:border-zinc-700"
            : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-emerald-950/30 hover:text-emerald-300 hover:border-emerald-700/50"
        }`}
      >
        {toggling ? "…" : fulfilled ? "✓ Fulfilled" : "Mark Fulfilled"}
      </button>
    </div>
  );
}

// ─── Order row ────────────────────────────────────────────────────────────────

function OrderRow({
  order,
  onToggleItem,
  togglingItemId,
}: {
  order: ShirtOrder;
  onToggleItem: (item: ShirtOrderItem, order: ShirtOrder) => void;
  togglingItemId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const fulfilledCount = order.items.filter((i) => i.status === "fulfilled").length;
  const allFulfilled = fulfilledCount === order.quantity;
  const partialFulfilled = fulfilledCount > 0 && !allFulfilled;
  const { player } = splitShirtNote(order.note);
  const sizeSummary = orderSizeSummary(order);
  const singleSize =
    order.quantity === 1
      ? sizeLabelForItem(order.note, order.items[0]?.seq ?? 1, order.quantity)
      : "";

  return (
    <div className={`border-b border-zinc-800/60 last:border-0 ${allFulfilled ? "bg-emerald-950/5" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle (only if more than 1 shirt) */}
        {order.quantity > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 shrink-0"
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_7rem_auto] gap-x-4 gap-y-0.5 items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{order.payerName ?? <span className="text-zinc-500 italic">Unknown</span>}</p>
            <p className="text-xs text-zinc-500">
              {fmtDate(order.txDate)}
              {player ? <span className="text-zinc-400"> · {player}</span> : null}
            </p>
          </div>
          <div
            className="hidden sm:block text-xs font-semibold text-zinc-200 truncate max-w-[7rem]"
            title={order.note ?? sizeSummary}
          >
            {sizeSummary ? (
              sizeSummary
            ) : (
              <span className="font-normal text-zinc-600 italic">No size</span>
            )}
          </div>
          <div className="hidden sm:block text-xs text-zinc-400 tabular-nums">
            {fmtMoney(order.amountCents)}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {order.quantity === 1 && singleSize && !singleSize.startsWith("Shirt #") ? (
              <span className="rounded-md border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[11px] font-semibold text-zinc-100">
                {singleSize}
              </span>
            ) : null}
            {order.quantity > 1 && (
              <span className="text-xs text-zinc-500 tabular-nums">{fulfilledCount}/{order.quantity}</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
              allFulfilled
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/50"
                : partialFulfilled
                ? "bg-amber-950/30 text-amber-300 border-amber-700/40"
                : "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}>
              {allFulfilled ? "✓ Fulfilled" : partialFulfilled ? "Partial" : "Open"}
            </span>
          </div>
        </div>

        {/* Single-shirt direct toggle */}
        {order.quantity === 1 && order.items[0] && (
          <button
            type="button"
            onClick={() => onToggleItem(order.items[0]!, order)}
            disabled={togglingItemId === order.items[0].id}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              allFulfilled
                ? "border-zinc-700 text-zinc-500 hover:text-amber-300 hover:border-amber-700/50"
                : "border-emerald-700/50 text-emerald-300 hover:bg-emerald-950/30"
            }`}
          >
            {togglingItemId === order.items[0].id ? "…" : allFulfilled ? "Reopen" : "Fulfill ✓"}
          </button>
        )}
      </div>

      {/* Expanded multi-shirt items — labeled by size from checkout note */}
      {expanded && order.quantity > 1 && (
        <div className="px-4 pb-3 space-y-1.5">
          {player ? (
            <p className="text-xs text-zinc-500 mb-2">
              Player: <span className="text-zinc-300">{player}</span>
            </p>
          ) : order.note ? (
            <p className="text-xs text-zinc-500 mb-2">
              Note: <span className="text-zinc-300">{order.note}</span>
            </p>
          ) : null}
          {order.items.map((item) => (
            <ShirtItemRow
              key={item.id}
              item={item}
              sizeLabel={sizeLabelForItem(order.note, item.seq, order.quantity)}
              onToggle={(i) => onToggleItem(i, order)}
              toggling={togglingItemId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Org card ─────────────────────────────────────────────────────────────────

function OrgCard({
  org,
  orders,
  onToggleItem,
  togglingItemId,
  onExport,
  exporting,
}: {
  org: OrgId;
  orders: ShirtOrder[];
  onToggleItem: (item: ShirtOrderItem, order: ShirtOrder) => void;
  togglingItemId: string | null;
  onExport: (org: OrgId) => void;
  exporting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = ORG_META[org];
  const totalQty = countTotal(orders);
  const fulfilledQty = countFulfilled(orders);
  const openQty = totalQty - fulfilledQty;

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronIcon expanded={expanded} />
          <div>
            <p className={`text-sm font-semibold ${meta.color}`}>{meta.abbr}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0 ml-4">
          <div className="text-right">
            <p className="text-xl font-bold tabular-nums text-zinc-100">{orders.length}</p>
            <p className="text-xs text-zinc-500">order{orders.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold tabular-nums text-emerald-300">{fulfilledQty}<span className="text-zinc-500 font-normal">/{totalQty}</span></p>
            <p className="text-xs text-zinc-500">shirts filled</p>
          </div>
          {openQty > 0 && (
            <div className="text-right">
              <p className="text-base font-bold tabular-nums text-amber-400">{openQty}</p>
              <p className="text-xs text-zinc-500">remaining</p>
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800">
          <div className="flex justify-end px-4 py-2.5 border-b border-zinc-800/60">
            <button
              type="button"
              onClick={() => onExport(org)}
              disabled={exporting || orders.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              <CsvIcon />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
          {orders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500 italic">No orders yet.</p>
          ) : (
            <div>
              {/* Table header */}
              <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_7rem_7rem_auto] gap-x-4 px-4 py-2 border-b border-zinc-800/40">
                <div />
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payer</p>
                <p className="hidden sm:block text-xs font-semibold uppercase tracking-wide text-zinc-500">Size(s)</p>
                <p className="hidden sm:block text-xs font-semibold uppercase tracking-wide text-zinc-500">Amount</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 text-right">Status</p>
              </div>
              {orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  onToggleItem={onToggleItem}
                  togglingItemId={togglingItemId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ParentShirtOrdersPanel() {
  const [data, setData] = useState<ShirtOrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [exportingOrg, setExportingOrg] = useState<OrgId | "all" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shirt-orders");
      const json = (await res.json()) as ShirtOrdersResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load orders");
      setData(json);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + 30s polling
  useEffect(() => {
    void fetchOrders();
    pollRef.current = setInterval(() => void fetchOrders(true), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOrders]);

  async function syncFromPayPal() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/shirt-orders", { method: "POST" });
      const json = (await res.json()) as { created?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setSyncMsg(`Synced: ${json.created ?? 0} new, ${json.skipped ?? 0} already stored.`);
      await fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function toggleItem(item: ShirtOrderItem, order: ShirtOrder) {
    setTogglingItemId(item.id);
    const newStatus = item.status === "fulfilled" ? "open" : "fulfilled";
    try {
      const res = await fetch("/api/admin/shirt-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, status: newStatus }),
      });
      const json = (await res.json()) as { id?: string; status?: string; fulfilledAt?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");

      // Optimistic update in local state
      setData((prev) => {
        if (!prev) return prev;
        const updateOrg = (list: ShirtOrder[]) =>
          list.map((o) =>
            o.id !== order.id
              ? o
              : {
                  ...o,
                  items: o.items.map((i) =>
                    i.id !== item.id
                      ? i
                      : { ...i, status: json.status as "open" | "fulfilled", fulfilledAt: json.fulfilledAt ?? null },
                  ),
                },
          );
        return {
          ...prev,
          gonzales: updateOrg(prev.gonzales),
          ascension: updateOrg(prev.ascension),
          unknown: updateOrg(prev.unknown),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setTogglingItemId(null);
    }
  }

  async function handleExport(org: OrgId | "all") {
    setExportingOrg(org);
    try {
      const res = await fetch(`/api/admin/shirt-orders/export?org=${org}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match?.[1] ?? `ShirtOrders_${org}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingOrg(null);
    }
  }

  const allOrders = data ? [...data.gonzales, ...data.ascension, ...data.unknown] : [];
  const totalQty = countTotal(allOrders);
  const fulfilledQty = countFulfilled(allOrders);
  const openQty = totalQty - fulfilledQty;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live · refreshes every 30s
            </span>
            {data ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-400">
                {allOrders.length} orders · {fulfilledQty}/{totalQty} shirts fulfilled · {openQty} open
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleExport("all")}
              disabled={exportingOrg !== null || allOrders.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CsvIcon />
              {exportingOrg === "all" ? "Exporting…" : "Export All"}
            </button>
            <button
              type="button"
              onClick={() => void syncFromPayPal()}
              disabled={syncing || loading}
              className="flex items-center gap-1.5 rounded-lg border border-blue-700/60 bg-blue-950/20 px-3 py-2 text-sm text-blue-300 hover:bg-blue-900/30 disabled:opacity-50"
            >
              <PayPalIcon />
              {syncing ? "Syncing…" : "Sync latest PayPal orders"}
            </button>
            <button
              type="button"
              onClick={() => void fetchOrders()}
              disabled={loading}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? <SpinnerIcon /> : "↻"}
            </button>
          </div>
        </div>

        {syncMsg && (
          <p className="text-sm text-zinc-300 rounded-lg bg-zinc-800 px-3 py-2">{syncMsg}</p>
        )}
        {error && (
          <p className="text-sm text-red-400 rounded-lg bg-red-950/30 border border-red-800/40 px-3 py-2">{error}</p>
        )}
      </div>

      {/* Summary bar */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Gonzales DYB" value={String(data.gonzales.length)} sub={`${countTotal(data.gonzales)} shirt${countTotal(data.gonzales) !== 1 ? "s" : ""}`} accent="blue" />
          <SummaryCard label="Ascension LLB" value={String(data.ascension.length)} sub={`${countTotal(data.ascension)} shirt${countTotal(data.ascension) !== 1 ? "s" : ""}`} accent="emerald" />
          <SummaryCard label="Fulfilled" value={String(fulfilledQty)} sub={`of ${totalQty} total`} accent="emerald" />
          <SummaryCard label="Remaining" value={String(totalQty - fulfilledQty)} sub={totalQty > 0 ? `${Math.round(((totalQty - fulfilledQty) / totalQty) * 100)}% open` : undefined} accent={totalQty - fulfilledQty > 0 ? "amber" : undefined} />
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-400">Loading orders…</p>
        </div>
      )}

      {/* Org cards */}
      {data && (
        <div className="space-y-3">
          <OrgCard
            org="gonzales"
            orders={data.gonzales}
            onToggleItem={toggleItem}
            togglingItemId={togglingItemId}
            onExport={(o) => void handleExport(o)}
            exporting={exportingOrg === "gonzales"}
          />
          <OrgCard
            org="ascension"
            orders={data.ascension}
            onToggleItem={toggleItem}
            togglingItemId={togglingItemId}
            onExport={(o) => void handleExport(o)}
            exporting={exportingOrg === "ascension"}
          />
        </div>
      )}

      {data && (
        <p className="text-xs text-zinc-600 text-right">
          Last fetched {new Date(data.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "blue" | "emerald" | "amber" }) {
  const valueColor = accent === "blue" ? "text-blue-300" : accent === "emerald" ? "text-emerald-300" : accent === "amber" ? "text-amber-300" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 text-zinc-500 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CsvIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="2" y="1" width="12" height="14" rx="1.5" />
      <path d="M5 6h6M5 9h6M5 12h4" strokeLinecap="round" />
    </svg>
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

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
