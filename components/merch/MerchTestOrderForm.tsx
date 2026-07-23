"use client";

import { useMemo, useState } from "react";

import { fmtMerchPrice } from "@/lib/merch/paypal";
import {
  buildDraftAwareCheckoutNote,
  buildShirtCheckoutNote,
  buildShirtCheckoutNoteMultiline,
  SHIRT_SIZE_OPTIONS,
} from "@/lib/merch/shirtSizeOptions";
import {
  sizeLabelsForOrder,
  splitShirtNote,
} from "@/lib/merch/shirtSizes";
import type { MerchProduct } from "@/lib/merch/types";

const MAX_QTY = 10;

type LineItem = {
  key: string;
  size: string;
};

type SavedDraft = {
  id: string;
  code: string;
  checkoutNote: string;
  paypalUrl: string;
  productName: string;
  playerName: string;
  sizes: string[];
  quantity: number;
  amountCents: number;
  status: string;
};

function newLine(size = ""): LineItem {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, size };
}

export default function MerchTestOrderForm({
  products,
  orgLabel,
  org,
}: {
  products: MerchProduct[];
  orgLabel: string;
  org: string;
}) {
  const openProducts = products.filter((p) => p.active !== false && p.enabled !== false);
  const [productId, setProductId] = useState(openProducts[0]?.id ?? products[0]?.id ?? "");
  const [playerName, setPlayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [noteStyle, setNoteStyle] = useState<"joined" | "multiline">("joined");
  const [copied, setCopied] = useState<"note" | "json" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SavedDraft | null>(null);

  const product = products.find((p) => p.id === productId) ?? products[0] ?? null;
  const maxQty = Math.min(MAX_QTY, product?.maxQuantity ?? MAX_QTY);
  const quantity = lines.length;
  const unitCents = product?.priceCents ?? 0;
  const totalCents = unitCents * quantity;

  const sizes = lines.map((l) => l.size);
  const allSized = sizes.every((s) => s.trim().length > 0);
  const canSubmit = Boolean(product && playerName.trim() && allSized && quantity >= 1 && !saving);

  const composedNote = useMemo(() => {
    if (draft?.checkoutNote) return draft.checkoutNote;
    if (noteStyle === "multiline") {
      return buildShirtCheckoutNoteMultiline(playerName, sizes);
    }
    return buildShirtCheckoutNote(playerName, sizes);
  }, [draft, noteStyle, playerName, sizes]);

  const parsed = useMemo(() => {
    const split = splitShirtNote(composedNote);
    const expanded = sizeLabelsForOrder(composedNote, quantity);
    return { split, expanded };
  }, [composedNote, quantity]);

  const deskRow = useMemo(() => {
    if (!product) return null;
    return {
      draftCode: draft?.code ?? null,
      draftStatus: draft?.status ?? null,
      org: product.orgs[0] ?? "unknown",
      itemName: product.name,
      quantity,
      amountCents: totalCents,
      payerEmail: payerEmail.trim() || null,
      playerName: parsed.split.player,
      sizesExpanded: parsed.expanded,
      note: composedNote,
      paypalUrl: product.paypalUrl,
      productId: product.id,
    };
  }, [product, quantity, totalCents, payerEmail, parsed, composedNote, draft]);

  function setQty(n: number) {
    const next = Math.max(1, Math.min(maxQty, n));
    setDraft(null);
    setLines((prev) => {
      if (next === prev.length) return prev;
      if (next > prev.length) {
        return [...prev, ...Array.from({ length: next - prev.length }, () => newLine())];
      }
      return prev.slice(0, next);
    });
  }

  function updateSize(key: string, size: string) {
    setDraft(null);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, size } : l)));
  }

  async function copyText(text: string, kind: "note" | "json") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }

  async function saveDraftAndPay() {
    if (!product || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/merch/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org,
          productId: product.id,
          playerName,
          sizes,
          contactEmail: payerEmail.trim() || null,
        }),
      });
      const data = (await res.json()) as { draft?: SavedDraft; error?: string };
      if (!res.ok || !data.draft) {
        setError(data.error ?? "Failed to save draft");
        return;
      }
      setDraft(data.draft);
      await copyText(data.draft.checkoutNote, "note");
      window.open(data.draft.paypalUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (products.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-500">
        No catalog products for {orgLabel}. Add SKUs or switch org.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <div className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Saves a real draft order on submit</p>
          <p className="mt-1 text-emerald-100/80">
            Creates a <span className="font-mono">MO-XXXXXX</span> draft in the database with
            structured sizes, then opens PayPal. When payment syncs, the note code links the payment
            back to this draft — parents should not retype sizes.
          </p>
        </div>

        <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            1 · Product
          </legend>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">Championship shirt</span>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setLines([newLine()]);
                setDraft(null);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-sky-600 focus:outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.enabled === false ? " (Closed)" : ""} — {fmtMerchPrice(p.priceCents)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            2 · Who is this for?
          </legend>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">
              Player name <span className="text-rose-400">*</span>
            </span>
            <input
              type="text"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                setDraft(null);
              }}
              placeholder="e.g. Jordan Smith"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">Contact email (optional)</span>
            <input
              type="email"
              value={payerEmail}
              onChange={(e) => setPayerEmail(e.target.value)}
              placeholder="parent@email.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            3 · Shirts & sizes
          </legend>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-300">Quantity</span>
            <div className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-950">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => setQty(quantity - 1)}
                className="px-3 py-2 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums text-white">
                {quantity}
              </span>
              <button
                type="button"
                disabled={quantity >= maxQty}
                onClick={() => setQty(quantity + 1)}
                className="px-3 py-2 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          <ul className="space-y-3">
            {lines.map((line, idx) => (
              <li
                key={line.key}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3"
              >
                <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Shirt {idx + 1}
                </span>
                <select
                  value={line.size}
                  onChange={(e) => updateSize(line.key, e.target.value)}
                  className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-sky-600 focus:outline-none"
                >
                  <option value="">Select size…</option>
                  <optgroup label="Youth">
                    {SHIRT_SIZE_OPTIONS.filter((o) => o.group === "youth").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label} ({o.value})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Adult">
                    {SHIRT_SIZE_OPTIONS.filter((o) => o.group === "adult").map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label} ({o.value})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </li>
            ))}
          </ul>
        </fieldset>

        {error ? (
          <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void saveDraftAndPay()}
            className="rounded-xl bg-[#0070ba] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#005ea6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving draft…" : "Save draft & open PayPal"}
          </button>
          <p className="text-lg font-bold tabular-nums text-white">
            {fmtMerchPrice(totalCents)}
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {quantity} × {fmtMerchPrice(unitCents)}
            </span>
          </p>
        </div>
      </div>

      <aside className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Checkout note
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            After save:{" "}
            <code className="text-zinc-400">
              {buildDraftAwareCheckoutNote("MO-XXXXXX", "Player", ["YM", "AL"])}
            </code>
          </p>

          {!draft ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setNoteStyle("joined")}
                className={
                  "rounded-full px-2.5 py-1 text-xs font-medium border " +
                  (noteStyle === "joined"
                    ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
                    : "border-zinc-700 text-zinc-400")
                }
              >
                Preview without code
              </button>
            </div>
          ) : null}

          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-xs text-sky-100">
            {composedNote || (
              <span className="text-zinc-600 italic">Fill player name and sizes…</span>
            )}
          </pre>
          <button
            type="button"
            disabled={!composedNote}
            onClick={() => void copyText(composedNote, "note")}
            className="mt-2 text-xs text-sky-400 hover:underline disabled:opacity-40"
          >
            {copied === "note" ? "Copied note" : "Copy note"}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Desk parse check
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Draft code</dt>
              <dd className="font-mono text-right font-medium text-amber-200">
                {draft?.code ?? parsed.split.draftCode ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Player</dt>
              <dd className="text-right font-medium text-zinc-100">
                {parsed.split.player || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Sizes</dt>
              <dd className="text-right font-medium text-zinc-100">
                {parsed.expanded.filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Status</dt>
              <dd className="text-right font-medium text-emerald-300">
                {draft?.status ?? "not saved"}
              </dd>
            </div>
          </dl>
          {draft ? (
            <p className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
              Draft {draft.code} saved. Complete PayPal payment, then Sync on Shirt Orders — the
              payment will mark this draft paid and use these sizes.
            </p>
          ) : null}
        </div>

        {deskRow ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Order payload
              </h2>
              <button
                type="button"
                disabled={!canSubmit && !draft}
                onClick={() => void copyText(JSON.stringify(deskRow, null, 2), "json")}
                className="text-xs text-sky-400 hover:underline disabled:opacity-40"
              >
                {copied === "json" ? "Copied" : "Copy JSON"}
              </button>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-[11px] leading-relaxed text-zinc-300">
              {JSON.stringify(deskRow, null, 2)}
            </pre>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
