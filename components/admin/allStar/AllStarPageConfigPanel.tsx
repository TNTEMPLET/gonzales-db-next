"use client";

import { useEffect, useState } from "react";

type Config = {
  paypalLinkLabel: string | null;
  paypalLinkUrl: string | null;
  infoText: string | null;
};

export default function AllStarPageConfigPanel({ org }: { org: string }) {
  const [config, setConfig] = useState<Config>({
    paypalLinkLabel: null,
    paypalLinkUrl: null,
    infoText: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ org });
    fetch(`/api/admin/all-star/page-config?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { config?: Config; error?: string }) => {
        if (d.config) setConfig(d.config);
      })
      .catch(() => setError("Failed to load config"))
      .finally(() => setLoading(false));
  }, [org]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const params = new URLSearchParams({ org });
      const res = await fetch(`/api/admin/all-star/page-config?${params.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = (await res.json()) as { config?: Config; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Save failed");
      } else if (d.config) {
        setConfig(d.config);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  function publicPageUrl() {
    return typeof window !== "undefined" ? `${window.location.origin}/all-star` : "/all-star";
  }

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 overflow-hidden mb-8">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-700/50">
        <div>
          <span className="text-base font-semibold text-white">Public All-Stars Page</span>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure what appears at{" "}
            <a href="/all-star" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
              /all-star
            </a>{" "}
            — the public-facing All-Star information page.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-8 flex items-center gap-2 text-zinc-400 text-sm">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          Loading…
        </div>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="px-6 py-5 space-y-5">
          {/* PayPal link label */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              PayPal Link Label
              <span className="text-zinc-500 font-normal ml-2 text-xs">shown on the button and above the QR code</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 2026 All-Star Fee Payment"
              value={config.paypalLinkLabel ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, paypalLinkLabel: e.target.value || null }))}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* PayPal URL */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              PayPal Link URL
              <span className="text-zinc-500 font-normal ml-2 text-xs">must be a paypal.com or paypal.me link</span>
            </label>
            <input
              type="url"
              placeholder="https://paypal.me/yourorg"
              value={config.paypalLinkUrl ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, paypalLinkUrl: e.target.value || null }))}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Info text */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              General Info Text
              <span className="text-zinc-500 font-normal ml-2 text-xs">optional announcement shown at the top of the page</span>
            </label>
            <textarea
              rows={4}
              placeholder="All-Star fees are due by June 15. Contact your coach with any questions."
              value={config.infoText ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, infoText: e.target.value || null }))}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-950/60 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {saved && (
              <span className="text-sm text-emerald-400">✓ Saved</span>
            )}
            {config.paypalLinkUrl && (
              <a
                href="/all-star"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-400 hover:underline ml-auto"
              >
                Preview public page ↗
              </a>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
