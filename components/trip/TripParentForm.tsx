"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TripAnswers, TripFieldDefPublic } from "@/lib/trip/types";

type LoadPayload = {
  event: {
    name: string;
    teamLabel: string | null;
    status: string;
    introMarkdown: string | null;
    organizationId: string;
  };
  participant: {
    playerFullName: string;
    ageGroup: string | null;
    team: string | null;
    jerseyNumber: string | null;
    status: string;
  };
  fields: TripFieldDefPublic[];
  answers: TripAnswers;
  submittedAt: string | null;
  error?: string;
};

export default function TripParentForm({ token }: { token: string }) {
  const [data, setData] = useState<LoadPayload | null>(null);
  const [answers, setAnswers] = useState<TripAnswers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip/${encodeURIComponent(token)}`);
      const json = (await res.json()) as LoadPayload;
      if (!res.ok) throw new Error(json.error || "Link not found");
      setData(json);
      setAnswers(json.answers ?? {});
      if (json.participant.status === "submitted") setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load form");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setSavedDraft(false);
  }

  const rosterFields = useMemo(
    () => (data?.fields ?? []).filter((f) => (f.section ?? "roster") === "roster"),
    [data?.fields],
  );
  const healthFields = useMemo(
    () => (data?.fields ?? []).filter((f) => f.section === "health"),
    [data?.fields],
  );

  async function submit(asDraft: boolean) {
    setSaving(true);
    setError(null);
    setFieldErrors([]);
    setSavedDraft(false);
    try {
      const res = await fetch(`/api/trip/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, asDraft }),
      });
      const json = (await res.json()) as {
        error?: string;
        errors?: string[];
        status?: string;
      };
      if (!res.ok) {
        if (json.errors?.length) setFieldErrors(json.errors);
        throw new Error(json.error || "Submit failed");
      }
      if (asDraft) {
        setSavedDraft(true);
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-center text-sm text-zinc-500 py-12">Loading form…</p>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-800/50 bg-red-950/20 p-6 text-center">
        <p className="text-red-200 font-medium">{error}</p>
        <p className="mt-2 text-sm text-zinc-500">
          Check the link from your league admin, or ask them to resend it.
        </p>
      </div>
    );
  }

  if (!data) return null;

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-8 text-center">
        <p className="text-2xl font-bold text-emerald-200">Thank you!</p>
        <p className="mt-2 text-zinc-300">
          Travel info for{" "}
          <span className="font-semibold text-white">
            {String(answers.first_name || "")} {String(answers.last_name || "")}
          </span>{" "}
          was submitted.
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          You can close this page. Contact your league if you need to make a
          change.
        </p>
      </div>
    );
  }

  const closed = data.event.status === "closed" || data.event.status === "draft";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[2px] text-amber-500/90">
          Travel roster
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {data.event.name}
        </h1>
        {data.event.teamLabel && (
          <p className="text-zinc-400">{data.event.teamLabel}</p>
        )}
        {data.event.introMarkdown && (
          <p className="text-sm text-zinc-400 whitespace-pre-wrap">
            {data.event.introMarkdown}
          </p>
        )}
        <p className="text-sm text-zinc-500">
          Player on file:{" "}
          <span className="text-zinc-300">{data.participant.playerFullName}</span>
        </p>
      </header>

      {closed && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          This form is not accepting submissions right now (
          {data.event.status}).
        </div>
      )}

      {fieldErrors.length > 0 && (
        <ul className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-200 list-disc list-inside">
          {fieldErrors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      {error && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {savedDraft && (
        <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 px-4 py-3 text-sm text-sky-100">
          Draft saved. You can come back to this link anytime.
        </div>
      )}

      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <section className="space-y-5">
          <div className="border-b border-zinc-800 pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Section 1–2 · Roster &amp; contacts
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Required fields are used for the tournament director roster export.
            </p>
          </div>
          {rosterFields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={answers[f.key]}
              onChange={(v) => setField(f.key, v)}
              disabled={closed || saving}
            />
          ))}
        </section>

        {healthFields.length > 0 && (
          <section className="space-y-5 rounded-2xl border border-rose-900/40 bg-rose-950/10 p-4 sm:p-5">
            <div className="border-b border-rose-900/30 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-100/90">
                Section 3 of 3 · Health and allergy information
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Information needed for travel consideration. Shared with league
                admins and coaching staff only — not sent on the tournament
                director roster export. Optional; you may submit roster info
                first and return later to add health details.
              </p>
            </div>
            {healthFields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={answers[f.key]}
                onChange={(v) => setField(f.key, v)}
                disabled={closed || saving}
              />
            ))}
          </section>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={closed || saving}
            className="rounded-xl border border-amber-500/50 bg-amber-600 px-5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Submit"}
          </button>
          <button
            type="button"
            disabled={closed || saving}
            onClick={() => void submit(true)}
            className="rounded-xl border border-zinc-600 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          >
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: TripFieldDefPublic;
  value: string | boolean | number | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const str = value == null ? "" : String(value);
  const base =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/50 focus:outline-none disabled:opacity-60";

  return (
    <label className="block">
      <span className="mb-1.5 flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium text-zinc-200">{field.label}</span>
        {field.required && (
          <span className="text-xs text-amber-500/80">Required</span>
        )}
      </span>
      {field.helpText && (
        <span className="mb-1.5 block text-xs text-zinc-500">{field.helpText}</span>
      )}
      {field.fieldType === "select" ? (
        <select
          className={base}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="">Select…</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.fieldType === "textarea" ? (
        <textarea
          className={base}
          rows={3}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      ) : (
        <input
          type={
            field.fieldType === "email"
              ? "email"
              : field.fieldType === "phone"
                ? "tel"
                : field.fieldType === "number"
                  ? "number"
                  : "text"
          }
          className={base}
          value={str}
          disabled={disabled || field.fieldType === "readonly"}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          readOnly={field.fieldType === "readonly"}
        />
      )}
    </label>
  );
}
