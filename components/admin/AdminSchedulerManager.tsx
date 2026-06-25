"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

type Season = {
  id: string;
  seasonYear: number;
  name: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  defaultGameTimes: unknown;
};

type Field = {
  id: string;
  parkId: string;
  name: string;
  shortName: string | null;
  supportedAgeGroups: unknown;
  supportedDivisions: unknown;
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
  address: string | null;
  notes: string | null;
  isActive: boolean;
  fields: Field[];
  availabilities: Availability[];
};

type Rule = {
  id?: string;
  division: string;
  ageGroup: string;
  preferredParkId: string;
  preferredFieldId: string;
  allowedParkIds: string[];
  allowedFieldIds: string[];
  allowedGameTimes: string[];
  minDaysBetweenGames: number | null;
  maxGamesPerWeek: number | null;
  avoidBackToBack: boolean;
};

type DraftGame = {
  id: string;
  gameDate: string | null;
  startTime: string | null;
  endTime: string | null;
  parkId: string | null;
  fieldId: string | null;
  division: string;
  ageGroup: string | null;
  homeTeamName: string;
  awayTeamName: string;
  status: string;
  roundLabel: string | null;
  gameNumber: number | null;
  conflictFlags: unknown;
  schedulerNotes: string | null;
  park?: { name: string } | null;
  field?: { name: string } | null;
};

type GeneratedGame = Omit<DraftGame, "id" | "park" | "field"> & {
  gameDate: string | null;
  sortOrder: number;
};

type GenerationResult = {
  requestedDivisions: string[];
  slots: Array<{ id: string; gameDate: string; startTime: string; parkName?: string; fieldName?: string }>;
  games: GeneratedGame[];
  fairness: {
    teams: Array<{
      teamId: string;
      teamName: string;
      division: string;
      earlyGames: number;
      lateGames: number;
      homeGames: number;
      awayGames: number;
      totalGames: number;
    }>;
    unscheduledGames: Array<{
      gameNumber: number;
      division: string;
      homeTeamName: string;
      awayTeamName: string;
      reasons: string[];
    }>;
  };
  errors: Array<{ code: string; message: string }>;
  savedGames?: DraftGame[];
};

type SeasonForm = {
  id: string;
  seasonYear: string;
  name: string;
  startsOn: string;
  endsOn: string;
  defaultGameTimes: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_GAME_TIMES = "17:45\n18:00\n19:15";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function toTextList(values: unknown): string {
  return asStringArray(values).join("\n");
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dateValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function nullable(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function statusClass(status: string) {
  if (status === "CONFLICT") return "border-red-500/40 bg-red-500/10 text-red-100";
  if (status === "READY") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  return "border-zinc-700 bg-zinc-900 text-zinc-200";
}

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl shadow-black/20 sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-red-200">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-zinc-300">
      <span>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition focus:border-red-400 ${props.className ?? ""}`}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition focus:border-red-400 ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition focus:border-red-400 ${props.className ?? ""}`}
    />
  );
}

