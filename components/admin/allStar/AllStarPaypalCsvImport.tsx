"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CsvCandidate, CsvMatchRow, CsvSkippedRow, UnpaidPlayer } from "@/app/api/admin/all-star/payments/paypal-csv/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotStatus = "auto" | "pending" | "accepted" | "rejected" | "manual" | "skipped";

type Slot = {
  suggested: CsvCandidate | null;
  status: SlotStatus;
  manualPaymentId?: string;
  manualPlayerName?: string;
  manualRosterTag?: string;
};

type RowState = Omit<CsvMatchRow, "candidates"> & { slots: Slot[] };

function buildRows(matchRows: CsvMatchRow[]): RowState[] {
  return matchRows.map((row) => {
    const slots: Slot[] = [];
    for (let i = 0; i < row.quantity; i++) {
      const c = row.candidates[i] ?? null;
      if (!c) {
        slots.push({ suggested: null, status: "pending" });
      } else if (c.isAlreadyPaid) {
        slots.push({ suggested: c, status: "skipped" });
      } else if (c.confidence >= 0.85) {
        slots.push({ suggested: c, status: "auto" });
      } else {
        slots.push({ suggested: c, status: "pending" });
      }
    }
    const { candidates: _, ...rest } = row;
    return { ...rest, slots };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

function ConfBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  if (score >= 0.85)
    return <span className="text-xs font-medium text-emerald-300 bg-emerald-950/40 px-1.5 py-0.5 rounded">{pct}%</span>;
  return <span className="text-xs font-medium text-amber-300 bg-amber-950/30 px-1.5 py-0.5 rounded">{pct}%</span>;
}

// ─── Player search input ──────────────────────────────────────────────────────
// Portals the dropdown to document.body to escape overflow:hidden/auto ancestors.

function PlayerSearchInput({
  unpaidPlayers,
  value,
  onChange,
  placeholder = "Search player name or roster…",
}: {
  unpaidPlayers: UnpaidPlayer[];
  value: string;
  onChange: (player: UnpaidPlayer) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function updateRect() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  }

  const filtered = query.length >= 1
    ? unpaidPlayers
        .filter((p) => {
          const q = query.toLowerCase();
          const nameWords = p.playerFullName.toLowerCase().split(/\s+/);
          const nameMatch = nameWords.some((w) => w.startsWith(q));
          const rosterMatch = (p.rosterTag ?? "").toLowerCase().includes(q);
          return nameMatch || rosterMatch;
        })
        .slice(0, 30)
    : [];

  const dropdownContent = open && rect && (
    <div
      style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
      className="max-h-52 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl"
    >
      {filtered.length > 0
        ? filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(p); setQuery(p.playerFullName); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0"
            >
              <div className="text-sm text-zinc-200">{p.playerFullName}</div>
              <div className="text-xs text-zinc-500">{p.rosterTag ?? p.ageGroup} · {p.organizationId === "gonzales" ? "Gonzales DYB" : "AP Little League"}</div>
            </button>
          ))
        : query.length >= 1 && (
            <div className="px-3 py-2 text-xs text-zinc-500">No unpaid players match "{query}"</div>
          )}
    </div>
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); updateRect(); }}
        onFocus={() => { setOpen(true); updateRect(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-sky-600"
      />
      {mounted && dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}

// ─── Single slot row ──────────────────────────────────────────────────────────

function SlotRow({
  slot,
  unpaidPlayers,
  onAccept,
  onReject,
  onManualAssign,
  onSkip,
  onRemoveAuto,
}: {
  slot: Slot;
  unpaidPlayers: UnpaidPlayer[];
  onAccept: () => void;
  onReject: () => void;
  onManualAssign: (player: UnpaidPlayer) => void;
  onSkip: () => void;
  onRemoveAuto: () => void;
}) {
  const showSearch = slot.status === "rejected" || (slot.status === "pending" && !slot.suggested);

  return (
    <div className={
      "rounded-lg border px-3 py-2.5 space-y-2 " +
      (slot.status === "auto" || slot.status === "accepted" || slot.status === "manual"
        ? "border-emerald-800/40 bg-emerald-950/10"
        : slot.status === "skipped"
        ? "border-zinc-700/40 bg-zinc-800/20 opacity-50"
        : slot.status === "rejected"
        ? "border-red-800/30 bg-red-950/10"
        : "border-amber-800/40 bg-amber-950/10")
    }>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Suggested match */}
          {slot.suggested && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-200">{slot.suggested.playerFullName}</span>
              <span className="text-xs text-zinc-500">{slot.suggested.rosterTag ?? slot.suggested.ageGroup}</span>
              <ConfBadge score={slot.suggested.confidence} />
              {slot.suggested.isAlreadyPaid && (
                <span className="text-xs text-emerald-400">Already paid</span>
              )}
            </div>
          )}
          {/* Manual assignment result */}
          {slot.status === "manual" && slot.manualPlayerName && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-200">{slot.manualPlayerName}</span>
              {slot.manualRosterTag && <span className="text-xs text-zinc-500">{slot.manualRosterTag}</span>}
              <span className="text-xs font-medium text-sky-400 bg-sky-950/30 px-1.5 py-0.5 rounded">Manual</span>
            </div>
          )}
          {!slot.suggested && slot.status !== "manual" && (
            <span className="text-xs text-zinc-500 italic">No match found in roster</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {slot.status === "pending" && slot.suggested && !slot.suggested.isAlreadyPaid && (
            <>
              <button type="button" onClick={onAccept}
                className="rounded border border-emerald-700/60 bg-emerald-950/30 hover:bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-300 transition-colors">
                Accept
              </button>
              <button type="button" onClick={onReject}
                className="rounded border border-red-800/40 bg-red-950/20 hover:bg-red-950/40 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors">
                Reject
              </button>
            </>
          )}
          {slot.status === "pending" && !slot.suggested && (
            <button type="button" onClick={onSkip}
              className="rounded border border-zinc-700 hover:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition-colors">
              Skip
            </button>
          )}
          {slot.status === "auto" && (
            <button type="button" onClick={onRemoveAuto}
              className="rounded border border-zinc-700 hover:bg-zinc-800 px-2 py-1 text-xs text-zinc-500 transition-colors">
              Remove
            </button>
          )}
          {(slot.status === "accepted" || slot.status === "manual") && (
            <button type="button" onClick={onReject}
              className="rounded border border-zinc-700 hover:bg-zinc-800 px-2 py-1 text-xs text-zinc-500 transition-colors">
              Undo
            </button>
          )}
          {slot.status === "rejected" && (
            <button type="button" onClick={slot.suggested ? onAccept : onSkip}
              className="rounded border border-zinc-700 hover:bg-zinc-800 px-2 py-1 text-xs text-zinc-500 transition-colors">
              Undo
            </button>
          )}
          {slot.status === "skipped" && (
            <span className="text-xs text-zinc-500 italic">—</span>
          )}
        </div>
      </div>

      {/* Manual player search (shown when rejected or unmatched pending) */}
      {showSearch && (
        <PlayerSearchInput
          unpaidPlayers={unpaidPlayers}
          value={slot.manualPlayerName ?? ""}
          onChange={(p) => onManualAssign(p)}
          placeholder={slot.status === "rejected" ? "Assign different player…" : "Search unpaid player to assign…"}
        />
      )}
    </div>
  );
}

// ─── Transaction card ─────────────────────────────────────────────────────────

function TxCard({
  row,
  unpaidPlayers,
  onSlotAction,
}: {
  row: RowState;
  unpaidPlayers: UnpaidPlayer[];
  onSlotAction: (txId: string, slotIndex: number, action: "accept" | "reject" | "skip" | "removeAuto" | "manual", player?: UnpaidPlayer) => void;
}) {
  const pendingInRow = row.slots.filter((s) => s.status === "pending").length;
  const allGood = row.slots.every((s) => ["auto","accepted","manual","skipped"].includes(s.status));

  return (
    <div className={"rounded-xl border overflow-hidden " + (allGood ? "border-zinc-700/50" : pendingInRow > 0 ? "border-amber-700/50" : "border-zinc-700/50")}>
      {/* Tx header */}
      <div className="px-4 py-3 bg-zinc-900/60 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-200">{row.payerName}</span>
            {row.quantity > 1 && <span className="text-xs text-zinc-500">×{row.quantity} players</span>}
            <span className="text-xs text-zinc-400">{fmtMoney(row.grossCents)}</span>
            <span className="text-xs text-zinc-500">({fmtMoney(row.amountPerPlayerCents)}/player)</span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">
            {row.playerNote || <em>no note</em>}
          </div>
        </div>
        <div className="shrink-0 text-xs text-zinc-600">
          {new Date(row.txDate).toLocaleDateString()}
        </div>
      </div>

      {/* Slots */}
      <div className="px-4 py-3 space-y-2 bg-zinc-950/20">
        {row.slots.map((slot, i) => (
          <SlotRow
            key={i}
            slot={slot}
            unpaidPlayers={unpaidPlayers}
            onAccept={() => onSlotAction(row.txId, i, "accept")}
            onReject={() => onSlotAction(row.txId, i, "reject")}
            onManualAssign={(p) => onSlotAction(row.txId, i, "manual", p)}
            onSkip={() => onSlotAction(row.txId, i, "skip")}
            onRemoveAuto={() => onSlotAction(row.txId, i, "removeAuto")}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

type PreloadedSyncData = {
  matchRows: CsvMatchRow[];
  skipped: CsvSkippedRow[];
  totalRows: number;
  feeCents: number;
};

function ImportContent({
  onApplied,
  onClose,
  preloadedData,
}: {
  onApplied?: () => void;
  onClose?: () => void;
  preloadedData?: PreloadedSyncData;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const feeId = useId();

  const [feeDisplay, setFeeDisplay] = useState("95.00");
  const [previewing, setPreviewing] = useState(false);
  const [syncingPayPal, setSyncingPayPal] = useState(false);
  const [importMode, setImportMode] = useState<"csv" | "paypal">("csv");
  const [finalizing, setFinalizing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [rows, setRows] = useState<RowState[] | null>(null);
  const [skipped, setSkipped] = useState<CsvSkippedRow[]>([]);
  const [totalCsvRows, setTotalCsvRows] = useState(0);
  const [unpaidPlayers, setUnpaidPlayers] = useState<UnpaidPlayer[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ applied: number; skipped: number } | null>(null);
  const [lastAppliedTxIds, setLastAppliedTxIds] = useState<string[] | null>(null);

  const feeCents = Math.round(parseFloat(feeDisplay || "0") * 100);

  // ── Seed from preloaded sync data ───────────────────────────────────────────
  useEffect(() => {
    if (!preloadedData) return;
    setRows(buildRows(preloadedData.matchRows));
    setSkipped(preloadedData.skipped);
    setTotalCsvRows(preloadedData.totalRows);
    setFeeDisplay((preloadedData.feeCents / 100).toFixed(2));
    fetch("/api/admin/all-star/payments/paypal-csv")
      .then((r) => r.json())
      .then((j: { unpaidPlayers?: import("@/app/api/admin/all-star/payments/paypal-csv/route").UnpaidPlayer[] }) => {
        setUnpaidPlayers(j.unpaidPlayers ?? []);
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedData]);

  // ── Derived counts ──────────────────────────────────────────────────────────
  const pendingCount = rows?.reduce((n, r) => n + r.slots.filter((s) => s.status === "pending").length, 0) ?? 0;
  const autoCount = rows?.reduce((n, r) => n + r.slots.filter((s) => s.status === "auto").length, 0) ?? 0;
  const acceptedCount = rows?.reduce((n, r) => n + r.slots.filter((s) => s.status === "accepted" || s.status === "manual").length, 0) ?? 0;
  const rejectedCount = rows?.reduce((n, r) => n + r.slots.filter((s) => s.status === "rejected" || s.status === "skipped").length, 0) ?? 0;
  const toApplyCount = autoCount + acceptedCount;

  const confirmations = rows
    ? rows.flatMap((r) =>
        r.slots
          .filter((s) => s.status === "auto" || s.status === "accepted" || s.status === "manual")
          .map((s) => ({
            paymentId: (s.status === "manual" ? s.manualPaymentId : s.suggested?.paymentId) ?? "",
            txId: r.txId,
            txDate: r.txDate,
            payerName: r.payerName,
            playerNote: r.playerNote,
            amountCents: r.amountPerPlayerCents,
          }))
          .filter((c) => c.paymentId),
      )
    : [];

  // ── Slot action dispatch ─────────────────────────────────────────────────────
  function onSlotAction(txId: string, slotIndex: number, action: string, player?: UnpaidPlayer) {
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.txId !== txId) return r;
            const slots = r.slots.map((s, i) => {
              if (i !== slotIndex) return s;
              if (action === "accept") return { ...s, status: "accepted" as SlotStatus };
              if (action === "reject") return { ...s, status: "rejected" as SlotStatus, manualPaymentId: undefined, manualPlayerName: undefined };
              if (action === "skip") return { ...s, status: "skipped" as SlotStatus };
              if (action === "removeAuto") return { ...s, status: "rejected" as SlotStatus };
              if (action === "manual" && player)
                return { ...s, status: "manual" as SlotStatus, manualPaymentId: player.id, manualPlayerName: player.playerFullName, manualRosterTag: player.rosterTag ?? undefined };
              return s;
            });
            return { ...r, slots };
          })
        : prev,
    );
  }

  // ── Preview ──────────────────────────────────────────────────────────────────
  async function handlePreview() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setPreviewError("Please choose a CSV file."); return; }
    if (!feeCents || feeCents <= 0) { setPreviewError("Enter a valid fee amount."); return; }

    setPreviewing(true);
    setPreviewError(null);
    setApplyResult(null);
    setRows(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("feeCents", String(feeCents));

    try {
      const [previewRes, playersRes] = await Promise.all([
        fetch("/api/admin/all-star/payments/paypal-csv", { method: "POST", body: fd }),
        fetch("/api/admin/all-star/payments/paypal-csv"),
      ]);
      const previewJson = (await previewRes.json()) as { matchRows?: CsvMatchRow[]; skipped?: CsvSkippedRow[]; totalCsvRows?: number; error?: string };
      const playersJson = (await playersRes.json()) as { unpaidPlayers?: UnpaidPlayer[]; error?: string };

      if (!previewRes.ok) { setPreviewError(previewJson.error ?? "Preview failed."); return; }

      setRows(buildRows(previewJson.matchRows ?? []));
      setSkipped(previewJson.skipped ?? []);
      setTotalCsvRows(previewJson.totalCsvRows ?? 0);
      setUnpaidPlayers(playersJson.unpaidPlayers ?? []);
    } catch { setPreviewError("Network error."); }
    finally { setPreviewing(false); }
  }

  // ── PayPal sync fetch ───────────────────────────────────────────────────────
  async function handleSyncPayPal() {
    setSyncingPayPal(true);
    setPreviewError(null);
    setApplyResult(null);
    setRows(null);
    try {
      const [syncRes, playersRes] = await Promise.all([
        fetch("/api/admin/all-star/payments/paypal-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        fetch("/api/admin/all-star/payments/paypal-csv"),
      ]);
      const syncJson = (await syncRes.json()) as {
        matchRows?: CsvMatchRow[];
        skipped?: CsvSkippedRow[];
        totalTransactions?: number;
        feeCents?: number;
        error?: string;
      };
      const playersJson = (await playersRes.json()) as { unpaidPlayers?: UnpaidPlayer[]; error?: string };
      if (!syncRes.ok) { setPreviewError(syncJson.error ?? "PayPal sync failed."); return; }
      setRows(buildRows(syncJson.matchRows ?? []));
      setSkipped(syncJson.skipped ?? []);
      setTotalCsvRows(syncJson.totalTransactions ?? 0);
      setUnpaidPlayers(playersJson.unpaidPlayers ?? []);
    } catch { setPreviewError("Network error."); }
    finally { setSyncingPayPal(false); }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    if (confirmations.length === 0) { setPreviewError("Nothing to apply."); return; }
    setFinalizing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/all-star/payments/paypal-csv", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmations }),
      });
      const json = (await res.json()) as { applied?: number; skipped?: number; appliedTxIds?: string[]; error?: string };
      if (!res.ok) { setPreviewError(json.error ?? "Finalize failed."); return; }
      setApplyResult({ applied: json.applied ?? 0, skipped: json.skipped ?? 0 });
      setLastAppliedTxIds(json.appliedTxIds ?? []);
      setRows(null);
      setSkipped([]);
      if (fileRef.current) fileRef.current.value = "";
      onApplied?.();
    } catch { setPreviewError("Network error."); }
    finally { setFinalizing(false); }
  }

  // ── Undo ──────────────────────────────────────────────────────────────────────
  async function handleUndo() {
    if (!lastAppliedTxIds?.length) return;
    setUndoing(true);
    try {
      const res = await fetch("/api/admin/all-star/payments/paypal-csv", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "undo", txIds: lastAppliedTxIds }),
      });
      const json = (await res.json()) as { undone?: number; error?: string };
      if (!res.ok) { setPreviewError(json.error ?? "Undo failed."); return; }
      setApplyResult(null);
      setLastAppliedTxIds(null);
      onApplied?.();
    } catch { setPreviewError("Undo network error."); }
    finally { setUndoing(false); }
  }

  // ── Section groups ────────────────────────────────────────────────────────────
  const autoRows = rows?.filter((r) => r.slots.every((s) => s.status === "auto" || s.status === "skipped")) ?? [];
  const reviewRows = rows?.filter((r) => r.slots.some((s) => s.status === "pending" || s.status === "accepted" || s.status === "rejected" || s.status === "manual") && !r.slots.every((s) => s.status === "skipped")) ?? [];

  const [autoExpanded, setAutoExpanded] = useState(false);
  const feeSkipped = skipped.filter((s) => s.reason === "fee_mismatch");
  const alreadySyncedSkipped = skipped.filter((s) => s.reason === "already_synced");

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Apply result banner */}
      {applyResult && (
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300 flex items-center justify-between gap-3 flex-wrap">
          <span>
            ✓ Applied <strong>{applyResult.applied}</strong> payment{applyResult.applied !== 1 ? "s" : ""}.
            {applyResult.skipped > 0 ? ` ${applyResult.skipped} already paid — skipped.` : ""}
          </span>
          {lastAppliedTxIds && lastAppliedTxIds.length > 0 && (
            <button type="button" disabled={undoing} onClick={() => void handleUndo()}
              className="rounded-lg border border-emerald-700 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50 transition-colors">
              {undoing ? "Undoing…" : "Undo import"}
            </button>
          )}
        </div>
      )}

      {/* Fee + file row */}
      {!rows && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div>
              <label htmlFor={feeId} className="block text-xs font-medium text-zinc-400 mb-1">Fee per player</label>
              <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden focus-within:border-sky-600">
                <span className="px-2.5 text-zinc-500 text-sm border-r border-zinc-700 select-none">$</span>
                <input
                  id={feeId}
                  type="number"
                  min="0"
                  step="0.01"
                  value={feeDisplay}
                  onChange={(e) => setFeeDisplay(e.target.value)}
                  className="w-24 bg-transparent px-2 py-1.5 text-sm text-zinc-200 outline-none"
                />
              </div>
              <p className="text-xs text-zinc-600 mt-1">Rows not matching $×N will be skipped</p>
            </div>
            {importMode === "csv" && (
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-zinc-400 mb-1">PayPal Activity CSV</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="block w-full text-sm text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-zinc-600 file:bg-zinc-800 file:text-zinc-200 file:text-sm hover:file:bg-zinc-700 file:transition-colors cursor-pointer"
                  onChange={() => setPreviewError(null)}
                />
              </div>
            )}
          </div>
          {/* Mode pickers + action button */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/60 p-0.5">
              <button
                type="button"
                onClick={() => setImportMode("csv")}
                className={"rounded-md px-3 py-1.5 text-sm font-medium transition-colors " + (importMode === "csv" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}
              >
                Import a CSV
              </button>
              <button
                type="button"
                onClick={() => setImportMode("paypal")}
                className={"rounded-md px-3 py-1.5 text-sm font-medium transition-colors " + (importMode === "paypal" ? "bg-sky-700 text-white" : "text-zinc-400 hover:text-zinc-200")}
              >
                Sync with PayPal
              </button>
            </div>
            {importMode === "csv" ? (
              <button type="button" onClick={() => void handlePreview()} disabled={previewing}
                className="shrink-0 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors">
                {previewing ? "Scanning…" : "Preview Matches"}
              </button>
            ) : (
              <button type="button" onClick={() => void handleSyncPayPal()} disabled={syncingPayPal}
                className="shrink-0 rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors">
                {syncingPayPal ? "Fetching…" : "Preview Matches"}
              </button>
            )}
          </div>
        </div>
      )}

      {previewError && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-2 text-sm text-red-300">{previewError}</div>
      )}

      {/* Preview section */}
      {rows && (
        <div className="space-y-4">

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 text-xs items-center">
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">{totalCsvRows} {preloadedData ? "transactions fetched" : "rows in file"}</span>
            {autoCount > 0 && <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-800/30">✓ {autoCount} auto-matched</span>}
            {pendingCount > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-950/30 text-amber-300 border border-amber-800/30">⚠ {pendingCount} need decision</span>}
            {acceptedCount > 0 && <span className="px-2.5 py-1 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-800/30">+{acceptedCount} accepted</span>}
            {rejectedCount > 0 && <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{rejectedCount} skipped</span>}
            {feeSkipped.length > 0 && <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">{feeSkipped.length} fee mismatch</span>}
            {alreadySyncedSkipped.length > 0 && <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-600 border border-zinc-700">{alreadySyncedSkipped.length} already synced</span>}
          </div>

          {/* Auto-matched section (collapsible) */}
          {autoRows.length > 0 && (
            <div className="rounded-xl border border-emerald-800/30 overflow-hidden">
              <button type="button" onClick={() => setAutoExpanded((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-3 bg-emerald-950/10 hover:bg-emerald-950/20 transition-colors text-left">
                <span className="text-sm font-medium text-emerald-300">✓ Auto-matched ({autoRows.length} transactions)</span>
                <span className="text-emerald-600 text-xs">{autoExpanded ? "▲ Hide" : "▼ Review"}</span>
              </button>
              {autoExpanded && (
                <div className="px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
                  {autoRows.map((r) => (
                    <TxCard key={r.txId} row={r} unpaidPlayers={unpaidPlayers} onSlotAction={onSlotAction} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Review / Unmatched section */}
          {reviewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-0.5">
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  Review Required — {reviewRows.length} transaction{reviewRows.length !== 1 ? "s" : ""}
                </h3>
                {pendingCount === 0 && reviewRows.length > 0 && (
                  <span className="text-xs text-emerald-400">All reviewed ✓</span>
                )}
              </div>
              <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                {reviewRows.map((r) => (
                  <TxCard key={r.txId} row={r} unpaidPlayers={unpaidPlayers} onSlotAction={onSlotAction} />
                ))}
              </div>
            </div>
          )}

          {/* Fee mismatch info */}
          {feeSkipped.length > 0 && (
            <details className="rounded-lg border border-zinc-700/50">
              <summary className="px-4 py-2.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
                {feeSkipped.length} rows skipped — amount not a multiple of {fmtMoney(feeCents)}
              </summary>
              <div className="px-4 pb-3 space-y-1">
                {feeSkipped.map((r) => (
                  <div key={r.txId} className="text-xs text-zinc-600 flex gap-2">
                    <span className="font-medium">{fmtMoney(r.grossCents)}</span>
                    <span>{r.payerName}</span>
                    <span className="truncate max-w-xs">{r.playerNote}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Finalize bar */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-700/40">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { setRows(null); setSkipped([]); setPreviewError(null); if (preloadedData) onClose?.(); }}
                className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
                {preloadedData ? "← Cancel" : "← New file"}
              </button>
              {pendingCount > 0 && (
                <span className="text-xs text-amber-400">{pendingCount} decision{pendingCount !== 1 ? "s" : ""} remaining</span>
              )}
            </div>
            <button
              type="button"
              disabled={finalizing || pendingCount > 0 || toApplyCount === 0}
              onClick={() => void handleFinalize()}
              className="rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-5 py-2 text-sm font-medium text-white transition-colors"
            >
              {finalizing ? "Finalizing…" : pendingCount > 0 ? `Finalize (${pendingCount} pending)` : `Finalize ${toApplyCount} payment${toApplyCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export default function AllStarPaypalCsvImport({
  controlled,
  onClose,
  onApplied,
  preloadedData,
}: {
  controlled?: boolean;
  onClose?: () => void;
  onApplied?: () => void;
  preloadedData?: PreloadedSyncData;
} = {}) {
  const [open, setOpen] = useState(false);

  if (controlled) {
    return (
      <div className="rounded-xl border border-sky-800/40 bg-sky-950/10 p-4">
        <ImportContent onApplied={onApplied} onClose={onClose} preloadedData={preloadedData} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 overflow-hidden">
      <button type="button" onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors text-left">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Import PayPal CSV</div>
          <div className="text-xs text-zinc-500 mt-0.5">Upload a PayPal activity export to auto-match and mark players paid</div>
        </div>
        <span className="text-zinc-500 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-700/50 px-5 py-4">
          <ImportContent />
        </div>
      )}
    </div>
  );
}
