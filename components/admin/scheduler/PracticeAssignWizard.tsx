"use client";

import { useEffect, useMemo, useState } from "react";

import { assignmentsFromBoard, type PracticeBoardCell } from "@/lib/scheduler/practiceBoard";

type WizardField = { id: string; parkId: string; parkName: string; name: string };
type WizardTeam = { teamId: string; teamName: string };

const DAY_OPTIONS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
] as const;

const TIMES = ["17:45", "18:00", "18:30", "19:15"];

function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  return `${((hours + 11) % 12) + 1}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function cellKey(week: number, fieldId: string, day: number, time: string) {
  return `${week}|${fieldId}|${day}|${time}`;
}

export default function PracticeAssignWizard({
  orgQuery,
  seasonYear,
  fields,
  divisions,
  initialAgeGroup,
  onClose,
  onApplied,
}: {
  orgQuery: string;
  seasonYear: number;
  fields: WizardField[];
  divisions: { ageGroup: string; teamCount: number }[];
  initialAgeGroup: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [ageGroup, setAgeGroup] = useState(initialAgeGroup || divisions[0]?.ageGroup || "");
  const [days, setDays] = useState<number[]>([2, 4]);
  const [times, setTimes] = useState<string[]>(["17:45", "19:15"]);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [cycleWeeks, setCycleWeeks] = useState(1);
  const [week, setWeek] = useState(1);
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<WizardTeam[]>([]);
  const [cells, setCells] = useState<Record<string, { firstTeamId: string; secondTeamId: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ageGroup) return;
    const params = new URLSearchParams(orgQuery);
    params.set("seasonYear", String(seasonYear));
    params.set("ageGroup", ageGroup);
    void fetch(`/api/admin/scheduler/practice-slots?${params}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        const next = Array.isArray(json.teams)
          ? json.teams.map((row: { teamId: string; teamName: string }) => ({
              teamId: row.teamId,
              teamName: row.teamName,
            }))
          : [];
        setTeams(next);
      })
      .catch(() => setTeams([]));
  }, [ageGroup, orgQuery, seasonYear]);

  const selectedFields = useMemo(
    () => fields.filter((field) => fieldIds.includes(field.id)),
    [fields, fieldIds],
  );

  const boardCells: PracticeBoardCell[] = useMemo(() => {
    const list: PracticeBoardCell[] = [];
    for (const [key, value] of Object.entries(cells)) {
      if (!value.firstTeamId) continue;
      const [cycleWeek, fieldId, day, time] = key.split("|");
      const field = fields.find((item) => item.id === fieldId);
      if (!field) continue;
      list.push({
        cycleWeek: Number(cycleWeek),
        fieldId,
        parkId: field.parkId,
        dayOfWeek: Number(day),
        startTime: time,
        firstTeamId: value.firstTeamId,
        secondTeamId: value.secondTeamId,
      });
    }
    return list;
  }, [cells, fields]);

  const preview = assignmentsFromBoard(boardCells, durationMinutes, cycleWeeks);
  const placedIds = new Set(preview.flatMap((row) => [row.teamId, row.pairWithTeamId].filter(Boolean) as string[]));
  const unplaced = teams.filter((team) => !placedIds.has(team.teamId));

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort()));
  }

  function toggleField(id: string) {
    setFieldIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function updateCell(key: string, patch: Partial<{ firstTeamId: string; secondTeamId: string }>) {
    setCells((current) => {
      const prev = current[key] ?? { firstTeamId: "", secondTeamId: "" };
      const next = { ...prev, ...patch };
      if (!next.firstTeamId) return { ...current, [key]: { firstTeamId: "", secondTeamId: "" } };
      return { ...current, [key]: next };
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(orgQuery);
      const organizationId = params.get("org") || "";
      const response = await fetch("/api/admin/scheduler/practice-slots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          seasonYear,
          ageGroup,
          durationMinutes,
          cycleWeeks,
          cells: boardCells,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(json.error || "Failed to save practice board"));
      onApplied();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save practice board");
    } finally {
      setBusy(false);
    }
  }

  const parks = [...new Map(fields.map((field) => [field.parkId, field.parkName])).entries()];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-20">
      <div className="w-full max-w-6xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-red-200">Practice assignment wizard</p>
            <h3 className="mt-1 text-xl font-semibold text-white">Place teams on fields and nights</h3>
            <p className="mt-1 text-sm text-zinc-400">
              No spreadsheet. Pick nights and fields, drop one or two teams in a cell. Two teams share the field — first
              listed goes first for {durationMinutes} minutes, then they swap. A 3-week cycle stores Week 1 / 2 / 3 on
              the coach plan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            Close
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          {["Setup", "Place teams", "Review"].map((label, index) => {
            const n = (index + 1) as 1 | 2 | 3;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(n)}
                className={`rounded-xl border px-3 py-1.5 ${
                  step === n ? "border-red-500/60 bg-red-500/10 text-red-100" : "border-zinc-700 text-zinc-300"
                }`}
              >
                {n}. {label}
              </button>
            );
          })}
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        {step === 1 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-zinc-300">
              Division
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                {divisions.map((row) => (
                  <option key={row.ageGroup} value={row.ageGroup}>
                    {row.ageGroup} ({row.teamCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-zinc-300">
              Duration (swap length)
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                {[45, 60, 75, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="text-sm text-zinc-300">Nights</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAY_OPTIONS.map((day) => (
                  <button
                    key={day.day}
                    type="button"
                    onClick={() => toggleDay(day.day)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                      days.includes(day.day)
                        ? "border-red-500/60 bg-red-500/10 text-red-100"
                        : "border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm text-zinc-300">Slot clocks</p>
              <div className="mt-2 flex gap-2">
                {times.map((time, index) => (
                  <select
                    key={index}
                    value={time}
                    onChange={(e) =>
                      setTimes((current) => current.map((item, i) => (i === index ? e.target.value : item)))
                    }
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  >
                    {TIMES.map((option) => (
                      <option key={option} value={option}>
                        {formatClock(option)}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
            <label className="block text-sm text-zinc-300">
              Rotation
              <select
                value={cycleWeeks}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setCycleWeeks(next);
                  setWeek(1);
                }}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value={1}>Same every week</option>
                <option value={3}>3-week cycle (12U-style)</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <p className="text-sm text-zinc-300">Fields on this board</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {parks.map(([parkId, parkName]) => (
                  <div key={parkId} className="rounded-xl border border-zinc-800 p-2">
                    <p className="text-xs font-semibold text-zinc-400">{parkName}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {fields
                        .filter((field) => field.parkId === parkId)
                        .map((field) => (
                          <button
                            key={field.id}
                            type="button"
                            onClick={() => toggleField(field.id)}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                              fieldIds.includes(field.id)
                                ? "border-red-500/60 bg-red-500/10 text-red-100"
                                : "border-zinc-700 text-zinc-400"
                            }`}
                          >
                            {field.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 space-y-3">
            {cycleWeeks > 1 ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: cycleWeeks }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWeek(n)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                      week === n ? "border-red-500/60 bg-red-500/10 text-red-100" : "border-zinc-700 text-zinc-300"
                    }`}
                  >
                    Week {n}
                  </button>
                ))}
              </div>
            ) : null}
            {!selectedFields.length || !days.length ? (
              <p className="text-sm text-zinc-500">Pick at least one night and one field in Setup.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                <table className="min-w-[720px] w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-900 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    <tr>
                      <th className="p-2">Field</th>
                      {days.map((day) =>
                        times.map((time) => (
                          <th key={`${day}-${time}`} className="p-2">
                            {DAY_OPTIONS.find((item) => item.day === day)?.label} {formatClock(time)}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFields.map((field) => (
                      <tr key={field.id} className="border-t border-zinc-800">
                        <td className="p-2 font-semibold text-white">
                          {field.name}
                          <div className="text-[10px] font-normal text-zinc-500">{field.parkName}</div>
                        </td>
                        {days.map((day) =>
                          times.map((time) => {
                            const key = cellKey(week, field.id, day, time);
                            const cell = cells[key] ?? { firstTeamId: "", secondTeamId: "" };
                            return (
                              <td key={key} className="p-1 align-top">
                                <select
                                  value={cell.firstTeamId}
                                  onChange={(e) => updateCell(key, { firstTeamId: e.target.value, secondTeamId: e.target.value ? cell.secondTeamId : "" })}
                                  className="mb-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-1 py-1 text-[11px] text-white"
                                >
                                  <option value="">—</option>
                                  {teams.map((team) => (
                                    <option key={team.teamId} value={team.teamId}>
                                      {team.teamName}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={cell.secondTeamId}
                                  disabled={!cell.firstTeamId}
                                  onChange={(e) => updateCell(key, { secondTeamId: e.target.value })}
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-1 py-1 text-[11px] text-white disabled:opacity-40"
                                >
                                  <option value="">solo</option>
                                  {teams
                                    .filter((team) => team.teamId !== cell.firstTeamId)
                                    .map((team) => (
                                      <option key={team.teamId} value={team.teamId}>
                                        {team.teamName}
                                      </option>
                                    ))}
                                </select>
                              </td>
                            );
                          }),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-zinc-500">
              {placedIds.size} of {teams.length} teams placed
              {unplaced.length ? ` · still open: ${unplaced.map((team) => team.teamName).join(", ")}` : ""}
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4">
            <p className="text-sm text-zinc-400">
              Saving replaces every practice slot for {ageGroup || "this division"}. Coach Corner plans update
              immediately.
            </p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="min-w-[640px] w-full text-left text-sm text-zinc-300">
                <thead className="bg-zinc-900 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  <tr>
                    <th className="p-2">Team</th>
                    <th className="p-2">When</th>
                    <th className="p-2">Where</th>
                    <th className="p-2">Pair</th>
                    <th className="p-2">Week</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => {
                    const team = teams.find((item) => item.teamId === row.teamId);
                    const pair = teams.find((item) => item.teamId === row.pairWithTeamId);
                    const field = fields.find((item) => item.id === row.fieldId);
                    return (
                      <tr key={`${row.teamId}-${index}`} className="border-t border-zinc-800">
                        <td className="p-2 text-white">{team?.teamName ?? row.teamId}</td>
                        <td className="p-2">
                          {DAY_OPTIONS.find((item) => item.day === row.dayOfWeek)?.label} {formatClock(row.startTime)}
                        </td>
                        <td className="p-2">{field ? `${field.parkName} · ${field.name}` : "—"}</td>
                        <td className="p-2">{pair?.teamName ?? "—"}</td>
                        <td className="p-2">{row.notes ?? "Every week"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {unplaced.length ? (
              <p className="mt-2 text-sm text-amber-200">Unassigned: {unplaced.map((team) => team.teamName).join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => (current === 3 ? 2 : 1))}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-red-400"
            >
              Back
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((current) => (current === 1 ? 2 : 3))}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !ageGroup}
              onClick={() => void save()}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save assignments"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