export default function AdminSchedulerManager({ targetOrg }: { targetOrg: ContentOrgId }) {
  const orgQuery = `org=${encodeURIComponent(targetOrg)}`;
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [draftGames, setDraftGames] = useState<DraftGame[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [seasonForm, setSeasonForm] = useState<SeasonForm>({
    id: "",
    seasonYear: String(new Date().getFullYear()),
    name: `Fall Ball ${new Date().getFullYear()}`,
    startsOn: "",
    endsOn: "",
    defaultGameTimes: DEFAULT_GAME_TIMES,
  });
  const [newParkName, setNewParkName] = useState("");
  const [newParkShortName, setNewParkShortName] = useState("");
  const [newParkFieldName, setNewParkFieldName] = useState("");
  const [newParkDivisionText, setNewParkDivisionText] = useState("");
  const [divisionInput, setDivisionInput] = useState("8U Fall, 10U Fall, 12U Fall");
  const [gamesPerTeam, setGamesPerTeam] = useState("8");
  const [allowConflicts, setAllowConflicts] = useState(false);
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const allFields = useMemo(() => parks.flatMap((park) => park.fields.map((field) => ({ ...field, parkName: park.name }))), [parks]);
  const seasonTimes = splitList(seasonForm.defaultGameTimes);
  const exportHref = selectedSeasonId
    ? `/api/admin/scheduler/export?seasonId=${encodeURIComponent(selectedSeasonId)}&${orgQuery}`
    : "#";

  async function api(path: string, init?: RequestInit) {
    const joiner = path.includes("?") ? "&" : "?";
    const response = await fetch(`${path}${joiner}${orgQuery}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String((json as { error?: unknown }).error || "Scheduler request failed"));
    }
    return json;
  }

  async function refreshSeasons() {
    const json = (await api("/api/admin/scheduler/seasons")) as { data: Season[] };
    setSeasons(json.data ?? []);
    if (!selectedSeasonId && json.data?.[0]) {
      setSelectedSeasonId(json.data[0].id);
    }
  }

  async function refreshParks() {
    const json = (await api("/api/admin/scheduler/parks")) as { data: Park[] };
    setParks(json.data ?? []);
  }

  async function refreshMatrix(seasonId = selectedSeasonId) {
    if (!seasonId) {
      setRules([]);
      return;
    }
    const json = (await api(`/api/admin/scheduler/matrix?seasonId=${encodeURIComponent(seasonId)}`)) as { data: Rule[] };
    setRules((json.data ?? []).map(normalizeRule));
  }

  async function refreshDraftGames(seasonId = selectedSeasonId) {
    if (!seasonId) {
      setDraftGames([]);
      return;
    }
    const json = (await api(`/api/admin/scheduler/draft-games?seasonId=${encodeURIComponent(seasonId)}`)) as { data: DraftGame[] };
    setDraftGames(json.data ?? []);
  }

  function normalizeRule(rule: Partial<Rule>): Rule {
    return {
      id: rule.id,
      division: rule.division ?? "",
      ageGroup: rule.ageGroup ?? "",
      preferredParkId: rule.preferredParkId ?? "",
      preferredFieldId: rule.preferredFieldId ?? "",
      allowedParkIds: asStringArray(rule.allowedParkIds),
      allowedFieldIds: asStringArray(rule.allowedFieldIds),
      allowedGameTimes: asStringArray(rule.allowedGameTimes),
      minDaysBetweenGames: rule.minDaysBetweenGames ?? null,
      maxGamesPerWeek: rule.maxGamesPerWeek ?? null,
      avoidBackToBack: rule.avoidBackToBack ?? true,
    };
  }

  function resetSeasonForm() {
    setSeasonForm({
      id: "",
      seasonYear: String(new Date().getFullYear()),
      name: `Fall Ball ${new Date().getFullYear()}`,
      startsOn: "",
      endsOn: "",
      defaultGameTimes: DEFAULT_GAME_TIMES,
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([refreshSeasons(), refreshParks()]).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load scheduler data");
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSeason) return;
    const timer = window.setTimeout(() => {
      setSeasonForm({
        id: selectedSeason.id,
        seasonYear: String(selectedSeason.seasonYear),
        name: selectedSeason.name,
        startsOn: dateValue(selectedSeason.startsOn),
        endsOn: dateValue(selectedSeason.endsOn),
        defaultGameTimes: toTextList(selectedSeason.defaultGameTimes) || DEFAULT_GAME_TIMES,
      });
      void Promise.all([refreshMatrix(selectedSeason.id), refreshDraftGames(selectedSeason.id)]).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load season details");
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason?.id]);

  async function saveSeason() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...(seasonForm.id ? { id: seasonForm.id } : {}),
        seasonYear: Number(seasonForm.seasonYear),
        name: seasonForm.name,
        startsOn: seasonForm.startsOn || null,
        endsOn: seasonForm.endsOn || null,
        defaultGameTimes: splitList(seasonForm.defaultGameTimes),
      };
      const method = seasonForm.id ? "PATCH" : "POST";
      const json = (await api("/api/admin/scheduler/seasons", { method, body: JSON.stringify(payload) })) as { data: Season };
      await refreshSeasons();
      setSelectedSeasonId(json.data.id);
      setNotice(seasonForm.id ? "Season updated." : "Season created.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save season");
    } finally {
      setBusy(false);
    }
  }

  async function createPark() {
    if (!newParkName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/scheduler/parks", {
        method: "POST",
        body: JSON.stringify({
          name: newParkName,
          shortName: newParkShortName,
          fields: newParkFieldName.trim()
            ? [
                {
                  name: newParkFieldName,
                  supportedAgeGroups: splitList(newParkDivisionText),
                  supportedDivisions: splitList(newParkDivisionText),
                },
              ]
            : [],
        }),
      });
      setNewParkName("");
      setNewParkShortName("");
      setNewParkFieldName("");
      setNewParkDivisionText("");
      await refreshParks();
      setNotice("Park created.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create park");
    } finally {
      setBusy(false);
    }
  }

  async function savePark(formData: FormData, parkId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/scheduler/parks", {
        method: "PATCH",
        body: JSON.stringify({
          id: parkId,
          name: nullable(formData.get("name")),
          shortName: nullable(formData.get("shortName")),
          address: nullable(formData.get("address")),
          notes: nullable(formData.get("notes")),
          isActive: formData.get("isActive") === "on",
        }),
      });
      await refreshParks();
      setNotice("Park updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update park");
    } finally {
      setBusy(false);
    }
  }

  async function addField(formData: FormData, parkId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/scheduler/parks", {
        method: "PATCH",
        body: JSON.stringify({
          id: parkId,
          fields: [
            {
              name: nullable(formData.get("fieldName")),
              shortName: nullable(formData.get("fieldShortName")),
              supportedAgeGroups: splitList(String(formData.get("supportedAgeGroups") ?? "")),
              supportedDivisions: splitList(String(formData.get("supportedDivisions") ?? "")),
              isActive: true,
            },
          ],
        }),
      });
      await refreshParks();
      setNotice("Field added.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add field");
    } finally {
      setBusy(false);
    }
  }

  async function addAvailability(formData: FormData, parkId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const dayValue = String(formData.get("dayOfWeek") ?? "");
      await api("/api/admin/scheduler/parks", {
        method: "PATCH",
        body: JSON.stringify({
          id: parkId,
          availabilities: [
            {
              seasonId: selectedSeasonId || null,
              parkId,
              fieldId: nullable(formData.get("fieldId")),
              availabilityType: String(formData.get("availabilityType") ?? "AVAILABLE"),
              date: nullable(formData.get("date")),
              dayOfWeek: dayValue ? Number(dayValue) : null,
              startTime: nullable(formData.get("startTime")),
              endTime: nullable(formData.get("endTime")),
              notes: nullable(formData.get("notes")),
            },
          ],
        }),
      });
      await refreshParks();
      setNotice("Availability added.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add availability");
    } finally {
      setBusy(false);
    }
  }

  async function deleteParkChild(type: "field" | "availability", id: string) {
    if (!window.confirm(`Delete this ${type}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/scheduler/parks?type=${type}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshParks();
      setNotice(`${type === "field" ? "Field" : "Availability"} deleted.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setBusy(false);
    }
  }

  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  async function saveMatrix() {
    if (!selectedSeasonId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/scheduler/matrix", {
        method: "PUT",
        body: JSON.stringify({
          seasonId: selectedSeasonId,
          rules: rules.map((rule) => ({
            ...rule,
            preferredParkId: rule.preferredParkId || null,
            preferredFieldId: rule.preferredFieldId || null,
          })),
        }),
      });
      await refreshMatrix();
      setNotice("Game matrix saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save matrix");
    } finally {
      setBusy(false);
    }
  }

  async function generate(replace: boolean) {
    if (!selectedSeasonId) return;
    if (replace && !window.confirm("Replace generated draft games for these divisions? Manual and locked games are not deleted by this action.")) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/scheduler/generate?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: selectedSeasonId,
          divisions: splitList(divisionInput),
          gamesPerTeam: numberOrNull(gamesPerTeam),
          replace,
          confirmReplace: replace,
          allowConflicts,
        }),
      });
      const json = (await safeJson(response)) as { data?: GenerationResult; error?: string };
      if (!response.ok && !json.data) throw new Error(json.error || "Failed to generate schedule");
      if (json.data) setPreview(json.data);
      if (!response.ok && json.error) setError(json.error);
      setNotice(replace ? "Generated draft games were replaced." : "Preview generated.");
      if (replace) await refreshDraftGames();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule");
    } finally {
      setBusy(false);
    }
  }

  async function updateDraftGame(formData: FormData, gameId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/scheduler/draft-games", {
        method: "PATCH",
        body: JSON.stringify({
          id: gameId,
          gameDate: nullable(formData.get("gameDate")),
          startTime: nullable(formData.get("startTime")),
          endTime: nullable(formData.get("endTime")),
          parkId: nullable(formData.get("parkId")),
          fieldId: nullable(formData.get("fieldId")),
          status: nullable(formData.get("status")),
          schedulerNotes: nullable(formData.get("schedulerNotes")),
        }),
      });
      await refreshDraftGames();
      setNotice("Draft game updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update draft game");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 text-sm text-zinc-300">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Target organization</p>
            <p className="mt-1 text-lg font-semibold text-white">{getOrgDisplayName(targetOrg)}</p>
          </div>
          <div className="min-w-64">
            <FieldLabel label="Active season">
              <SelectInput value={selectedSeasonId} onChange={(event) => setSelectedSeasonId(event.target.value)}>
                <option value="">Select a season</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name} ({season.seasonYear})</option>
                ))}
              </SelectInput>
            </FieldLabel>
          </div>
        </div>
        {notice ? <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-100">{notice}</p> : null}
        {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-100">{error}</p> : null}
      </div>

      <Panel title="Setup Season" eyebrow="1. Foundation">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
            <p>
              Fall Ball defaults use early/late evening slots: first slot around 5:45/6:00 and second slot at 7:15. Store exact scheduler times as 24-hour values like 17:45, 18:00, and 19:15.
            </p>
            <button type="button" onClick={resetSeasonForm} className="mt-4 rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-red-400">
              New Fall Ball season
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Season year"><TextInput value={seasonForm.seasonYear} onChange={(e) => setSeasonForm({ ...seasonForm, seasonYear: e.target.value })} /></FieldLabel>
            <FieldLabel label="Season name"><TextInput value={seasonForm.name} onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })} /></FieldLabel>
            <FieldLabel label="Starts on"><TextInput type="date" value={seasonForm.startsOn} onChange={(e) => setSeasonForm({ ...seasonForm, startsOn: e.target.value })} /></FieldLabel>
            <FieldLabel label="Ends on"><TextInput type="date" value={seasonForm.endsOn} onChange={(e) => setSeasonForm({ ...seasonForm, endsOn: e.target.value })} /></FieldLabel>
            <div className="sm:col-span-2">
              <FieldLabel label="Default game times"><TextArea rows={3} value={seasonForm.defaultGameTimes} onChange={(e) => setSeasonForm({ ...seasonForm, defaultGameTimes: e.target.value })} /></FieldLabel>
            </div>
            <div className="sm:col-span-2">
              <button type="button" disabled={busy} onClick={saveSeason} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
                {seasonForm.id ? "Save Season" : "Create Season"}
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Parks & Fields" eyebrow="2. Facilities">
        <div className="mb-5 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 md:grid-cols-5">
          <FieldLabel label="Park name"><TextInput value={newParkName} onChange={(e) => setNewParkName(e.target.value)} placeholder="Example Sports Complex" /></FieldLabel>
          <FieldLabel label="Short name"><TextInput value={newParkShortName} onChange={(e) => setNewParkShortName(e.target.value)} placeholder="ESC" /></FieldLabel>
          <FieldLabel label="First field"><TextInput value={newParkFieldName} onChange={(e) => setNewParkFieldName(e.target.value)} placeholder="Field 1" /></FieldLabel>
          <FieldLabel label="Field divisions"><TextInput value={newParkDivisionText} onChange={(e) => setNewParkDivisionText(e.target.value)} placeholder="8U Fall, 10U Fall" /></FieldLabel>
          <div className="flex items-end"><button type="button" onClick={createPark} disabled={busy} className="w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">Create Park</button></div>
        </div>

        <div className="space-y-4">
          {parks.map((park) => (
            <div key={park.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <form action={(formData) => void savePark(formData, park.id)} className="grid gap-3 md:grid-cols-5">
                <FieldLabel label="Park"><TextInput name="name" defaultValue={park.name} /></FieldLabel>
                <FieldLabel label="Short"><TextInput name="shortName" defaultValue={park.shortName ?? ""} /></FieldLabel>
                <FieldLabel label="Address"><TextInput name="address" defaultValue={park.address ?? ""} /></FieldLabel>
                <FieldLabel label="Notes"><TextInput name="notes" defaultValue={park.notes ?? ""} /></FieldLabel>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-300"><input name="isActive" type="checkbox" defaultChecked={park.isActive} /> Active</label>
                  <button className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400">Save</button>
                </div>
              </form>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Fields</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm text-zinc-300">
                      <tbody>
                        {park.fields.map((field) => (
                          <tr key={field.id} className="border-t border-zinc-800">
                            <td className="py-2 pr-3 text-white">{field.name}</td>
                            <td className="py-2 pr-3">{asStringArray(field.supportedDivisions).join(", ") || "Any division"}</td>
                            <td className="py-2 text-right"><button type="button" onClick={() => void deleteParkChild("field", field.id)} className="text-red-200 hover:text-red-100">Delete</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <form action={(formData) => void addField(formData, park.id)} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <TextInput name="fieldName" placeholder="New field name" />
                    <TextInput name="fieldShortName" placeholder="Short name" />
                    <TextInput name="supportedAgeGroups" placeholder="Age groups" />
                    <TextInput name="supportedDivisions" placeholder="Allowed divisions" />
                    <button className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400 sm:col-span-2">Add Field</button>
                  </form>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Availability & Blackouts</h3>
                  <div className="max-h-48 overflow-auto rounded-xl border border-zinc-800">
                    {park.availabilities.length ? park.availabilities.map((availability) => (
                      <div key={availability.id} className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 text-sm text-zinc-300 last:border-b-0">
                        <span>{availability.availabilityType} {dateValue(availability.date) || (availability.dayOfWeek !== null ? DAY_LABELS[availability.dayOfWeek] : "Any day")} {availability.startTime ?? ""}-{availability.endTime ?? ""}</span>
                        <button type="button" onClick={() => void deleteParkChild("availability", availability.id)} className="text-red-200 hover:text-red-100">Delete</button>
                      </div>
                    )) : <p className="px-3 py-2 text-sm text-zinc-500">No availability configured yet.</p>}
                  </div>
                  <form action={(formData) => void addAvailability(formData, park.id)} className="mt-3 grid gap-2 sm:grid-cols-3">
                    <SelectInput name="availabilityType"><option value="AVAILABLE">Available</option><option value="BLACKOUT">Blackout</option></SelectInput>
                    <SelectInput name="fieldId"><option value="">All fields</option>{park.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</SelectInput>
                    <SelectInput name="dayOfWeek"><option value="">Specific date</option>{DAY_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}</SelectInput>
                    <TextInput name="date" type="date" />
                    <TextInput name="startTime" placeholder="17:45" />
                    <TextInput name="endTime" placeholder="20:45" />
                    <TextInput name="notes" placeholder="Notes" className="sm:col-span-2" />
                    <button className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400">Add Slot</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
          {!parks.length ? <p className="text-sm text-zinc-500">No parks configured yet. Add any park or field needed for Fall Ball.</p> : null}
        </div>
      </Panel>

      <Panel title="Game Matrix" eyebrow="3. Division rules">
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setRules([...rules, normalizeRule({ division: "8U Fall", ageGroup: "8U", allowedGameTimes: seasonTimes })])} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400">Add Rule</button>
          <button type="button" onClick={saveMatrix} disabled={!selectedSeasonId || busy || !rules.length} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">Save Matrix</button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[1100px] w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500"><tr><th className="p-3">Division</th><th className="p-3">Age Group</th><th className="p-3">Allowed Parks</th><th className="p-3">Allowed Fields</th><th className="p-3">Times</th><th className="p-3">Limits</th><th className="p-3"></th></tr></thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr key={`${rule.id ?? "new"}-${index}`} className="border-t border-zinc-800 align-top">
                  <td className="p-3"><TextInput value={rule.division} onChange={(e) => updateRule(index, { division: e.target.value })} /></td>
                  <td className="p-3"><TextInput value={rule.ageGroup} onChange={(e) => updateRule(index, { ageGroup: e.target.value })} /></td>
                  <td className="p-3"><SelectInput multiple size={Math.min(4, Math.max(2, parks.length))} value={rule.allowedParkIds} onChange={(e) => updateRule(index, { allowedParkIds: Array.from(e.target.selectedOptions).map((option) => option.value) })}>{parks.map((park) => <option key={park.id} value={park.id}>{park.name}</option>)}</SelectInput></td>
                  <td className="p-3"><SelectInput multiple size={4} value={rule.allowedFieldIds} onChange={(e) => updateRule(index, { allowedFieldIds: Array.from(e.target.selectedOptions).map((option) => option.value) })}>{allFields.map((field) => <option key={field.id} value={field.id}>{field.parkName}: {field.name}</option>)}</SelectInput></td>
                  <td className="p-3"><TextArea rows={3} value={rule.allowedGameTimes.join("\n")} onChange={(e) => updateRule(index, { allowedGameTimes: splitList(e.target.value) })} /></td>
                  <td className="p-3 space-y-2"><TextInput placeholder="Min days" value={rule.minDaysBetweenGames ?? ""} onChange={(e) => updateRule(index, { minDaysBetweenGames: numberOrNull(e.target.value) })} /><TextInput placeholder="Max/week" value={rule.maxGamesPerWeek ?? ""} onChange={(e) => updateRule(index, { maxGamesPerWeek: numberOrNull(e.target.value) })} /><label className="flex items-center gap-2"><input type="checkbox" checked={rule.avoidBackToBack} onChange={(e) => updateRule(index, { avoidBackToBack: e.target.checked })} /> Avoid back-to-back</label></td>
                  <td className="p-3"><button type="button" onClick={() => setRules(rules.filter((_, i) => i !== index))} className="text-red-200 hover:text-red-100">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Generate Schedule" eyebrow="4. Draft builder">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.5fr]">
          <div className="space-y-3">
            <FieldLabel label="Divisions"><TextArea rows={3} value={divisionInput} onChange={(e) => setDivisionInput(e.target.value)} /></FieldLabel>
            <FieldLabel label="Games per team"><TextInput value={gamesPerTeam} onChange={(e) => setGamesPerTeam(e.target.value)} /></FieldLabel>
            <p className="text-xs text-zinc-500">Generates up to this many games per team. Odd team counts, byes, field rules, and limited slots can leave teams short of the exact target.</p>
            <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={allowConflicts} onChange={(e) => setAllowConflicts(e.target.checked)} /> Allow conflict drafts to be saved</label>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={!selectedSeasonId || busy} onClick={() => void generate(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400 disabled:opacity-60">Preview</button><button type="button" disabled={!selectedSeasonId || busy} onClick={() => void generate(true)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">Replace Generated Draft</button></div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <h3 className="text-lg font-semibold text-white">Preview Summary</h3>
            {preview ? <div className="mt-3 grid gap-3 text-sm text-zinc-300 sm:grid-cols-4"><div><p className="text-zinc-500">Games</p><p className="text-2xl font-semibold text-white">{preview.games.length}</p></div><div><p className="text-zinc-500">Slots</p><p className="text-2xl font-semibold text-white">{preview.slots.length}</p></div><div><p className="text-zinc-500">Warnings</p><p className="text-2xl font-semibold text-white">{preview.errors.length}</p></div><div><p className="text-zinc-500">Unscheduled</p><p className="text-2xl font-semibold text-white">{preview.fairness.unscheduledGames.length}</p></div></div> : <p className="mt-3 text-sm text-zinc-500">Generate a preview before replacing draft games.</p>}
            {preview?.errors.length ? <ul className="mt-3 space-y-1 text-sm text-red-100">{preview.errors.map((item) => <li key={`${item.code}-${item.message}`}>{item.code}: {item.message}</li>)}</ul> : null}
          </div>
        </div>
      </Panel>

      <Panel title="Review & Fix" eyebrow="5. Draft QA">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-zinc-400">Review draft games, conflict flags, fairness warnings, and unscheduled preview reasons. Use row edits for date, time, field, status, and scheduler notes.</p><button type="button" onClick={() => void refreshDraftGames()} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400">Refresh Drafts</button></div>
        {preview?.fairness.unscheduledGames.length ? <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{preview.fairness.unscheduledGames.slice(0, 5).map((game) => <p key={`${game.gameNumber}-${game.homeTeamName}`}>#{game.gameNumber} {game.homeTeamName} vs {game.awayTeamName}: {game.reasons.join(", ")}</p>)}</div> : null}
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[1150px] w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500"><tr><th className="p-3">Game</th><th className="p-3">Date</th><th className="p-3">Time</th><th className="p-3">Park</th><th className="p-3">Field</th><th className="p-3">Status</th><th className="p-3">Warnings</th><th className="p-3">Notes</th><th className="p-3"></th></tr></thead>
            <tbody>
              {draftGames.map((game) => (
                <tr key={game.id} className="border-t border-zinc-800 align-top">
                  <td className="p-3"><p className="font-semibold text-white">{game.homeTeamName} vs {game.awayTeamName}</p><p className="text-xs text-zinc-500">{game.division} {game.roundLabel ? `- ${game.roundLabel}` : ""}</p></td>
                  <td className="p-3"><form id={`game-${game.id}`} action={(formData) => void updateDraftGame(formData, game.id)} /><TextInput form={`game-${game.id}`} name="gameDate" type="date" defaultValue={dateValue(game.gameDate)} /></td>
                  <td className="p-3 grid gap-2"><TextInput form={`game-${game.id}`} name="startTime" defaultValue={game.startTime ?? ""} placeholder="17:45" /><TextInput form={`game-${game.id}`} name="endTime" defaultValue={game.endTime ?? ""} placeholder="19:15" /></td>
                  <td className="p-3"><SelectInput form={`game-${game.id}`} name="parkId" defaultValue={game.parkId ?? ""}><option value="">Unassigned</option>{parks.map((park) => <option key={park.id} value={park.id}>{park.name}</option>)}</SelectInput></td>
                  <td className="p-3"><SelectInput form={`game-${game.id}`} name="fieldId" defaultValue={game.fieldId ?? ""}><option value="">Unassigned</option>{allFields.map((field) => <option key={field.id} value={field.id}>{field.parkName}: {field.name}</option>)}</SelectInput></td>
                  <td className="p-3"><SelectInput form={`game-${game.id}`} name="status" defaultValue={game.status}><option value="DRAFT">Draft</option><option value="READY">Ready</option><option value="CONFLICT">Conflict</option><option value="LOCKED">Locked</option><option value="CANCELED">Canceled</option></SelectInput><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs ${statusClass(game.status)}`}>{game.status}</span></td>
                  <td className="p-3 text-xs text-zinc-400">{asStringArray(game.conflictFlags).join(", ") || "None"}</td>
                  <td className="p-3"><TextArea form={`game-${game.id}`} name="schedulerNotes" rows={3} defaultValue={game.schedulerNotes ?? ""} /></td>
                  <td className="p-3"><button form={`game-${game.id}`} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400">Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!draftGames.length ? <p className="p-4 text-sm text-zinc-500">No draft games saved yet.</p> : null}
        </div>
      </Panel>

      <Panel title="Export" eyebrow="6. CSV handoff">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-400">Download the selected season draft schedule as CSV for review, sharing, or downstream import.</p>
          <a href={exportHref} aria-disabled={!selectedSeasonId} className={`rounded-xl px-4 py-2 text-sm font-semibold ${selectedSeasonId ? "bg-red-600 text-white hover:bg-red-500" : "pointer-events-none bg-zinc-800 text-zinc-500"}`}>Download CSV</a>
        </div>
      </Panel>
    </div>
  );
}
