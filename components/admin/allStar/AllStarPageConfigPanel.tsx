"use client";

import { useEffect, useState } from "react";

type PageLink = { label: string; url: string; imageUrl?: string; activeFrom?: string; activeTo?: string; enabled?: boolean };

type Config = {
  paypalLinkLabel: string | null;
  paypalLinkUrl: string | null;
  infoText: string | null;
  links: PageLink[];
};

export default function AllStarPageConfigPanel({ org, orgLabel }: { org: string; orgLabel?: string }) {
  const [config, setConfig] = useState<Config>({
    paypalLinkLabel: null,
    paypalLinkUrl: null,
    infoText: null,
    links: [],
  });
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ org });
    fetch(`/api/admin/all-star/page-config?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { config?: Config; error?: string }) => {
        if (d.config) setConfig({ ...d.config, links: (d.config.links as PageLink[]) ?? [] });
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

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 overflow-hidden mb-8">
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-zinc-800/30 transition-colors text-left"
      >
        <div>
          <span className="text-base font-semibold text-white">
            Public All-Stars Page{orgLabel ? ` — ${orgLabel}` : ""}
          </span>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure what appears at{" "}
            <a
              href="/all-star"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              /all-star
            </a>{" "}
            — the public-facing All-Star information page.
          </p>
        </div>
        <span className="text-zinc-500 text-sm shrink-0">{collapsed ? "▼" : "▲"}</span>
      </button>

      {!collapsed && (
        <>
          <div className="border-t border-zinc-700/50" />
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

          {/* Additional purchase links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">
                Additional Links
                <span className="text-zinc-500 font-normal ml-2 text-xs">e.g. parent caps, apparel</span>
              </label>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, links: [...c.links, { label: "", url: "" }] }))}
                className="text-xs text-sky-400 hover:text-sky-300 border border-sky-800/40 rounded px-2 py-0.5 hover:bg-sky-950/30 transition-colors"
              >
                + Add Link
              </button>
            </div>
            {config.links.length === 0 && (
              <p className="text-xs text-zinc-600 italic">No additional links yet.</p>
            )}
            <div className="space-y-2">
              {config.links.map((link, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Label (e.g. Parent Caps)"
                      value={link.label}
                      onChange={(e) => setConfig((c) => {
                        const links = [...c.links];
                        links[i] = { ...links[i], label: e.target.value };
                        return { ...c, links };
                      })}
                      className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => setConfig((c) => {
                        const links = [...c.links];
                        links[i] = { ...links[i], enabled: link.enabled === false ? true : false };
                        return { ...c, links };
                      })}
                      title={link.enabled === false ? "Click to enable" : "Click to disable"}
                      className={
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors " +
                        (link.enabled === false
                          ? "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-300"
                          : "bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-red-950/30 hover:text-red-400 hover:border-red-700/50")
                      }
                    >
                      {link.enabled === false ? "Disabled" : "Enabled"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, links: c.links.filter((_, j) => j !== i) }))}
                      className="text-zinc-500 hover:text-red-400 transition-colors px-1 py-1 text-lg leading-none shrink-0"
                      aria-label="Remove link"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="url"
                    placeholder="PayPal URL — https://paypal.me/..."
                    value={link.url}
                    onChange={(e) => setConfig((c) => {
                      const links = [...c.links];
                      links[i] = { ...links[i], url: e.target.value };
                      return { ...c, links };
                    })}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                  <input
                    type="url"
                    placeholder="Image URL (optional) — https://..."
                    value={link.imageUrl ?? ""}
                    onChange={(e) => setConfig((c) => {
                      const links = [...c.links];
                      links[i] = { ...links[i], imageUrl: e.target.value || undefined };
                      return { ...c, links };
                    })}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Available from <span className="text-zinc-600">(leave blank = always)</span></p>
                      <input
                        type="datetime-local"
                        value={link.activeFrom ? link.activeFrom.slice(0, 16) : ""}
                        onChange={(e) => setConfig((c) => {
                          const links = [...c.links];
                          links[i] = { ...links[i], activeFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined };
                          return { ...c, links };
                        })}
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Available until <span className="text-zinc-600">(leave blank = no end)</span></p>
                      <input
                        type="datetime-local"
                        value={link.activeTo ? link.activeTo.slice(0, 16) : ""}
                        onChange={(e) => setConfig((c) => {
                          const links = [...c.links];
                          links[i] = { ...links[i], activeTo: e.target.value ? new Date(e.target.value).toISOString() : undefined };
                          return { ...c, links };
                        })}
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                      />
                    </div>
                  </div>
                  {(link.activeFrom || link.activeTo) && (
                    <p className="text-xs text-zinc-500">
                      Status: {(() => {
                        const now = new Date();
                        const from = link.activeFrom ? new Date(link.activeFrom) : null;
                        const to = link.activeTo ? new Date(link.activeTo) : null;
                        if (from && from > now) return <span className="text-amber-400">Scheduled — goes live {from.toLocaleString()}</span>;
                        if (to && to < now) return <span className="text-zinc-600">Expired {to.toLocaleString()}</span>;
                        return <span className="text-emerald-400">✓ Active</span>;
                      })()}
                    </p>
                  )}
                </div>
              ))}
            </div>
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
        </>
      )}
    </div>
  );
}
