"use client";

import { useMemo, useState } from "react";

import { fmtMerchPrice } from "@/lib/merch/paypal";
import {
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
  /** Local row id */
  key: string;
  size: string;
};

function newLine(size = ""): LineItem {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, size };
}

export default function MerchTestOrderForm({
  products,
  orgLabel,
}: {
  products: MerchProduct[];
  orgLabel: string;
}) {
  const openProducts = products.filter((p) => p.active !== false && p.enabled !== false);
  const [productId, setProductId] = useState(openProducts[0]?.id ?? products[0]?.id ?? "");
  const [playerName, setPlayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [noteStyle, setNoteStyle] = useState<"joined" | "multiline">("joined");
  const [copied, setCopied] = useState<"note" | "json" | null>(null);
  const [submittedPreview, setSubmittedPreview] = useState(false);

  const product = products.find((p) => p.id === productId) ?? products[0] ?? null;
  const maxQty = Math.min(MAX_QTY, product?.maxQuantity ?? MAX_QTY);
  const quantity = lines.length;
  const unitCents = product?.priceCents ?? 0;
  const totalCents = unitCents * quantity;

  const sizes = lines.map((l) => l.size);
  const allSized = sizes.every((s) => s.trim().length > 0);
  const canPreview = Boolean(product && playerName.trim() && allSized && quantity >= 1);

  const composedNote = useMemo(() => {
    if (noteStyle === "multiline") {
      return buildShirtCheckoutNoteMultiline(playerName, sizes);
    }
    return buildShirtCheckoutNote(playerName, sizes);
  }, [noteStyle, playerName, sizes]);

  const parsed = useMemo(() => {
    const split = splitShirtNote(composedNote);
    const expanded = sizeLabelsForOrder(composedNote, quantity);
    return { split, expanded };
  }, [composedNote, quantity]);

  const deskRow = useMemo(() => {
    if (!product) return null;
    return {
      org: product.orgs[0] ?? "unknown",
      itemName: product.name,
      paypalItemHint: product.name,
      quantity,
      amountCents: totalCents,
      payerName: "(from PayPal account)",
      payerEmail: payerEmail.trim() || "(from PayPal account)",
      playerName: parsed.split.player,
      sizes: parsed.split.sizes || parsed.expanded.join(", "),
      sizesExpanded: parsed.expanded,
      note: composedNote,
      paypalUrl: product.paypalUrl,
      productId: product.id,
    };
  }, [product, quantity, totalCents, payerEmail, parsed, composedNote]);

  function setQty(n: number) {
    const next = Math.max(1, Math.min(maxQty, n));
    setLines((prev) => {
      if (next === prev.length) return prev;
      if (next > prev.length) {
        return [...prev, ...Array.from({ length: next - prev.length }, () => newLine())];
      }
      return prev.slice(0, next);
    });
  }

  function updateSize(key: string, size: string) {
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

  function handleContinueToPayPal() {
    if (!product || !canPreview) return;
    setSubmittedPreview(true);
    void copyText(composedNote, "note");
    window.open(product.paypalUrl, "_blank", "noopener,noreferrer");
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
      {/* ── Form ─────────────────────────────────────────────── */}
      <div className="space-y-5 lg:col-span-3">
        <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Prototype — does not charge or create a real order</p>
          <p className="mt-1 text-amber-100/80">
            Mirrors what parents enter on PayPal NCP today (product, qty ≤ {MAX_QTY}, player name,
            size per shirt). Use this to pressure-test a streamlined on-site flow before we replace
            the raw PayPal form.
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
                setSubmittedPreview(false);
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
          {product ? (
            <p className="text-xs text-zinc-500">
              PayPal button:{" "}
              <a
                href={product.paypalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                {product.paypalUrl.replace("https://www.paypal.com", "")}
              </a>
              {" · "}
              fixed {fmtMerchPrice(product.priceCents)} each · max {maxQty} per checkout
            </p>
          ) : null}
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
              autoComplete="name"
              placeholder="e.g. Jordan Smith"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                setSubmittedPreview(false);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
            />
            <span className="text-xs text-zinc-500">
              Same required field parents type on the PayPal page — lands on the vendor CSV as Player
              Name.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">
              Contact email <span className="text-zinc-600">(optional on this prototype)</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="parent@email.com"
              value={payerEmail}
              onChange={(e) => setPayerEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
            />
            <span className="text-xs text-zinc-500">
              Today PayPal supplies payer email after payment. Collecting it here would let us
              confirm orders without waiting on sync.
            </span>
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
                aria-label="Decrease quantity"
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
                aria-label="Increase quantity"
                disabled={quantity >= maxQty}
                onClick={() => setQty(quantity + 1)}
                className="px-3 py-2 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                +
              </button>
            </div>
            <span className="text-xs text-zinc-500">max {maxQty} (PayPal NCP quantity_option)</span>
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
                  onChange={(e) => {
                    updateSize(line.key, e.target.value);
                    setSubmittedPreview(false);
                  }}
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
          <p className="text-xs text-zinc-500">
            Today parents free-type sizes on PayPal (&quot;Youth Medium&quot;, &quot;AL&quot;,
            newlines…). Structured picks here avoid bad notes on the fulfillment desk.
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canPreview}
            onClick={() => setSubmittedPreview(true)}
            className="rounded-xl bg-brand-purple px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            Preview desk order
          </button>
          <button
            type="button"
            disabled={!canPreview || !product}
            onClick={handleContinueToPayPal}
            className="rounded-xl border border-[#0070ba]/60 bg-[#0070ba]/15 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-[#0070ba]/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Copy note & open PayPal
          </button>
          <p className="text-lg font-bold tabular-nums text-white">
            {fmtMerchPrice(totalCents)}
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {quantity} × {fmtMerchPrice(unitCents)}
            </span>
          </p>
        </div>
      </div>

      {/* ── Preview / streamlining panel ─────────────────────── */}
      <aside className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            PayPal note (what sync stores)
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            NCP joins custom fields roughly as{" "}
            <code className="text-zinc-400">player | sizes</code>. Shirt Orders parses that string.
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setNoteStyle("joined")}
              className={
                "rounded-full px-2.5 py-1 text-xs font-medium border " +
                (noteStyle === "joined"
                  ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500")
              }
            >
              Comma sizes
            </button>
            <button
              type="button"
              onClick={() => setNoteStyle("multiline")}
              className={
                "rounded-full px-2.5 py-1 text-xs font-medium border " +
                (noteStyle === "multiline"
                  ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500")
              }
            >
              One size / line
            </button>
          </div>

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
              <dt className="text-zinc-500">Player</dt>
              <dd className="text-right font-medium text-zinc-100">
                {parsed.split.player || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Sizes expanded</dt>
              <dd className="text-right font-medium text-zinc-100">
                {parsed.expanded.filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Qty vs labels</dt>
              <dd
                className={
                  "text-right font-medium " +
                  (parsed.expanded.filter(Boolean).length === quantity
                    ? "text-emerald-300"
                    : "text-amber-300")
                }
              >
                {parsed.expanded.filter(Boolean).length} / {quantity}
              </dd>
            </div>
          </dl>
          {submittedPreview && canPreview ? (
            <p className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
              Ready for desk: {quantity} shirt{quantity === 1 ? "" : "s"} ·{" "}
              {fmtMerchPrice(totalCents)} · player &quot;{parsed.split.player}&quot;
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Streamline comparison
          </h2>
          <ul className="mt-3 space-y-3 text-xs leading-relaxed text-zinc-400">
            <li className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
              <span className="font-semibold text-zinc-200">Today (PayPal NCP)</span>
              <br />
              Shop → Buy → PayPal form (free-text name + sizes + qty) → pay → webhook/sync → Shirt
              Orders. Typos and odd size text break the vendor tally.
            </li>
            <li className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2">
              <span className="font-semibold text-emerald-200">This prototype</span>
              <br />
              Structured picks on our site → validated note → optional hand-off to PayPal for money
              only. Same note format the desk already understands.
            </li>
            <li className="rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2">
              <span className="font-semibold text-sky-200">Next step (if we ship it)</span>
              <br />
              Save draft order in DB, open PayPal, match payment by amount + time + note (or PayPal
              order id), auto-open Shirt Orders rows without parents retyping sizes.
            </li>
          </ul>
        </div>

        {deskRow ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Simulated order JSON
              </h2>
              <button
                type="button"
                disabled={!canPreview}
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
