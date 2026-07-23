"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { fmtMerchPrice } from "@/lib/merch/paypal";
import { SHIRT_SIZE_OPTIONS } from "@/lib/merch/shirtSizeOptions";
import type { MerchProduct } from "@/lib/merch/types";

const MAX_QTY = 10;

type LineItem = { key: string; size: string };

function newLine(size = ""): LineItem {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, size };
}

function isLocalImage(src: string): boolean {
  return src.startsWith("/");
}

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

/**
 * Members shop checkout: save structured draft, then open PayPal with the
 * composed note (code + player + sizes) so parents don't retype sizes.
 */
export default function ShopOrderForm({
  products,
  org,
  defaultEmail = "",
}: {
  products: MerchProduct[];
  org: string;
  defaultEmail?: string;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [playerName, setPlayerName] = useState("");
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SavedDraft | null>(null);
  const [copied, setCopied] = useState(false);

  const product = products.find((p) => p.id === productId) ?? products[0] ?? null;
  const maxQty = Math.min(MAX_QTY, product?.maxQuantity ?? MAX_QTY);
  const quantity = lines.length;
  const sizes = lines.map((l) => l.size);
  const allSized = sizes.every((s) => s.trim());
  const canSubmit = Boolean(product && playerName.trim().length >= 2 && allSized && !saving);
  const totalCents = (product?.priceCents ?? 0) * quantity;

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/merch/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org,
          productId: product.id,
          playerName,
          sizes,
          contactEmail: contactEmail.trim() || null,
        }),
      });
      const data = (await res.json()) as { draft?: SavedDraft; error?: string };
      if (!res.ok || !data.draft) {
        setError(data.error ?? "Could not save order");
        return;
      }
      setDraft(data.draft);
      try {
        await navigator.clipboard.writeText(data.draft.checkoutNote);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch {
        // clipboard optional
      }
      window.open(data.draft.paypalUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  const sizeSummary = useMemo(() => sizes.filter(Boolean).join(", "), [sizes]);

  if (products.length === 0) return null;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid gap-6 lg:grid-cols-5"
      >
        <div className="space-y-5 lg:col-span-3">
          <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <legend className="px-1 text-sm font-semibold text-zinc-300">Choose shirt</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((p) => {
                const selected = p.id === productId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id);
                      setDraft(null);
                      setLines([newLine()]);
                    }}
                    className={
                      "flex gap-3 rounded-xl border p-3 text-left transition " +
                      (selected
                        ? "border-brand-purple bg-brand-purple/10 ring-1 ring-brand-purple/40"
                        : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-600")
                    }
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                      {p.imageUrl ? (
                        isLocalImage(p.imageUrl) ? (
                          <Image src={p.imageUrl} alt="" fill className="object-contain p-1" sizes="64px" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-full w-full object-contain p-1" />
                        )
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-50 leading-snug">{p.name}</p>
                      <p className="mt-1 text-sm tabular-nums text-zinc-300">
                        {fmtMerchPrice(p.priceCents)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <legend className="px-1 text-sm font-semibold text-zinc-300">Player & contact</legend>
            <label className="block space-y-1.5">
              <span className="text-sm text-zinc-300">
                Player name <span className="text-rose-400">*</span>
              </span>
              <input
                required
                minLength={2}
                maxLength={80}
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  setDraft(null);
                }}
                placeholder="Player full name"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-zinc-300">Email (optional)</span>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-600 focus:outline-none"
              />
            </label>
          </fieldset>

          <fieldset className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <legend className="px-1 text-sm font-semibold text-zinc-300">Sizes</legend>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-zinc-400">Quantity</span>
              <div className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-950">
                <button
                  type="button"
                  disabled={quantity <= 1}
                  onClick={() => setQty(quantity - 1)}
                  className="px-3 py-2 text-zinc-300 hover:text-white disabled:opacity-40"
                  aria-label="Fewer shirts"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={quantity >= maxQty}
                  onClick={() => setQty(quantity + 1)}
                  className="px-3 py-2 text-zinc-300 hover:text-white disabled:opacity-40"
                  aria-label="More shirts"
                >
                  +
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {lines.map((line, idx) => (
                <li key={line.key} className="flex flex-wrap items-center gap-3">
                  <span className="w-16 text-xs uppercase tracking-wide text-zinc-500">
                    Shirt {idx + 1}
                  </span>
                  <select
                    required
                    value={line.size}
                    onChange={(e) => {
                      setDraft(null);
                      setLines((prev) =>
                        prev.map((l) => (l.key === line.key ? { ...l, size: e.target.value } : l)),
                      );
                    }}
                    className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-sky-600 focus:outline-none"
                  >
                    <option value="">Select size…</option>
                    <optgroup label="Youth">
                      {SHIRT_SIZE_OPTIONS.filter((o) => o.group === "youth").map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Adult">
                      {SHIRT_SIZE_OPTIONS.filter((o) => o.group === "adult").map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
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

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0070ba] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#005ea6] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[16rem]"
          >
            {saving ? "Saving order…" : `Save & pay ${fmtMerchPrice(totalCents)} with PayPal`}
          </button>
          <p className="text-xs text-zinc-500">
            We save your player name and sizes first, then open PayPal. Paste the order note if
            PayPal asks for it (we also try to copy it for you).
          </p>
        </div>

        <aside className="lg:col-span-2">
          <div className="sticky top-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Order summary
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Product</dt>
                <dd className="text-right text-zinc-100">{product?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Player</dt>
                <dd className="text-right text-zinc-100">{playerName.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Sizes</dt>
                <dd className="text-right text-zinc-100">{sizeSummary || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-zinc-800 pt-2">
                <dt className="text-zinc-500">Total</dt>
                <dd className="text-right text-lg font-bold tabular-nums text-white">
                  {fmtMerchPrice(totalCents)}
                </dd>
              </div>
            </dl>

            {draft ? (
              <div className="space-y-3 rounded-xl border border-emerald-800/40 bg-emerald-950/25 p-4">
                <p className="text-sm font-semibold text-emerald-100">Draft saved</p>
                <p className="text-xs text-emerald-100/80">
                  Order code{" "}
                  <span className="font-mono font-semibold text-emerald-50">{draft.code}</span>
                  {copied ? " · note copied" : ""}
                </p>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    Paste this on PayPal if asked
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-sky-100">
                    {draft.checkoutNote}
                  </pre>
                  <button
                    type="button"
                    className="mt-2 text-xs text-sky-400 hover:underline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(draft.checkoutNote);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    {copied ? "Copied" : "Copy note again"}
                  </button>
                </div>
                <a
                  href={draft.paypalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-[#0070ba] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#005ea6]"
                >
                  Open PayPal checkout
                </a>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-zinc-500">
                After you save, payment goes through PayPal. Your sizes stay on file so the league
                does not rely on free-typed size text alone.
              </p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
