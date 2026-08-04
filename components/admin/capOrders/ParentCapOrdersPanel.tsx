"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CapOrder, CapOrderItem, CapOrdersResponse } from "@/app/api/admin/cap-orders/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function totalCents(orders: CapOrder[]) {
  return orders.reduce((s, o) => s + o.amountCents, 0);
}

function countFulfilled(orders: CapOrder[]) {
  return orders.reduce((s, o) => s + o.items.filter((i) => i.status === "fulfilled").length, 0);
}

function countTotal(orders: CapOrder[]) {
  return orders.reduce((s, o) => s + o.quantity, 0);
}

// ─── Org meta ─────────────────────────────────────────────────────────────────

type OrgId = "gonzales" | "ascension";
type EmailFormOrg = OrgId | "all";

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

// ─── Cap item row (single cap within an order) ────────────────────────────────

function CapItemRow({
  item,
  onToggle,
  toggling,
}: {
  item: CapOrderItem;
  onToggle: (item: CapOrderItem) => void;
  toggling: boolean;
}) {
  const fulfilled = item.status === "fulfilled";
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${fulfilled ? "bg-emerald-950/20" : "bg-zinc-800/40"}`}>
      <span className={`font-medium ${fulfilled ? "text-emerald-300 line-through decoration-emerald-700/50" : "text-zinc-300"}`}>
        Cap #{item.seq}
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
  order: CapOrder;
  onToggleItem: (item: CapOrderItem, order: CapOrder) => void;
  togglingItemId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const fulfilledCount = order.items.filter((i) => i.status === "fulfilled").length;
  const allFulfilled = fulfilledCount === order.quantity;
  const partialFulfilled = fulfilledCount > 0 && !allFulfilled;

  return (
    <div className={`border-b border-zinc-800/60 last:border-0 ${allFulfilled ? "bg-emerald-950/5" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle (only if more than 1 cap) */}
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
            <p className="text-xs text-zinc-500">{fmtDate(order.txDate)}</p>
          </div>
          <div className="hidden sm:block text-xs text-zinc-400 truncate max-w-[7rem]" title={order.note ?? ""}>
            {order.note ? order.note : <span className="text-zinc-600 italic">No note</span>}
          </div>
          <div className="hidden sm:block text-xs text-zinc-400 tabular-nums">
            {fmtMoney(order.amountCents)}
          </div>
          <div className="flex items-center gap-2 justify-end">
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

        {/* Single-cap direct toggle */}
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

      {/* Expanded multi-cap items */}
      {expanded && order.quantity > 1 && (
        <div className="px-4 pb-3 space-y-1.5">
          {order.note && (
            <p className="text-xs text-zinc-500 mb-2">Note: <span className="text-zinc-300">{order.note}</span></p>
          )}
          {order.items.map((item) => (
            <CapItemRow
              key={item.id}
              item={item}
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
  orders: CapOrder[];
  onToggleItem: (item: CapOrderItem, order: CapOrder) => void;
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
            <p className="text-xs text-zinc-500">caps filled</p>
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
                <p className="hidden sm:block text-xs font-semibold uppercase tracking-wide text-zinc-500">Note</p>
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

export default function ParentCapOrdersPanel() {
  const [data, setData] = useState<CapOrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  const [exportingOrg, setExportingOrg] = useState<OrgId | "all" | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailOrg, setEmailOrg] = useState<EmailFormOrg>("all");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailOpenOnly, setEmailOpenOnly] = useState(true);
  const [emailFromOptions, setEmailFromOptions] = useState<string[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cap-orders");
      const json = (await res.json()) as CapOrdersResponse & { error?: string };
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
      const res = await fetch("/api/admin/cap-orders", { method: "POST" });
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

  async function toggleItem(item: CapOrderItem, order: CapOrder) {
    setTogglingItemId(item.id);
    const newStatus = item.status === "fulfilled" ? "open" : "fulfilled";
    try {
      const res = await fetch("/api/admin/cap-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, status: newStatus }),
      });
      const json = (await res.json()) as { id?: string; status?: string; fulfilledAt?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");

      // Optimistic update in local state
      setData((prev) => {
        if (!prev) return prev;
        const updateOrg = (list: CapOrder[]) =>
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
      const res = await fetch(`/api/admin/cap-orders/export?org=${org}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match?.[1] ?? `CapOrders_${org}.csv`;
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

  async function openEmailModal(org: EmailFormOrg = "all") {
    setEmailOrg(org);
    setEmailNotice(null);
    setError(null);
    setEmailOpen(true);
    try {
      const res = await fetch("/api/admin/cap-orders/email");
      const json = (await res.json()) as {
        fromOptions?: string[];
        defaultFrom?: string | null;
        emailConfigured?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load email options");
      setEmailFromOptions(json.fromOptions ?? []);
      setEmailFrom(json.defaultFrom ?? json.fromOptions?.[0] ?? "");
      setEmailConfigured(json.emailConfigured !== false);
      const orgLabel =
        org === "gonzales" ? "Gonzales DYB" : org === "ascension" ? "Ascension LLB" : "All orgs";
      setEmailSubject(`Cap orders – ${orgLabel} – ${new Date().toLocaleDateString("en-US")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open email form");
      setEmailOpen(false);
    }
  }

  async function sendEmailReport() {
    setEmailBusy(true);
    setEmailNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cap-orders/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject.trim() || undefined,
          message: emailMessage.trim() || undefined,
          org: emailOrg,
          openOnly: emailOpenOnly,
          fromEmail: emailFrom || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        to?: string[];
        filename?: string;
        orderCount?: number;
        from?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      setEmailNotice(
        `Sent ${json.filename ?? "report"} (${json.orderCount ?? 0} orders) to ${(json.to ?? []).join(", ")} from ${json.from ?? "Communications"}.`,
      );
      setEmailOpen(false);
      setEmailTo("");
      setEmailMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setEmailBusy(false);
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
                {allOrders.length} orders · {fulfilledQty}/{totalQty} caps fulfilled · {openQty} open
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void openEmailModal("all")}
              disabled={allOrders.length === 0 || emailBusy}
              className="flex items-center gap-1.5 rounded-lg border border-violet-700/50 bg-violet-950/20 px-3 py-2 text-sm text-violet-200 hover:bg-violet-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MailIcon />
              Email report
            </button>
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
        {emailNotice && (
          <p className="text-sm text-emerald-300 rounded-lg bg-emerald-950/30 border border-emerald-800/40 px-3 py-2">
            {emailNotice}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-400 rounded-lg bg-red-950/30 border border-red-800/40 px-3 py-2">{error}</p>
        )}
      </div>

      {/* In-module email form — uses Communications From + Resend, no Communications UI */}
      {emailOpen && (
        <div className="rounded-xl border border-violet-800/40 bg-zinc-900/90 px-5 py-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Email cap order report</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Sends the vendor CSV via league Communications email (Resend). You stay on this page.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEmailOpen(false)}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Close
            </button>
          </div>

          {!emailConfigured && (
            <p className="text-sm text-amber-300 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2">
              Email is not configured (missing Resend / From address). Fix this in Communications settings
              first.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">To</span>
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="vendor@example.com, board@apbaseball.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
              />
              <span className="text-[11px] text-zinc-600">Comma-separated, up to 10 addresses.</span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Org</span>
              <select
                value={emailOrg}
                onChange={(e) => setEmailOrg(e.target.value as EmailFormOrg)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-violet-600 focus:outline-none"
              >
                <option value="all">All orgs</option>
                <option value="gonzales">Gonzales DYB</option>
                <option value="ascension">Ascension LLB</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">From</span>
              <select
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-violet-600 focus:outline-none"
              >
                {emailFromOptions.length === 0 ? (
                  <option value="">Default Communications From</option>
                ) : (
                  emailFromOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Subject</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-violet-600 focus:outline-none"
              />
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Message (optional)
              </span>
              <textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                rows={3}
                placeholder="Hi — attached is the current cap order list for the vendor…"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
              <input
                type="checkbox"
                checked={emailOpenOnly}
                onChange={(e) => setEmailOpenOnly(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-950 text-violet-500 focus:ring-violet-600"
              />
              Open caps only (exclude fully fulfilled orders)
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setEmailOpen(false)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void sendEmailReport()}
              disabled={emailBusy || !emailTo.trim() || !emailConfigured}
              className="flex items-center gap-1.5 rounded-lg border border-violet-600 bg-violet-950/40 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-900/50 disabled:opacity-50"
            >
              <MailIcon />
              {emailBusy ? "Sending…" : "Send with CSV attached"}
            </button>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Gonzales DYB" value={String(data.gonzales.length)} sub={`${countTotal(data.gonzales)} cap${countTotal(data.gonzales) !== 1 ? "s" : ""}`} accent="blue" />
          <SummaryCard label="Ascension LLB" value={String(data.ascension.length)} sub={`${countTotal(data.ascension)} cap${countTotal(data.ascension) !== 1 ? "s" : ""}`} accent="emerald" />
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

function MailIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M2 4.5 8 9l6-4.5" strokeLinecap="round" strokeLinejoin="round" />
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
