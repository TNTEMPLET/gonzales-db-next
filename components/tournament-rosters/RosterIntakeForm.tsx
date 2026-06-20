"use client";

import { useMemo, useState } from "react";

import { parseRosterCsv, validateRosterPlayers, type RosterPlayerInput } from "@/lib/tournament-rosters/csv";

type Props = {
  token: string;
  teamName: string;
  ageGroup?: string | null;
  latestStatus?: string | null;
};

type SubmitState = "idle" | "submitting" | "submitted";

function blankPlayer(): RosterPlayerInput {
  return { firstName: "", lastName: "", jerseyNumber: "" };
}

export default function RosterIntakeForm({ token, teamName, ageGroup, latestStatus }: Props) {
  const [players, setPlayers] = useState<RosterPlayerInput[]>([blankPlayer(), blankPlayer(), blankPlayer()]);
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterPhone, setSubmitterPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"FORM" | "CSV">("FORM");
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const [rawCsv, setRawCsv] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [state, setState] = useState<SubmitState>("idle");

  const filledPlayers = useMemo(
    () => players.filter((p) => p.firstName.trim() || p.lastName.trim() || p.jerseyNumber.trim()),
    [players],
  );

  function updatePlayer(index: number, patch: Partial<RosterPlayerInput>) {
    setPlayers((prev) => prev.map((player, i) => (i === index ? { ...player, ...patch } : player)));
  }

  async function handleCsv(file: File) {
    const text = await file.text();
    const parsed = parseRosterCsv(text);
    setSource("CSV");
    setOriginalFilename(file.name);
    setRawCsv(text);
    setErrors(parsed.errors);
    if (parsed.players.length) {
      setPlayers(parsed.players);
    }
  }

  async function submitRoster() {
    const validation = validateRosterPlayers(players);
    if (validation.errors.length) {
      setErrors(validation.errors);
      return;
    }
    setErrors([]);
    setState("submitting");
    try {
      const res = await fetch(`/api/tournament-rosters/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          submitterName,
          submitterEmail,
          submitterPhone,
          notes,
          originalFilename,
          rawCsv,
          players: validation.players,
        }),
      });
      const json = (await res.json()) as { error?: string; errors?: string[] };
      if (!res.ok) throw new Error(json.errors?.join("\n") || json.error || "Roster submission failed.");
      setState("submitted");
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : String(err)]);
      setState("idle");
    }
  }

  if (state === "submitted") {
    return (
      <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-5 text-emerald-100">
        <h2 className="text-xl font-semibold">Roster submitted</h2>
        <p className="mt-2 text-sm text-emerald-100/80">
          Thank you. Your roster for {teamName} is pending District 2 review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 shadow-xl sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">District 2 Tournament Roster</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{teamName}</h1>
        {ageGroup ? <p className="mt-1 text-sm text-zinc-400">Division: {ageGroup}</p> : null}
        <p className="mt-3 rounded-xl border border-sky-900/60 bg-sky-950/30 px-3 py-2 text-sm text-sky-100/90">
          Upload a CSV if you have one, or enter players manually below. We only need first name, last name, and jersey number.
        </p>
        {latestStatus ? (
          <p className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
            Latest submission status: <span className="font-semibold text-zinc-200">{latestStatus}</span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm font-medium text-zinc-300">
          Your name
          <input value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:text-sm" autoComplete="name" />
        </label>
        <label className="block text-sm font-medium text-zinc-300">
          Email
          <input value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:text-sm" inputMode="email" autoComplete="email" />
        </label>
        <label className="block text-sm font-medium text-zinc-300">
          Phone
          <input value={submitterPhone} onChange={(e) => setSubmitterPhone(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:text-sm" inputMode="tel" autoComplete="tel" />
        </label>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4">
        <label className="block text-sm font-medium text-zinc-200">
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv,.tsv,text/tab-separated-values"
            className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCsv(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Accepted formats: First/Last/Jersey columns, Player or Name plus Jersey, or copied CSV/TSV rows from a spreadsheet.
        </p>
      </div>

      <div className="space-y-3">
        <div className="hidden grid-cols-[1fr_1fr_6rem_2.5rem] gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:grid">
          <span>First name</span>
          <span>Last name</span>
          <span>Jersey #</span>
          <span />
        </div>
        {players.map((player, index) => (
          <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 md:grid md:grid-cols-[1fr_1fr_6rem_2.5rem] md:gap-2 md:border-0 md:bg-transparent md:p-0">
            <div className="mb-3 flex items-center justify-between md:hidden">
              <p className="text-sm font-semibold text-zinc-200">Player {index + 1}</p>
              <button type="button" onClick={() => setPlayers((prev) => prev.filter((_, i) => i !== index))} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800" aria-label={`Remove player ${index + 1}`}>Remove</button>
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 md:contents">
              <span className="md:hidden">First name</span>
              <input value={player.firstName} onChange={(e) => updatePlayer(index, { firstName: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:mt-0 md:text-sm" autoComplete="given-name" />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500 md:contents">
              <span className="md:hidden">Last name</span>
              <input value={player.lastName} onChange={(e) => updatePlayer(index, { lastName: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:mt-0 md:text-sm" autoComplete="family-name" />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-zinc-500 md:contents">
              <span className="md:hidden">Jersey #</span>
              <input value={player.jerseyNumber} onChange={(e) => updatePlayer(index, { jerseyNumber: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:mt-0 md:text-sm" inputMode="numeric" pattern="[0-9A-Za-z-]*" autoComplete="off" />
            </label>
            <button type="button" onClick={() => setPlayers((prev) => prev.filter((_, i) => i !== index))} className="hidden rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:bg-zinc-800 md:block" aria-label={`Remove row ${index + 1}`}>X</button>
          </div>
        ))}
        <button type="button" onClick={() => setPlayers((prev) => [...prev, blankPlayer()])} className="min-h-11 w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 sm:w-auto">
          Add player row
        </button>
      </div>

      <label className="block text-sm text-zinc-300">
        Notes for District 2
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white md:text-sm" />
      </label>

      {errors.length ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
          {errors.map((error, idx) => <p key={idx}>{error}</p>)}
        </div>
      ) : null}

      <div className="space-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
        <button type="button" disabled={state === "submitting" || filledPlayers.length === 0} onClick={() => void submitRoster()} className="min-h-11 w-full rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-40 sm:w-auto">
          {state === "submitting" ? "Submitting..." : "Submit roster for review"}
        </button>
        <p className="text-xs leading-relaxed text-zinc-500">No login required. This private link is tied to {teamName}.</p>
      </div>
    </div>
  );
}
