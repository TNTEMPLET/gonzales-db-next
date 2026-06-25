"use client";

import { FormEvent, useState } from "react";

type RolePreference = "HEAD_COACH" | "ASSISTANT_COACH" | "EITHER";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  cellPhone: string;
  interestedDivision: string;
  rolePreference: RolePreference;
  hasCoachedBefore: "yes" | "no";
  priorDivision: string;
  notes: string;
};

const initialState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  cellPhone: "",
  interestedDivision: "",
  rolePreference: "EITHER",
  hasCoachedBefore: "no",
  priorDivision: "",
  notes: "",
};

function inputClassName(hasError = false) {
  return [
    "mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition",
    "focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20",
    hasError ? "border-red-400" : "border-zinc-300",
  ].join(" ");
}

export default function CoachingInterestForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    setSubmitted(false);
    try {
      const response = await fetch("/api/coaching-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          cellPhone: form.cellPhone,
          interestedDivision: form.interestedDivision,
          rolePreference: form.rolePreference,
          hasCoachedBefore: form.hasCoachedBefore === "yes",
          priorDivision: form.priorDivision,
          notes: form.notes,
        }),
      });
      const json = (await response.json()) as { error?: string; errors?: string[] };
      if (!response.ok) {
        setErrors(json.errors?.length ? json.errors : [json.error || "Unable to submit coaching interest."]);
        return;
      }
      setSubmitted(true);
      setForm(initialState);
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : "Unable to submit coaching interest."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/60">
      {submitted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Thanks for raising your hand. We saved your coaching interest and will use this list for registration and next-step communications.
        </div>
      ) : null}

      {errors.length ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Please fix the following:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800">
          First name
          <input
            required
            autoComplete="given-name"
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            className={inputClassName()}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Last name
          <input
            required
            autoComplete="family-name"
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            className={inputClassName()}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800">
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            className={inputClassName()}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Cell phone
          <input
            required
            type="tel"
            autoComplete="tel"
            value={form.cellPhone}
            onChange={(event) => update("cellPhone", event.target.value)}
            className={inputClassName()}
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-zinc-800">
        Age group or division interest
        <input
          required
          value={form.interestedDivision}
          onChange={(event) => update("interestedDivision", event.target.value)}
          placeholder="Example: 8U, 10U DYB / Minors, 10U LLB / Majors"
          className={inputClassName()}
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-800">Coaching preference</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {[
            ["HEAD_COACH", "Head Coach"],
            ["ASSISTANT_COACH", "Assistant Coach"],
            ["EITHER", "Either"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <input
                type="radio"
                name="rolePreference"
                value={value}
                checked={form.rolePreference === value}
                onChange={() => update("rolePreference", value as RolePreference)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-800">Have you coached with AP Baseball before?</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ["yes", "Yes"],
            ["no", "No"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <input
                type="radio"
                name="hasCoachedBefore"
                value={value}
                checked={form.hasCoachedBefore === value}
                onChange={() => update("hasCoachedBefore", value as "yes" | "no")}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-medium text-zinc-800">
        Prior division
        <input
          required={form.hasCoachedBefore === "yes"}
          value={form.priorDivision}
          onChange={(event) => update("priorDivision", event.target.value)}
          placeholder="Example: 10U DYB / Minors, 10U LLB / Majors"
          className={inputClassName()}
        />
      </label>

      <label className="block text-sm font-medium text-zinc-800">
        Notes for the league
        <textarea
          rows={4}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Optional: scheduling limits, preferred assistant coach, previous teams, etc."
          className={inputClassName()}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand-purple px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Submitting..." : "Submit Coaching Interest"}
      </button>
    </form>
  );
}
