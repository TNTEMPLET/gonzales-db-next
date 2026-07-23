"use client";

import { useCallback, useEffect, useState } from "react";

import { fmtMerchPrice } from "@/lib/merch/paypal";

type DraftRow = {
  id: string;
  code: string;
  productName: string;
  playerName: string;
  sizes: string[];
  quantity: number;
  amountCents: number;
  status: string;
  checkoutNote: string;
  paypalTxId: string | null;
  createdAt: string;
  paidAt: string | null;
};

export default function MerchDraftsList({ org }: { org: string }) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merch/drafts?org=${encodeURIComponent(org)}&limit=30`);
      const data = (await res.json()) as { drafts?: DraftRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load drafts");
        setDrafts([]);
        return;
      }
      setDrafts(data.drafts ?? []);
    } catch {
      setError("Network error");
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Recent draft orders</h2>
          <p className="text-xs text-zinc-500">
            Awaiting payment until PayPal sync/webhook matches the MO- code in the note.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-zinc-500">No drafts yet for this org.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2 font-semibold">Code</th>
                <th className="px-2 py-2 font-semibold">Player</th>
                <th className="px-2 py-2 font-semibold">Product</th>
                <th className="px-2 py-2 font-semibold">Sizes</th>
                <th className="px-2 py-2 font-semibold">Total</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {drafts.map((d) => (
                <tr key={d.id} className="text-zinc-300">
                  <td className="px-2 py-2 font-mono text-xs text-amber-200">{d.code}</td>
                  <td className="px-2 py-2">{d.playerName}</td>
                  <td className="px-2 py-2 text-xs text-zinc-400">{d.productName}</td>
                  <td className="px-2 py-2 font-mono text-xs">{d.sizes.join(", ")}</td>
                  <td className="px-2 py-2 tabular-nums">{fmtMerchPrice(d.amountCents)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                        (d.status === "paid"
                          ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
                          : d.status === "awaiting_payment"
                            ? "border-amber-700/50 bg-amber-950/30 text-amber-200"
                            : "border-zinc-700 text-zinc-500")
                      }
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-zinc-500">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
