"use client";

import { useEffect, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";
import { toDatetimeLocalInput } from "@/lib/registrationWindowFormat";
import type {
  RegistrationModeSetting,
  RegistrationStatus,
} from "@/lib/registrationStatus";

type WindowPayload = {
  organizationId: ContentOrgId;
  startLocal: string;
  endLocal: string;
  mode: RegistrationModeSetting;
  source: "database" | "default";
  isOpenNow: boolean;
  status: RegistrationStatus;
  defaults: { startLocal: string; endLocal: string; mode: RegistrationModeSetting };
  timezone: string;
  updatedAt?: string;
};

type Props = {
  organizationId: ContentOrgId;
  initial?: WindowPayload;
};

const MODE_OPTIONS: {
  value: RegistrationModeSetting;
  label: string;
  description: string;
}[] = [
  {
    value: "OPEN",
    label: "Open",
    description: "Registration is open right now, regardless of the window dates below.",
  },
  {
    value: "WAITLIST",
    label: "Waitlist Only",
    description:
      "Regular registration stays closed; public CTAs switch to “Join the Waitlist.”",
  },
  {
    value: "CLOSED",
    label: "Closed",
    description: "Hide registration CTAs everywhere and show a closed message.",
  },
  {
    value: "AUTO_SCHEDULED",
    label: "Scheduled Window",
    description: "Follow the Opens/Closes dates below automatically.",
  },
];

const STATUS_META: Record<
  RegistrationStatus,
  { label: string; border: string; bg: string; text: string }
> = {
  OPEN: {
    label: "Registration is OPEN right now",
    border: "border-emerald-700/50",
    bg: "bg-emerald-950/30",
    text: "text-emerald-400",
  },
  WAITLIST: {
    label: "Waitlist is OPEN right now",
    border: "border-brand-gold/50",
    bg: "bg-brand-gold/10",
    text: "text-brand-gold",
  },
  CLOSED: {
    label: "Registration is CLOSED right now",
    border: "border-amber-700/40",
    bg: "bg-amber-950/20",
    text: "text-amber-300",
  },
};

export default function AdminRegistrationWindowsManager({
  organizationId,
  initial,
}: Props) {
  // Lazy initializers only: Date.now() must not run in the render body itself.
  function placeholderDefaults() {
    return {
      startLocal: toDatetimeLocalInput(new Date().toISOString()),
      endLocal: toDatetimeLocalInput(new Date(Date.now() + 30 * 86400000).toISOString()),
      mode: "AUTO_SCHEDULED" as RegistrationModeSetting,
    };
  }

  const [startLocal, setStartLocal] = useState(
    () => initial?.startLocal ?? placeholderDefaults().startLocal,
  );
  const [endLocal, setEndLocal] = useState(
    () => initial?.endLocal ?? placeholderDefaults().endLocal,
  );
  const [mode, setModeState] = useState<RegistrationModeSetting>(
    () => initial?.mode ?? "AUTO_SCHEDULED",
  );
  const [status, setStatus] = useState<RegistrationStatus>(
    () => initial?.status ?? "OPEN",
  );
  const [source, setSource] = useState<"database" | "default">(
    () => initial?.source ?? "default",
  );
  const [defaults, setDefaults] = useState(
    () => initial?.defaults ?? placeholderDefaults(),
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(() =>
    initial?.updatedAt ? new Date(initial.updatedAt).toLocaleString() : null,
  );
  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyPayload(data: WindowPayload) {
    setStartLocal(data.startLocal);
    setEndLocal(data.endLocal);
    setModeState(data.mode);
    setStatus(data.status);
    setSource(data.source);
    setDefaults(data.defaults);
    setUpdatedAt(
      data.updatedAt ? new Date(data.updatedAt).toLocaleString() : new Date().toLocaleString(),
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/registration-windows?org=${encodeURIComponent(organizationId)}`,
        );
        const json = (await res.json()) as { data?: WindowPayload; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        if (!json.data || cancelled) return;
        applyPayload(json.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  async function save(payload: {
    startLocal?: string;
    endLocal?: string;
    mode?: RegistrationModeSetting;
    resetToDefaults?: boolean;
  }) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/registration-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          startLocal: payload.startLocal ?? startLocal,
          endLocal: payload.endLocal ?? endLocal,
          ...(payload.mode !== undefined ? { mode: payload.mode } : {}),
          resetToDefaults: payload.resetToDefaults ?? false,
        }),
      });
      const json = (await res.json()) as { data?: WindowPayload; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (!json.data) throw new Error("Empty response");
      applyPayload(json.data);
      setMessage(
        payload.resetToDefaults
          ? "Reset to code defaults and saved."
          : "Registration window saved. Public sites pick this up on the next request.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function selectMode(nextMode: RegistrationModeSetting) {
    if (nextMode === mode) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Mode-only save: omit dates so the API preserves the current window.
      const res = await fetch("/api/admin/registration-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, mode: nextMode }),
      });
      const json = (await res.json()) as { data?: WindowPayload; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (!json.data) throw new Error("Empty response");
      applyPayload(json.data);
      const label = MODE_OPTIONS.find((o) => o.value === nextMode)?.label ?? nextMode;
      setMessage(`Mode set to "${label}" and saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const statusMeta = STATUS_META[status];

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border p-4 sm:p-5 ${statusMeta.border} ${statusMeta.bg}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Live status (America/Chicago) {loading ? "· loading…" : ""}
        </p>
        <p className={`mt-1 text-xl font-bold ${statusMeta.text}`}>{statusMeta.label}</p>
        <p className="mt-2 text-sm text-zinc-400">
          Source:{" "}
          <span className="font-medium text-zinc-200">
            {source === "database" ? "Saved in database (Master Admin)" : "Code defaults (not saved yet)"}
          </span>
          {updatedAt ? (
            <span className="text-zinc-500"> · last saved {updatedAt}</span>
          ) : null}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Registration mode</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Overrides the scheduled window for{" "}
          <code className="text-xs text-zinc-300">{organizationId}</code>. Applies to the
          public site CTAs, header Register button, and registration page.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={saving || loading}
                onClick={() => void selectMode(opt.value)}
                title={opt.description}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition disabled:opacity-60 ${
                  active
                    ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                    : "border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {opt.label}
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Scheduled window</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Times are <strong className="text-zinc-200">America/Chicago</strong> wall
          clock (Central). Inclusive start and end. Only takes effect while mode is{" "}
          <strong className="text-zinc-200">Scheduled Window</strong>.
        </p>
        {mode !== "AUTO_SCHEDULED" ? (
          <p className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
            Mode is currently <strong className="text-zinc-200">{MODE_OPTIONS.find((o) => o.value === mode)?.label}</strong>,
            so these dates are inactive. Switch to Scheduled Window to use them.
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Opens (Central)
            </span>
            <input
              type="datetime-local"
              value={toDatetimeLocalInput(startLocal)}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white outline-none focus:border-brand-gold"
            />
            <span className="block text-xs text-zinc-500">{startLocal}</span>
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Closes (Central)
            </span>
            <input
              type="datetime-local"
              value={toDatetimeLocalInput(endLocal)}
              onChange={(e) => setEndLocal(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-white outline-none focus:border-brand-gold"
            />
            <span className="block text-xs text-zinc-500">{endLocal}</span>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-500">
          Code defaults for this org:{" "}
          <code className="text-zinc-300">
            {defaults.startLocal} → {defaults.endLocal} ({defaults.mode})
          </code>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save({})}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-purple-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save window"}
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => {
              setStartLocal(defaults.startLocal);
              setEndLocal(defaults.endLocal);
              void save({
                startLocal: defaults.startLocal,
                endLocal: defaults.endLocal,
                resetToDefaults: true,
              });
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-600 px-6 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-brand-gold hover:text-brand-gold disabled:opacity-60"
          >
            Reset to defaults &amp; save
          </button>
        </div>
      </div>
    </div>
  );
}
