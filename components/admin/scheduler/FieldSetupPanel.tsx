"use client";

import { useEffect, useMemo, useState } from "react";

import {
  divisionsUsedInWeek,
  emptyFieldWeek,
  FIELD_BOARD_DAYS,
  parseCellDivisions,
  parseFieldWeek,
  resolveSharedSlotTime,
  serializeCellDivisions,
  toggleCellDivision,
  type FieldWeek,
} from "@/lib/admin/fieldBoardWeek";
import { getTeamsManagementAgeGroupDefaults } from "@/lib/admin/teamsImportHelpers";
import { type DivisionSlotTimes } from "@/lib/admin/divisionSlotTimes";
import type { ContentOrgId } from "@/lib/siteConfig";

type Field = {
  id: string;
  parkId: string;
  name: string;
  shortName: string | null;
  supportedDivisions: unknown;
  fieldMetadata: unknown;
  isActive: boolean;
};

type Availability = {
  id: string;
  seasonId: string | null;
  parkId: string;
  fieldId: string | null;
  availabilityType: "AVAILABLE" | "BLACKOUT";
  date: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
};

type Park = {
  id: string;
  name: string;
  shortName: string | null;
  fields: Field[];
  availabilities: Availability[];
};

function formatSlotLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours)) return hhmm || "Select time";
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes || 0).padStart(2, "0")} ${suffix}`;
}

type FieldPlan = {
  slotTimes: [string, string];
  week: FieldWeek;
};

function readFieldPlan(field: Field, seasonTimes: string[], availabilities: Availability[]): FieldPlan {
  const meta =
    field.fieldMetadata && typeof field.fieldMetadata === "object"
      ? (field.fieldMetadata as Record<string, unknown>)
      : {};
  const slotTimesRaw = Array.isArray(meta.slotTimes)
    ? meta.slotTimes.filter((time): time is string => typeof time === "string")
    : [];
  const slotTimes: [string, string] = [
    slotTimesRaw[0] || seasonTimes[0] || "",
    slotTimesRaw[1] || seasonTimes[1] || seasonTimes[0] || "",
  ];
  const metaWeek = meta.week && typeof meta.week === "object" ? meta.week : null;
  if (metaWeek) return { slotTimes, week: parseFieldWeek(metaWeek) };

  const week = emptyFieldWeek();
  for (const slot of availabilities) {
    if (slot.fieldId !== field.id || slot.availabilityType !== "AVAILABLE" || slot.dayOfWeek == null || !slot.startTime) {
      continue;
    }
    if (!FIELD_BOARD_DAYS.some((day) => day.dayOfWeek === slot.dayOfWeek)) continue;
    const slotIndex = slot.startTime === slotTimes[1] ? 1 : 0;
    week[slot.dayOfWeek][slotIndex] = parseCellDivisions(slot.notes);
  }
  return { slotTimes, week };
}

export default function FieldSetupPanel({
  targetOrg,
  orgQuery,
  parks,
  selectedSeasonId,
  seasonTimes,
  divisionSlotTimes,
  busy,
  onBusy,
  onNotice,
  onError,
  onRefresh,
}: {
  targetOrg: ContentOrgId;
  orgQuery: string;
  parks: Park[];
  selectedSeasonId: string;
  seasonTimes: string[];
  divisionSlotTimes: DivisionSlotTimes;
  busy: boolean;
  onBusy: (next: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const divisionOptions = useMemo(() => getTeamsManagementAgeGroupDefaults(targetOrg), [targetOrg]);
  const [parkName, setParkName] = useState("");
  const [parkShortName, setParkShortName] = useState("");
  const [newFieldNames, setNewFieldNames] = useState<string[]>(["Field 1", "Field 2"]);
  const [extraFieldName, setExtraFieldName] = useState("");
  const [selectedParkId, setSelectedParkId] = useState("");
  const [plans, setPlans] = useState<Record<string, FieldPlan>>({});

  const selectedPark = parks.find((park) => park.id === selectedParkId) ?? parks[0] ?? null;
  const parkHydrateKey = parks
    .map(
      (park) =>
        `${park.id}:${park.fields.map((field) => field.id).join(",")}:${park.availabilities.map((slot) => slot.id).join(",")}`,
    )
    .join("|") + `:${seasonTimes.join("|")}`;

  useEffect(() => {
    if (!selectedParkId && parks[0]) setSelectedParkId(parks[0].id);
  }, [parks, selectedParkId]);

  useEffect(() => {
    const next: Record<string, FieldPlan> = {};
    for (const park of parks) {
      for (const field of park.fields) {
        next[field.id] = readFieldPlan(field, seasonTimes, park.availabilities);
      }
    }
    setPlans(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkHydrateKey]);

  async function request(path: string, init?: RequestInit) {
    const joiner = path.includes("?") ? "&" : "?";
    const response = await fetch(`${path}${joiner}${orgQuery}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Request failed"));
    return json;
  }

  function updatePlan(fieldId: string, patch: Partial<FieldPlan>) {
    setPlans((current) => ({
      ...current,
      [fieldId]: { ...current[fieldId], ...patch },
    }));
  }

  function toggleCell(fieldId: string, dayOfWeek: number, slotIndex: 0 | 1, division: string) {
    setPlans((current) => {
      const plan = current[fieldId];
      if (!plan) return current;
      const day = plan.week[dayOfWeek];
      const nextCell = toggleCellDivision(day[slotIndex], division);
      const nextDay: [string[], string[]] = slotIndex === 0 ? [nextCell, [...day[1]]] : [[...day[0]], nextCell];
      return {
        ...current,
        [fieldId]: { ...plan, week: { ...plan.week, [dayOfWeek]: nextDay } },
      };
    });
  }

  async function createParkWithFields() {
    const fieldNames = newFieldNames.map((name) => name.trim()).filter(Boolean);
    if (!parkName.trim() || fieldNames.length === 0) {
      onError("Park name and at least one field are required.");
      return;
    }
    onBusy(true);
    onError("");
    try {
      const json = (await request("/api/admin/scheduler/parks", {
        method: "POST",
        body: JSON.stringify({
          name: parkName.trim(),
          shortName: parkShortName.trim() || null,
          fields: fieldNames.map((name) => ({ name, supportedDivisions: [], supportedAgeGroups: [] })),
        }),
      })) as { data?: Park };
      setParkName("");
      setParkShortName("");
      setNewFieldNames(["Field 1", "Field 2"]);
      await onRefresh();
      if (json.data?.id) setSelectedParkId(json.data.id);
      onNotice("Park created. Fill the weekly board, then save.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to create park");
    } finally {
      onBusy(false);
    }
  }

  async function addFieldToPark() {
    if (!selectedPark || !extraFieldName.trim()) return;
    onBusy(true);
    onError("");
    try {
      await request("/api/admin/scheduler/parks", {
        method: "PATCH",
        body: JSON.stringify({
          id: selectedPark.id,
          fields: [{ name: extraFieldName.trim(), supportedDivisions: [], supportedAgeGroups: [] }],
        }),
      });
      setExtraFieldName("");
      await onRefresh();
      onNotice("Field added.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to add field");
    } finally {
      onBusy(false);
    }
  }

  async function saveParkSetup() {
    if (!parks.length) return;
    onBusy(true);
    onError("");
    try {
      await Promise.all(
        parks.map((park) => {
          const weeklyIds = park.availabilities
            .filter((slot) => slot.availabilityType === "AVAILABLE" && slot.dayOfWeek != null && !slot.date)
            .map((slot) => slot.id);
          const availabilities: Array<Record<string, unknown>> = [];
          for (const field of park.fields) {
            const plan = plans[field.id];
            if (!plan) continue;
            for (const day of FIELD_BOARD_DAYS) {
              plan.slotTimes.forEach((startTime, slotIndex) => {
                const divisions = plan.week[day.dayOfWeek][slotIndex as 0 | 1];
                const notes = serializeCellDivisions(divisions);
                if (!startTime || !notes) return;
                availabilities.push({
                  seasonId: selectedSeasonId || null,
                  parkId: park.id,
                  fieldId: field.id,
                  availabilityType: "AVAILABLE",
                  dayOfWeek: day.dayOfWeek,
                  startTime: resolveSharedSlotTime(
                    divisions,
                    slotIndex as 0 | 1,
                    startTime,
                    divisionSlotTimes,
                  ).time,
                  notes,
                });
              });
            }
          }
          return request("/api/admin/scheduler/parks", {
            method: "PATCH",
            body: JSON.stringify({
              id: park.id,
              deleteAvailabilityIds: weeklyIds,
              fields: park.fields.map((field) => {
                const plan = plans[field.id];
                const divisions = plan ? divisionsUsedInWeek(plan.week) : [];
                return {
                  id: field.id,
                  name: field.name,
                  shortName: field.shortName,
                  supportedDivisions: divisions,
                  supportedAgeGroups: divisions,
                  fieldMetadata: {
                    slotTimes: plan?.slotTimes ?? ["", ""],
                    week: plan?.week ?? emptyFieldWeek(),
                  },
                  isActive: field.isActive,
                };
              }),
              availabilities,
            }),
          });
        }),
      );
      await onRefresh();
      onNotice("Weekly field board saved for every park.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to save field board");
    } finally {
      onBusy(false);
    }
  }

  async function deleteField(fieldId: string) {
    if (!window.confirm("Delete this field?")) return;
    onBusy(true);
    onError("");
    try {
      await request(`/api/admin/scheduler/parks?type=field&id=${encodeURIComponent(fieldId)}`, { method: "DELETE" });
      await onRefresh();
      onNotice("Field deleted.");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Failed to delete field");
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Add a park</p>
        <p className="mt-1 text-sm text-zinc-400">Create the park and every field in one save. Then fill the weekly board below.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-300">
            Park name
            <input value={parkName} onChange={(e) => setParkName(e.target.value)} placeholder="Example Sports Complex" className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400" />
          </label>
          <label className="block text-sm font-medium text-zinc-300">
            Short name
            <input value={parkShortName} onChange={(e) => setParkShortName(e.target.value)} placeholder="ESC" className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400" />
          </label>
        </div>
        <div className="mt-4 space-y-2">
          {newFieldNames.map((name, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setNewFieldNames((current) => current.map((item, i) => (i === index ? e.target.value : item)))}
                placeholder={`Field ${index + 1}`}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
              />
              {newFieldNames.length > 1 ? (
                <button type="button" onClick={() => setNewFieldNames((current) => current.filter((_, i) => i !== index))} className="rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:border-red-400">
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => setNewFieldNames((current) => [...current, `Field ${current.length + 1}`])} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-red-400">
            Add another field
          </button>
        </div>
        <button type="button" disabled={busy} onClick={() => void createParkWithFields()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
          Create park and fields
        </button>
      </div>

      {parks.length === 0 ? (
        <p className="text-sm text-zinc-500">No parks yet. Create one above to open the weekly board.</p>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Weekly field board</p>
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                Two slots per field. Start times come from Season setup. Check every division that may play that night — 7U and 8U can share a cell. Still one game; leave blank if the field is dark. Save writes every park, not only the one on screen.
              </p>
            </div>
            <label className="block min-w-56 text-sm font-medium text-zinc-300">
              Park
              <select value={selectedPark?.id ?? ""} onChange={(e) => setSelectedParkId(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400">
                {parks.map((park) => (
                  <option key={park.id} value={park.id}>{park.name}</option>
                ))}
              </select>
            </label>
          </div>

          {seasonTimes.length === 0 ? (
            <p className="mt-3 text-sm text-amber-200">Save default game times in Season setup so the slot dropdowns have values.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={extraFieldName}
              onChange={(e) => setExtraFieldName(e.target.value)}
              placeholder="Add a field to this park"
              className="min-w-56 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
            />
            <button type="button" disabled={busy || !extraFieldName.trim()} onClick={() => void addFieldToPark()} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-red-400 disabled:opacity-50">
              Add field
            </button>
          </div>

          <div className="mt-5 space-y-6">
            {selectedPark?.fields.map((field) => {
              const plan = plans[field.id];
              if (!plan) return null;
              return (
                <div key={field.id} className="overflow-x-auto rounded-xl border border-zinc-800">
                  <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-3">
                    <p className="font-semibold text-white">{field.name}</p>
                    {([0, 1] as const).map((slotIndex) => (
                      <label key={slotIndex} className="flex items-center gap-2 text-xs text-zinc-400">
                        Slot {slotIndex + 1}
                        <select
                          value={plan.slotTimes[slotIndex]}
                          onChange={(e) => {
                            const next: [string, string] = [...plan.slotTimes];
                            next[slotIndex] = e.target.value;
                            updatePlan(field.id, { slotTimes: next });
                          }}
                          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white"
                        >
                          <option value="">Start time</option>
                          {seasonTimes.map((time) => (
                            <option key={`${field.id}-${slotIndex}-${time}`} value={time}>
                              {formatSlotLabel(time)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <button type="button" onClick={() => void deleteField(field.id)} className="ml-auto text-xs font-semibold text-red-200 hover:text-red-100">
                      Delete field
                    </button>
                  </div>
                  <table className="min-w-[720px] w-full text-left text-sm text-zinc-300">
                    <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      <tr>
                        <th className="p-3">Time slot</th>
                        {FIELD_BOARD_DAYS.map((day) => (
                          <th key={day.dayOfWeek} className="p-3">{day.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([0, 1] as const).map((slotIndex) => (
                        <tr key={slotIndex} className="border-t border-zinc-800">
                          <td className="p-3 font-semibold text-white">
                            Slot {slotIndex + 1}
                            <div className="text-[11px] font-normal text-zinc-500">
                              {plan.slotTimes[slotIndex] ? formatSlotLabel(plan.slotTimes[slotIndex]) : "Pick a start time"}
                            </div>
                          </td>
                          {FIELD_BOARD_DAYS.map((day) => {
                            const selected = plan.week[day.dayOfWeek][slotIndex];
                            const clock = selected.length
                              ? resolveSharedSlotTime(
                                  selected,
                                  slotIndex,
                                  plan.slotTimes[slotIndex],
                                  divisionSlotTimes,
                                )
                              : null;
                            return (
                              <td key={day.dayOfWeek} className="p-2 align-top">
                                <div className="flex flex-wrap gap-1">
                                  {divisionOptions.map((division) => {
                                    const on = selected.includes(division);
                                    return (
                                      <button
                                        key={division}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleCell(field.id, day.dayOfWeek, slotIndex, division)}
                                        className={
                                          on
                                            ? "rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                            : "rounded-md border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 hover:border-red-400 hover:text-zinc-200"
                                        }
                                      >
                                        {division}
                                      </button>
                                    );
                                  })}
                                </div>
                                {clock ? (
                                  <p className={`mt-1 text-[11px] ${clock.conflict ? "text-amber-200" : "text-zinc-500"}`}>
                                    {formatSlotLabel(clock.time)}
                                    {clock.conflict
                                      ? ` · ${clock.conflictDivisions.join(", ")} use a different start time`
                                      : null}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-[11px] text-zinc-600">Dark</p>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <button type="button" disabled={busy || !parks.some((park) => park.fields.length)} onClick={() => void saveParkSetup()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
            Save weekly boards
          </button>
        </div>
      )}
    </div>
  );
}
