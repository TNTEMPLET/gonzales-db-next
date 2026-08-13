"use client";

import { useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";
import { toDatetimeLocalInput } from "@/lib/registrationWindowFormat";

type WindowPayload = {
  organizationId: ContentOrgId;
  startLocal: string;
  endLocal: string;
  source: "database" | "default";
  isOpenNow: boolean;
  defaults: { startLocal: string; endLocal: string };
  timezone: string;
  updatedAt?: string;
};

type Props = {
  organizationId: ContentOrgId;
  initial?: WindowPayload;
};

export default function AdminRegistrationWindowsManager({
  organizationId,
  initial,
}: Props) {
  const fallback: WindowPayload = initial || {
    organizationId,
    startLocal: toDatetimeLocalInput(new Date().toISOString()),
    endLocal: toDatetimeLocalInput(new Date(Date.now() + 30 * 86400000).toISOString()),
    source: "default",
    isOpenNow: true,
    defaults: {
      startLocal: toDatetimeLocalInput(new Date().toISOString()),
      endLocal: toDatetimeLocalInput(new Date(Date.now() + 30 * 86400000).toISOString()),
    },
    updatedAt: undefined,
  };
  const [startLocal, setStartLocal] = useState(fallback.startLocal);
  const [endLocal, setEndLocal] = useState(fallback.endLocal);
  const [source, setSource] = useState(fallback.source);
  const [isOpenNow, setIsOpenNow] = useState(fallback.isOpenNow);
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    fallback.updatedAt ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(payload: {
    startLocal?: string;
    endLocal?: string;
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
          resetToDefaults: payload.resetToDefaults ?? false,
        }),
      });
      const json = (await res.json()) as { data?: WindowPayload; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (!json.data) throw new Error("Empty response");
      setStartLocal(json.data.startLocal);
      setEndLocal(json.data.endLocal);
      setSource(json.data.source);
      setIsOpenNow(json.data.isOpenNow);
      setUpdatedAt(
        json.data.updatedAt
          ? new Date(json.data.updatedAt).toLocaleString()
          : new Date().toLocaleString(),
      );
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

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border p-4 sm:p-5 ${
          isOpenNow
            ? "border-emerald-700/50 bg-emerald-950/30"
            : "border-amber-700/40 bg-amber-950/20"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Live status (America/Chicago)
        </p>
        <p
          className={`mt-1 text-xl font-bold ${
            isOpenNow ? "text-emerald-400" : "text-amber-300"
          }`}
        >
          {isOpenNow ? "Registration is OPEN right now" : "Registration is CLOSED right now"}
        </p>
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
        <h2 className="text-lg font-semibold text-white">Open window</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Times are <strong className="text-zinc-200">America/Chicago</strong> wall
          clock (Central). Inclusive start and end. Applies to the public site CTAs,
          header Register button, and registration page for{" "}
          <code className="text-xs text-zinc-300">{organizationId}</code>.
        </p>

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
            {initial.defaults.startLocal} → {initial.defaults.endLocal}
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
            disabled={saving}
            onClick={() => save({})}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-purple-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save window"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setStartLocal(initial.defaults.startLocal);
              setEndLocal(initial.defaults.endLocal);
              void save({
                startLocal: initial.defaults.startLocal,
                endLocal: initial.defaults.endLocal,
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
