"use client";

import { useMemo, useState } from "react";

import PayPalEmbeddedCheckout from "@/components/merch/PayPalEmbeddedCheckout";
import { fmtMerchPrice } from "@/lib/merch/paypal";
import { SHIRT_SIZE_OPTIONS } from "@/lib/merch/shirtSizeOptions";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SavedDraft | null>(null);
  const [paidMsg, setPaidMsg] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId) ?? products[0] ?? null;
  const maxQty = Math.min(MAX_QTY, product?.maxQuantity ?? MAX_QTY);
  const quantity = lines.length;
  const unitCents = product?.priceCents ?? 0;
  const totalCents = unitCents * quantity;

  const sizes = lines.map((l) => l.size);
  const allSized = sizes.every((s) => s.trim().length > 0);
  const canSubmit = Boolean(product && playerName.trim() && allSized && quantity >= 1 && !saving);

  const composedNote = draft?.checkoutNote ?? "";
  const parsed = useMemo(() => {
    if (!composedNote) return { split: splitShirtNote(""), expanded: [] as string[] };
    return {
      split: splitShirtNote(composedNote),
      expanded: sizeLabelsForOrder(composedNote, quantity),
    };
  }, [composedNote, quantity]);

  function setQty(n: number) {
    const next = Math.max(1, Math.min(maxQty, n));
    setDraft(null);
    setPaidMsg(null);
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
    setPaidMsg(null);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, size } : l)));
  }

  async function saveDraft() {
    if (!product || !canSubmit) return;
    setSaving(true);
    setError(null);
    setPaidMsg(null);
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
        <div className="rounded-2xl border border-sky-700/40 bg-sky-950/20 px-4 py-3 text-sm text-sky-100">
          <p className="font-semibold">Embedded PayPal checkout (one AP Baseball account)</p>
          <p className="mt-1 text-sky-100/80">
            Saves a draft, then PayPal JS SDK buttons charge via the Orders API.{" "}
            <span className="font-medium">NCP links already sent to parents are unchanged</span> —
            this is the next-campaign path (no copy/paste).
          </p>
        </div>

        <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            1 · Product
          </legend>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setLines([newLine()]);
              setDraft(null);
              setPaidMsg(null);
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
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            2 · Who is this for?
          </legend>
          <input
            type="text"
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              setDraft(null);
              setPaidMsg(null);
            }}
            placeholder="Player name *"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
          />
          <input
            type="email"
            value={payerEmail}
            onChange={(e) => setPayerEmail(e.target.value)}
            placeholder="Contact email (optional)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
          />
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
        {paidMsg ? (
          <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
            {paidMsg}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void saveDraft()}
            className="rounded-xl bg-brand-purple px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving draft…" : draft ? "Refresh draft" : "Save draft → show PayPal"}
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
            Embedded payment
          </h2>
          {draft ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-zinc-400">
                Draft <span className="font-mono text-amber-200">{draft.code}</span> ·{" "}
                {draft.playerName} · {draft.sizes.join(", ")}
              </p>
              <PayPalEmbeddedCheckout
                draftId={draft.id}
                onPaid={(r) => {
                  setPaidMsg(
                    `Paid ${draft.code}${r.shirtOrderId ? ` · shirt order ${r.shirtOrderId.slice(0, 8)}…` : ""}`,
                  );
                  setDraft((d) => (d ? { ...d, status: "paid" } : d));
                }}
                onError={(msg) => setError(msg)}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              Save a draft to render PayPal buttons. Requires PAYPAL_CLIENT_ID / SECRET on the
              deployment.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Desk fields
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Code</dt>
              <dd className="font-mono text-right text-amber-200">{draft?.code ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Player</dt>
              <dd className="text-right text-zinc-100">
                {parsed.split.player || playerName || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Sizes</dt>
              <dd className="text-right text-zinc-100">
                {(parsed.expanded.length ? parsed.expanded : sizes).filter(Boolean).join(", ") ||
                  "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Status</dt>
              <dd className="text-right text-emerald-300">{draft?.status ?? "not saved"}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
