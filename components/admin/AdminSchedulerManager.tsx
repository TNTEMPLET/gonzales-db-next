"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";
import {
  getTeamsManagementAgeGroupDefaults,
  mergeTeamsManagementAgeGroupOptions,
  sortTeamsManagementAgeGroups,
} from "@/lib/admin/teamsImportHelpers";
import {
  SCHEDULER_WIZARD_STEPS,
  schedulerStepStatus,
  wizardStepIsOpen,
  type SchedulerWizardStepId,
} from "@/lib/admin/schedulerWizard";
import FieldCapacityHeatmapModal from "@/components/admin/scheduler/FieldCapacityHeatmapModal";
import FieldSetupPanel from "@/components/admin/scheduler/FieldSetupPanel";
import { weekDivisionsFromMeta } from "@/lib/admin/fieldBoardWeek";
import { parseDivisionSlotTimes, withSuggestedDivisionTimes } from "@/lib/admin/divisionSlotTimes";
import { formatConflictSummary, formatGenerationError } from "@/lib/scheduler/conflictCopy";
import { isEarlyStart } from "@/lib/scheduler/earlyLate";
import { parseCoachNotifyState, type CoachNotifyPreviewRow, type CoachNotifySummary } from "@/lib/scheduler/coachScheduleEmail";
import {
  DEFAULT_SEASON_GAMES_PER_TEAM,
  parseSeasonDateWindows,
  parseSeasonGamesPerTeam,
  withSeasonDateWindows,
} from "@/lib/scheduler/seasonWindows";

type Season = {
  id: string;
  seasonYear: number;
  name: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  defaultGameTimes: unknown;
  settings?: unknown;
};

type Field = {
  id: string;
  parkId: string;
  name: string;
  shortName: string | null;
  supportedAgeGroups: unknown;
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
  allowDoubleHeaders: boolean;
  fieldPriorityIds: string[];
  ruleMetadata?: unknown;
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
  repair?: {
    steps: number;
    maxSteps: number;
    placed: number;
    moved: number;
    remaining: number;
    stopped: string;
  };
};

type SeasonForm = {
  id: string;
  seasonYear: string;
  name: string;
  startsOn: string;
  endsOn: string;
  gamesStartsOn: string;
  gamesEndsOn: string;
  practiceStartsOn: string;
  practiceEndsOn: string;
  defaultGameTimes: string;
  gamesPerTeam: string;
  divisionTimeOverrides: Array<{ division: string; slot1: string; slot2: string }>;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_GAME_TIMES = "17:45\n18:00\n19:15";
const PRACTICE_START_TIMES = Array.from({ length: 51 }, (_, i) => {
  const total = 8 * 60 + i * 15;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});
const PRACTICE_DURATIONS = ["60", "75", "90", "105", "120"];

function withCurrentOption(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function divisionsFromWeeklyBoard(parks: Park[]): string[] {
  const found = new Set<string>();
  for (const park of parks) {
    for (const field of park.fields) {
      for (const division of asStringArray(field.supportedDivisions)) found.add(division);
      for (const division of weekDivisionsFromMeta(field.fieldMetadata)) found.add(division);
    }
    for (const slot of park.availabilities) {
      if (slot.availabilityType !== "AVAILABLE" || !slot.notes) continue;
      for (const part of slot.notes.split(",")) {
        const division = part.trim();
        if (division) found.add(division);
      }
    }
  }
  return [...found];
}

function emptyLimitRule(division: string): Rule {
  return {
    division,
    ageGroup: division,
    preferredParkId: "",
    preferredFieldId: "",
    allowedParkIds: [],
    allowedFieldIds: [],
    allowedGameTimes: [],
    minDaysBetweenGames: null,
    maxGamesPerWeek: null,
    avoidBackToBack: true,
    allowDoubleHeaders: false,
    fieldPriorityIds: [],
  };
}

function boardFieldsForDivision(parks: Park[], division: string): Array<{ id: string; parkName: string; name: string }> {
  const found = new Map<string, { id: string; parkName: string; name: string }>();
  for (const park of parks) {
    for (const field of park.fields) {
      if (weekDivisionsFromMeta(field.fieldMetadata).includes(division)) {
        found.set(field.id, { id: field.id, parkName: park.shortName || park.name, name: field.name });
      }
    }
    for (const slot of park.availabilities) {
      if (slot.availabilityType !== "AVAILABLE" || !slot.fieldId || !slot.notes) continue;
      if (!slot.notes.split(",").map((part) => part.trim()).includes(division)) continue;
      const field = park.fields.find((item) => item.id === slot.fieldId);
      if (!field || found.has(field.id)) continue;
      found.set(field.id, { id: field.id, parkName: park.shortName || park.name, name: field.name });
    }
  }
  return [...found.values()];
}

function fieldLabel(field: { parkName: string; name: string }): string {
  return `${field.parkName} · ${field.name}`;
}

function seasonSlotCountsByDivision(parks: Park[], startsOn: string, endsOn: string): Map<string, number> {
  const counts = new Map<string, number>();
  const start = startsOn ? new Date(`${startsOn}T00:00:00Z`) : null;
  const end = endsOn ? new Date(`${endsOn}T00:00:00Z`) : null;
  for (const park of parks) {
    for (const slot of park.availabilities) {
      if (slot.availabilityType !== "AVAILABLE" || !slot.notes) continue;
      const divisions = slot.notes.split(",").map((part) => part.trim()).filter(Boolean);
      if (!divisions.length) continue;
      let occurrences = 1;
      if (start && end && slot.dayOfWeek != null && !slot.date) {
        occurrences = 0;
        const cursor = new Date(start);
        while (cursor <= end) {
          if (cursor.getUTCDay() === slot.dayOfWeek) occurrences += 1;
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
      if (!occurrences) continue;
      for (const division of divisions) {
        counts.set(division, (counts.get(division) ?? 0) + occurrences);
      }
    }
  }
  return counts;
}

function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${((hours + 11) % 12) + 1}:${minutes} ${suffix}`;
}

function formatReviewDate(value: string | null | undefined): string {
  const key = dateValue(value);
  if (!key) return "—";
  const [, month, day] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function gameHasConflict(game: DraftGame): boolean {
  return game.status === "CONFLICT" || asStringArray(game.conflictFlags).length > 0;
}

function previewCountsForDivision(preview: GenerationResult | null, division: string) {
  if (!preview?.requestedDivisions.includes(division)) return null;
  const games = preview.games.filter((game) => game.division === division);
  const unscheduled = preview.fairness.unscheduledGames.filter((game) => game.division === division).length;
  if (!games.length && !unscheduled) return null;
  return {
    placed: games.length - unscheduled,
    unscheduled,
  };
}

function mergeLimitRules(rules: Rule[], parks: Park[], targetOrg: ContentOrgId): Rule[] {
  const expected = mergeTeamsManagementAgeGroupOptions(
    getTeamsManagementAgeGroupDefaults(targetOrg),
    divisionsFromWeeklyBoard(parks),
  );
  const byDivision = new Map<string, Rule>();
  for (const rule of rules) {
    if (rule.division) byDivision.set(rule.division, rule);
  }
  const merged = expected.map((division) => byDivision.get(division) ?? emptyLimitRule(division));
  const expectedSet = new Set(expected);
  const extras = rules
    .filter((rule) => rule.division && !expectedSet.has(rule.division))
    .sort((a, b) => sortTeamsManagementAgeGroups(a.division, b.division));
  return extras.length ? [...merged, ...extras] : merged;
}

function toTextList(values: unknown): string {
  return asStringArray(values).join("\n");
}

function divisionOverrideRows(settings: unknown): SeasonForm["divisionTimeOverrides"] {
  return Object.entries(parseDivisionSlotTimes(settings)).map(([division, times]) => ({
    division,
    slot1: times[0],
    slot2: times[1],
  }));
}

function settingsWithDivisionTimes(
  existing: unknown,
  rows: SeasonForm["divisionTimeOverrides"],
): Record<string, unknown> {
  const divisionSlotTimes: Record<string, [string, string]> = {};
  for (const row of rows) {
    if (!row.division.trim() || !row.slot1.trim() || !row.slot2.trim()) continue;
    divisionSlotTimes[row.division.trim()] = [row.slot1, row.slot2];
  }
  const base = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  return { ...base, divisionSlotTimes };
}

function settingsFromSeasonForm(existing: unknown, form: SeasonForm): Record<string, unknown> {
  const settings = withSeasonDateWindows(settingsWithDivisionTimes(existing, form.divisionTimeOverrides), {
    gamesStartsOn: form.gamesStartsOn,
    gamesEndsOn: form.gamesEndsOn,
    practiceStartsOn: form.practiceStartsOn,
    practiceEndsOn: form.practiceEndsOn,
  });
  const gamesPerTeam = Number.parseInt(form.gamesPerTeam, 10);
  settings.gamesPerTeam = Number.isInteger(gamesPerTeam) && gamesPerTeam > 0 ? gamesPerTeam : DEFAULT_SEASON_GAMES_PER_TEAM;
  return settings;
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
  id,
  title,
  eyebrow,
  complete,
  open = true,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  eyebrow: string;
  complete?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const collapsed = Boolean(complete) && !open;
  const canToggle = Boolean(complete) && Boolean(onToggle);
  const header = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-red-200">
          {eyebrow}
        </p>
        <div className="flex items-center gap-2">
          {complete != null ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                complete
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 bg-zinc-950 text-zinc-500"
              }`}
            >
              {complete ? "Complete" : "Needs work"}
            </span>
          ) : null}
          {canToggle ? (
            <span className="rounded-xl border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200 group-hover:border-red-400">
              {collapsed ? "Edit" : "Collapse"}
            </span>
          ) : null}
        </div>
      </div>
      <h2 className={`font-semibold text-white ${collapsed ? "mt-1 text-lg" : "mt-2 text-2xl"}`}>{title}</h2>
    </>
  );
  return (
    <section
      id={id}
      className={`scroll-mt-36 rounded-3xl border border-zinc-800 bg-zinc-900/70 shadow-xl shadow-black/20 ${
        collapsed ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      {canToggle ? (
        <button
          type="button"
          className="group block w-full text-left"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {header}
        </button>
      ) : (
        header
      )}
      <div className={collapsed ? "hidden" : "mt-5"}>{children}</div>
    </section>
  );
}

function SchedulerWizardStepper({
  completeById,
  activeId,
  onJump,
  onOpenHeatmap,
}: {
  completeById: Record<SchedulerWizardStepId, boolean>;
  activeId: SchedulerWizardStepId;
  onJump: (id: SchedulerWizardStepId) => void;
  onOpenHeatmap: () => void;
}) {
  const doneCount = SCHEDULER_WIZARD_STEPS.filter((step) => completeById[step.id]).length;
  return (
    <div className="sticky top-16 z-20 -mx-1 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
          Schedule wizard
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenHeatmap}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:border-red-400"
          >
            Heatmap
          </button>
          <p className="text-xs text-zinc-400">
            {doneCount}/{SCHEDULER_WIZARD_STEPS.length} complete
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SCHEDULER_WIZARD_STEPS.map((step) => {
          const complete = completeById[step.id];
          const active = step.id === activeId;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onJump(step.id)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "border-red-500/60 bg-red-500/10 text-red-100"
                  : complete
                    ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200 hover:border-emerald-500"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              <span className="tabular-nums text-zinc-500">{step.number}</span>
              {step.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
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
  const parksRef = useRef(parks);
  parksRef.current = parks;
  const [rules, setRules] = useState<Rule[]>([]);
  const [draftGames, setDraftGames] = useState<DraftGame[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [seasonForm, setSeasonForm] = useState<SeasonForm>({
    id: "",
    seasonYear: String(new Date().getFullYear()),
    name: `Fall Ball ${new Date().getFullYear()}`,
    startsOn: "",
    endsOn: "",
    gamesStartsOn: "",
    gamesEndsOn: "",
    practiceStartsOn: "",
    practiceEndsOn: "",
    defaultGameTimes: DEFAULT_GAME_TIMES,
    gamesPerTeam: String(DEFAULT_SEASON_GAMES_PER_TEAM),
    divisionTimeOverrides: withSuggestedDivisionTimes([], targetOrg, splitList(DEFAULT_GAME_TIMES)),
  });
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [divisionSelectTouched, setDivisionSelectTouched] = useState(false);
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});

  const [allowConflicts, setAllowConflicts] = useState(false);
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [practiceAssignedCount, setPracticeAssignedCount] = useState(0);
  const [practiceTeamCount, setPracticeTeamCount] = useState(0);
  const [notifySentCount, setNotifySentCount] = useState(0);
  const [reviewDivision, setReviewDivision] = useState("all");
  const [reviewParkId, setReviewParkId] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewConflictsOnly, setReviewConflictsOnly] = useState(false);
  const [reviewConflictsTouched, setReviewConflictsTouched] = useState(false);
  const [reviewFairnessOpen, setReviewFairnessOpen] = useState(false);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<SchedulerWizardStepId>("scheduler-season");
  const [reopenedStepIds, setReopenedStepIds] = useState<Set<SchedulerWizardStepId>>(() => new Set());
  const [heatmapOpen, setHeatmapOpen] = useState(false);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const allFields = useMemo(() => parks.flatMap((park) => park.fields.map((field) => ({ ...field, parkName: park.name }))), [parks]);
  const wizardCompleteById = useMemo(() => {
    const snap = {
      seasonSaved: Boolean(selectedSeason?.id && selectedSeason.startsOn && selectedSeason.endsOn),
      fieldCount: allFields.length,
      availableSlotCount: parks.reduce(
        (n, park) => n + park.availabilities.filter((slot) => slot.availabilityType === "AVAILABLE").length,
        0,
      ),
      savedRuleCount: rules.filter((rule) => Boolean(rule.id)).length,
      draftGameCount: draftGames.length,
      conflictGameCount: draftGames.filter((game) => game.status === "CONFLICT").length,
      practiceAssignedCount,
      practiceTeamCount,
      notifySentCount,
    };
    return Object.fromEntries(
      SCHEDULER_WIZARD_STEPS.map((step) => [step.id, schedulerStepStatus(step.id, snap) === "COMPLETE"]),
    ) as Record<SchedulerWizardStepId, boolean>;
  }, [
    allFields.length,
    draftGames,
    parks,
    practiceAssignedCount,
    practiceTeamCount,
    notifySentCount,
    rules,
    selectedSeason,
  ]);
  const seasonTimes = splitList(seasonForm.defaultGameTimes);
  const seasonSlotsByDivision = useMemo(
    () =>
      seasonSlotCountsByDivision(
        parks,
        seasonForm.gamesStartsOn || seasonForm.startsOn,
        seasonForm.gamesEndsOn || seasonForm.endsOn,
      ),
    [parks, seasonForm.endsOn, seasonForm.gamesEndsOn, seasonForm.gamesStartsOn, seasonForm.startsOn],
  );
  const boardDivisions = useMemo(() => new Set(divisionsFromWeeklyBoard(parks)), [parks]);
  const reviewDivisions = useMemo(
    () => [...new Set(draftGames.map((game) => game.division).filter(Boolean))].sort(sortTeamsManagementAgeGroups),
    [draftGames],
  );
  const reviewSummary = useMemo(() => {
    const conflicts = draftGames.filter(gameHasConflict);
    const unassigned = draftGames.filter((game) => !game.gameDate || !game.fieldId);
    const byDivision = reviewDivisions.map((division) => ({
      division,
      count: draftGames.filter((game) => game.division === division).length,
      conflicts: draftGames.filter((game) => game.division === division && gameHasConflict(game)).length,
    }));
    return { conflicts: conflicts.length, unassigned: unassigned.length, byDivision };
  }, [draftGames, reviewDivisions]);
  const filteredReviewGames = useMemo(() => {
    const query = reviewQuery.trim().toLowerCase();
    return draftGames.filter((game) => {
      if (reviewDivision !== "all" && game.division !== reviewDivision) return false;
      if (reviewParkId !== "all" && game.parkId !== reviewParkId) return false;
      if (reviewStatus !== "all" && game.status !== reviewStatus) return false;
      if (reviewConflictsOnly && !gameHasConflict(game)) return false;
      if (query) {
        const haystack = [
          game.homeTeamName,
          game.awayTeamName,
          game.division,
          game.park?.name,
          game.field?.name,
          game.roundLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [draftGames, reviewConflictsOnly, reviewDivision, reviewParkId, reviewQuery, reviewStatus]);
  useEffect(() => {
    if (reviewConflictsTouched) return;
    setReviewConflictsOnly(reviewSummary.conflicts > 0);
  }, [reviewConflictsTouched, reviewSummary.conflicts]);
  useEffect(() => {
    if (editingGameId && !filteredReviewGames.some((game) => game.id === editingGameId)) {
      setEditingGameId(null);
    }
  }, [editingGameId, filteredReviewGames]);
  const reviewFairness = useMemo(() => {
    const source = reviewDivision === "all" ? draftGames : draftGames.filter((game) => game.division === reviewDivision);
    const timesByDivision = new Map<string, string[]>();
    for (const game of source) {
      if (!game.startTime) continue;
      const times = timesByDivision.get(game.division) ?? [];
      times.push(game.startTime);
      timesByDivision.set(game.division, times);
    }
    const teams = new Map<
      string,
      { teamName: string; division: string; homeGames: number; awayGames: number; earlyGames: number; lateGames: number; totalGames: number }
    >();
    const bump = (teamName: string, division: string, side: "home" | "away", early: boolean) => {
      const key = `${division}:${teamName}`;
      const current = teams.get(key) ?? {
        teamName,
        division,
        homeGames: 0,
        awayGames: 0,
        earlyGames: 0,
        lateGames: 0,
        totalGames: 0,
      };
      current.totalGames += 1;
      if (side === "home") current.homeGames += 1;
      else current.awayGames += 1;
      if (early) current.earlyGames += 1;
      else current.lateGames += 1;
      teams.set(key, current);
    };
    for (const game of source) {
      if (!game.gameDate || !game.startTime) continue;
      const early = isEarlyStart(game.startTime, timesByDivision.get(game.division) ?? []);
      bump(game.homeTeamName, game.division, "home", early);
      bump(game.awayTeamName, game.division, "away", early);
    }
    return [...teams.values()].sort((a, b) => {
      const divisionSort = sortTeamsManagementAgeGroups(a.division, b.division);
      return divisionSort || a.teamName.localeCompare(b.teamName);
    });
  }, [draftGames, reviewDivision]);
  const heatmapGames = useMemo(() => {
    const source = preview?.games.length ? preview.games : draftGames;
    return source.map((game) => ({
      fieldId: game.fieldId,
      gameDate: game.gameDate,
      startTime: game.startTime,
      division: game.division,
      homeTeamName: game.homeTeamName,
      awayTeamName: game.awayTeamName,
    }));
  }, [draftGames, preview]);
  const heatmapTeamCounts = useMemo(() => {
    const counts: Record<string, number> = { ...teamCounts };
    for (const rule of rules) {
      const value = teamCounts[rule.ageGroup || rule.division] ?? teamCounts[rule.division] ?? 0;
      if (rule.division) counts[rule.division] = value;
    }
    return counts;
  }, [rules, teamCounts]);
  const heatmapSourceLabel = preview?.games.some((game) => game.gameDate && game.fieldId)
    ? "Showing the last generate preview"
    : "Showing saved draft games";
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
      setRules(mergeLimitRules([], parksRef.current, targetOrg));
      return;
    }
    const json = (await api(`/api/admin/scheduler/matrix?seasonId=${encodeURIComponent(seasonId)}`)) as { data: Rule[] };
    setRules(mergeLimitRules((json.data ?? []).map(normalizeRule), parksRef.current, targetOrg));
  }

  async function refreshDraftGames(seasonId = selectedSeasonId) {
    if (!seasonId) {
      setDraftGames([]);
      return;
    }
    const json = (await api(`/api/admin/scheduler/draft-games?seasonId=${encodeURIComponent(seasonId)}`)) as { data: DraftGame[] };
    setDraftGames(json.data ?? []);
  }

  function workingSeasonYear(seasonYear = seasonForm.seasonYear) {
    const fromSeason = selectedSeason?.seasonYear;
    if (fromSeason) return fromSeason;
    const parsed = Number(seasonYear);
    return Number.isInteger(parsed) ? parsed : new Date().getFullYear();
  }

  async function refreshTeamCounts(seasonYear = workingSeasonYear()) {
    if (!Number.isInteger(seasonYear) || seasonYear < 2020) {
      setTeamCounts({});
      return;
    }
    const json = (await api(
      `/api/admin/scheduler/generate?seasonYear=${encodeURIComponent(String(seasonYear))}`,
    )) as {
      data?: { teamCounts?: Record<string, number> };
    };
    setTeamCounts(json.data?.teamCounts ?? {});
  }

  async function refreshPracticeSummary(seasonYear: number) {
    const json = (await api(
      `/api/admin/scheduler/practice-slots?seasonYear=${encodeURIComponent(String(seasonYear))}`,
    )) as { assignedCount?: number; teamCount?: number };
    setPracticeAssignedCount(json.assignedCount ?? 0);
    setPracticeTeamCount(json.teamCount ?? 0);
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
      allowDoubleHeaders:
        typeof rule.allowDoubleHeaders === "boolean"
          ? rule.allowDoubleHeaders
          : Boolean(
              rule.ruleMetadata &&
                typeof rule.ruleMetadata === "object" &&
                (rule.ruleMetadata as { allowDoubleHeaders?: unknown }).allowDoubleHeaders === true,
            ),
      fieldPriorityIds:
        Array.isArray(rule.fieldPriorityIds) && rule.fieldPriorityIds.length
          ? asStringArray(rule.fieldPriorityIds)
          : asStringArray(
              rule.ruleMetadata &&
                typeof rule.ruleMetadata === "object"
                ? (rule.ruleMetadata as { fieldPriorityIds?: unknown }).fieldPriorityIds
                : [],
            ),
    };
  }

  function resetSeasonForm() {
    setSeasonForm({
      id: "",
      seasonYear: String(new Date().getFullYear()),
      name: `Fall Ball ${new Date().getFullYear()}`,
      startsOn: "",
      endsOn: "",
      gamesStartsOn: "",
      gamesEndsOn: "",
      practiceStartsOn: "",
      practiceEndsOn: "",
      defaultGameTimes: DEFAULT_GAME_TIMES,
      gamesPerTeam: String(DEFAULT_SEASON_GAMES_PER_TEAM),
      divisionTimeOverrides: withSuggestedDivisionTimes([], targetOrg, splitList(DEFAULT_GAME_TIMES)),
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        refreshSeasons(),
        refreshParks(),
        refreshTeamCounts(workingSeasonYear()),
        refreshPracticeSummary(workingSeasonYear()),
      ]).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load scheduler data");
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSeason) {
      const year = workingSeasonYear();
      void refreshTeamCounts(year).catch(() => undefined);
      void refreshPracticeSummary(year).catch(() => undefined);
      setNotifySentCount(0);
      return;
    }
    const timer = window.setTimeout(() => {
      const seasonStart = dateValue(selectedSeason.startsOn);
      const seasonEnd = dateValue(selectedSeason.endsOn);
      const windows = parseSeasonDateWindows(selectedSeason.settings, seasonStart, seasonEnd);
      setSeasonForm({
        id: selectedSeason.id,
        seasonYear: String(selectedSeason.seasonYear),
        name: selectedSeason.name,
        startsOn: seasonStart,
        endsOn: seasonEnd,
        ...windows,
        defaultGameTimes: toTextList(selectedSeason.defaultGameTimes) || DEFAULT_GAME_TIMES,
        gamesPerTeam: String(parseSeasonGamesPerTeam(selectedSeason.settings)),
        divisionTimeOverrides: withSuggestedDivisionTimes(
          divisionOverrideRows(selectedSeason.settings),
          targetOrg,
          asStringArray(selectedSeason.defaultGameTimes).length
            ? asStringArray(selectedSeason.defaultGameTimes)
            : splitList(DEFAULT_GAME_TIMES),
        ),
      });
      setNotifySentCount(parseCoachNotifyState(selectedSeason.settings).lastSentCount);
      void Promise.all([
        refreshMatrix(selectedSeason.id),
        refreshDraftGames(selectedSeason.id),
        refreshPracticeSummary(selectedSeason.seasonYear),
        refreshTeamCounts(selectedSeason.seasonYear),
      ]).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load season details");
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason?.id]);

  useEffect(() => {
    if (selectedSeason) return;
    const year = Number(seasonForm.seasonYear);
    if (!Number.isInteger(year) || year < 2020) return;
    void refreshTeamCounts(year).catch(() => undefined);
    void refreshPracticeSummary(year).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonForm.seasonYear, selectedSeason?.id]);

  useEffect(() => {
    const nodes = SCHEDULER_WIZARD_STEPS.map((step) => document.getElementById(step.id)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id as SchedulerWizardStepId | undefined;
        if (id) setActiveStepId(id);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0.05 },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function stepOpen(id: SchedulerWizardStepId) {
    return wizardStepIsOpen(wizardCompleteById[id], reopenedStepIds.has(id));
  }

  function toggleStepOpen(id: SchedulerWizardStepId) {
    if (!wizardCompleteById[id]) return;
    setReopenedStepIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function jumpToStep(id: SchedulerWizardStepId) {
    setActiveStepId(id);
    if (wizardCompleteById[id]) {
      setReopenedStepIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
    }
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  useEffect(() => {
    setRules((current) => mergeLimitRules(current, parks, targetOrg));
  }, [parks, selectedSeasonId, targetOrg]);

  useEffect(() => {
    setDivisionSelectTouched(false);
  }, [selectedSeasonId]);

  useEffect(() => {
    const available = rules.map((rule) => rule.division).filter(Boolean);
    setSelectedDivisions((current) => {
      if (divisionSelectTouched) return current.filter((division) => available.includes(division));
      return available.filter((division) => (seasonSlotsByDivision.get(division) ?? 0) > 0);
    });
  }, [rules, seasonSlotsByDivision, divisionSelectTouched]);

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
        settings: settingsFromSeasonForm(selectedSeason?.settings, seasonForm),
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

  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  async function persistMatrix() {
    if (!selectedSeasonId || !rules.length) return;
    await api("/api/admin/scheduler/matrix", {
      method: "PUT",
      body: JSON.stringify({
        seasonId: selectedSeasonId,
        rules: rules.map((rule) => ({
          ...rule,
          ageGroup: rule.ageGroup || rule.division,
          preferredParkId: null,
          preferredFieldId: rule.fieldPriorityIds[0] ?? null,
          allowedParkIds: [],
          allowedFieldIds: [],
          allowedGameTimes: [],
          ruleMetadata: {
            allowDoubleHeaders: rule.allowDoubleHeaders === true,
            fieldPriorityIds: rule.fieldPriorityIds,
          },
        })),
      }),
    });
  }

  async function saveMatrix() {
    if (!selectedSeasonId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await persistMatrix();
      await refreshMatrix();
      setNotice("Constraints saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save matrix");
    } finally {
      setBusy(false);
    }
  }

  function toggleDivision(division: string, checked: boolean) {
    setDivisionSelectTouched(true);
    setSelectedDivisions((current) => {
      if (checked) return current.includes(division) ? current : [...current, division];
      return current.filter((item) => item !== division);
    });
  }

  function selectGenerateDivisions(next: string[]) {
    setDivisionSelectTouched(true);
    setSelectedDivisions(next);
  }

  async function generate(replace: boolean) {
    if (!selectedSeasonId) return;
    const divisions = selectedDivisions.filter(Boolean);
    if (!divisions.length) {
      setError("Pick at least one division to generate.");
      return;
    }
    if (replace && !window.confirm("Replace generated draft games for the selected divisions? Manual and locked games are not deleted by this action.")) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await persistMatrix();
      const response = await fetch(`/api/admin/scheduler/generate?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId: selectedSeasonId,
          divisions,
          replace,
          confirmReplace: replace,
          allowConflicts,
        }),
      });
      const json = (await safeJson(response)) as { data?: GenerationResult; error?: string };
      if (!response.ok && !json.data) throw new Error(json.error || "Failed to generate schedule");
      if (json.data) setPreview(json.data);
      if (!response.ok && json.error) setError(json.error);
      setNotice(
        replace
          ? "Generated draft games were replaced."
          : json.data?.errors.length
            ? "Preview finished with warnings."
            : "Preview generated.",
      );
      if (replace) await refreshDraftGames();
      const repair = json.data?.repair;
      if (replace && repair?.placed) {
        setNotice(
          repair.remaining
            ? `Generated draft replaced · placed ${repair.placed} leftover game${repair.placed === 1 ? "" : "s"} by rearranging (${repair.steps} steps). ${repair.remaining} still unassigned.`
            : `Generated draft replaced · leftover games were rearranged so every matchup has a slot (${repair.steps} steps).`,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule");
    } finally {
      setBusy(false);
    }
  }

  async function repairConflicts() {
    if (!selectedSeasonId) return;
    if (
      !window.confirm(
        "Rearrange already-placed games so leftover matchups can get a slot? Locked games stay put. Limits (max per week, rest, no doubleheaders) still apply.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const divisions = reviewDivision === "all" ? [] : [reviewDivision];
      const response = await fetch(`/api/admin/scheduler/generate?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: selectedSeasonId, divisions, repair: true }),
      });
      const json = (await safeJson(response)) as { data?: GenerationResult; error?: string };
      if (!response.ok && !json.data) throw new Error(json.error || "Failed to fix conflicts");
      const repair = json.data?.repair;
      await refreshDraftGames();
      if (!repair) {
        setNotice("Conflict check finished.");
        return;
      }
      if (repair.stopped === "max_steps") {
        setError(`Stopped after ${repair.maxSteps} steps to avoid an infinite loop. ${repair.remaining} games still unassigned.`);
      } else if (repair.stopped === "cycle") {
        setError(`Rearrange repeated a previous layout after ${repair.steps} steps. ${repair.remaining} games still unassigned.`);
      }
      if (repair.remaining === 0) {
        setNotice(`All leftover games were placed (${repair.steps} step${repair.steps === 1 ? "" : "s"} · ${repair.moved} moved).`);
      } else if (repair.placed > 0) {
        setNotice(
          `Placed ${repair.placed} leftover game${repair.placed === 1 ? "" : "s"} by moving ${repair.moved} already-scheduled game${repair.moved === 1 ? "" : "s"}. ${repair.remaining} still unassigned.`,
        );
      } else {
        setNotice("No rearrangement fit Limits. Empty holes are in weeks where those leftover teams already have their max games.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fix conflicts");
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
      setEditingGameId(null);
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

      <SchedulerWizardStepper
        completeById={wizardCompleteById}
        activeId={activeStepId}
        onJump={jumpToStep}
        onOpenHeatmap={() => setHeatmapOpen(true)}
      />
      {heatmapOpen ? (
        <FieldCapacityHeatmapModal
          parks={parks}
          gamesStartsOn={seasonForm.gamesStartsOn || seasonForm.startsOn}
          gamesEndsOn={seasonForm.gamesEndsOn || seasonForm.endsOn}
          games={heatmapGames}
          teamCounts={heatmapTeamCounts}
          gamesPerTeam={parseSeasonGamesPerTeam({ gamesPerTeam: Number.parseInt(seasonForm.gamesPerTeam, 10) })}
          sourceLabel={heatmapSourceLabel}
          onClose={() => setHeatmapOpen(false)}
        />
      ) : null}

      <Panel
        id="scheduler-season"
        title="Setup Season"
        eyebrow="1. Foundation"
        complete={wizardCompleteById["scheduler-season"]}
        open={stepOpen("scheduler-season")}
        onToggle={() => toggleStepOpen("scheduler-season")}
      >
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
            <FieldLabel label="Full season start"><TextInput type="date" value={seasonForm.startsOn} onChange={(e) => setSeasonForm({ ...seasonForm, startsOn: e.target.value })} /></FieldLabel>
            <FieldLabel label="Full season end"><TextInput type="date" value={seasonForm.endsOn} onChange={(e) => setSeasonForm({ ...seasonForm, endsOn: e.target.value })} /></FieldLabel>
            <FieldLabel label="Games per team">
              <TextInput
                type="number"
                min={1}
                max={30}
                value={seasonForm.gamesPerTeam}
                onChange={(e) => setSeasonForm({ ...seasonForm, gamesPerTeam: e.target.value })}
              />
            </FieldLabel>
            <p className="sm:col-span-2 text-xs text-zinc-500">
              Every selected division targets this many games per team. Generate uses 1-factor nights (bye if a division has an odd number of teams). If the board has fewer nights, leftover games stay unplaced.
            </p>
            <FieldLabel label="Games start"><TextInput type="date" value={seasonForm.gamesStartsOn} onChange={(e) => setSeasonForm({ ...seasonForm, gamesStartsOn: e.target.value })} /></FieldLabel>
            <FieldLabel label="Games end"><TextInput type="date" value={seasonForm.gamesEndsOn} onChange={(e) => setSeasonForm({ ...seasonForm, gamesEndsOn: e.target.value })} /></FieldLabel>
            <FieldLabel label="Practices start"><TextInput type="date" value={seasonForm.practiceStartsOn} onChange={(e) => setSeasonForm({ ...seasonForm, practiceStartsOn: e.target.value })} /></FieldLabel>
            <FieldLabel label="Practices end"><TextInput type="date" value={seasonForm.practiceEndsOn} onChange={(e) => setSeasonForm({ ...seasonForm, practiceEndsOn: e.target.value })} /></FieldLabel>
            <p className="sm:col-span-2 text-xs text-zinc-500">
              Full season is the overall calendar. Generate only uses the games window. Practice assignments use the practice window. Leave a window blank to follow the full season dates.
            </p>
            <div className="sm:col-span-2">
              <FieldLabel label="Default game times"><TextArea rows={3} value={seasonForm.defaultGameTimes} onChange={(e) => setSeasonForm({ ...seasonForm, defaultGameTimes: e.target.value })} /></FieldLabel>
              <p className="mt-1 text-xs text-zinc-500">These are the usual Slot 1 / Slot 2 clocks (and the dropdown list on the weekly board).</p>
            </div>
            <div className="sm:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
              <p className="text-sm font-medium text-zinc-200">Division start times</p>
              <p className="mt-1 text-xs text-zinc-500">
                Use this when 6U Modified, 7U, and 8U (or any other division) do not start at the default times. The weekly board still has two slots; those divisions just use their own clocks.
              </p>
              <div className="mt-3 space-y-2">
                {seasonForm.divisionTimeOverrides.map((row, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
                    <SelectInput
                      value={row.division}
                      onChange={(e) =>
                        setSeasonForm({
                          ...seasonForm,
                          divisionTimeOverrides: seasonForm.divisionTimeOverrides.map((item, i) =>
                            i === index ? { ...item, division: e.target.value } : item,
                          ),
                        })
                      }
                    >
                      <option value="">Division</option>
                      {getTeamsManagementAgeGroupDefaults(targetOrg).map((division) => (
                        <option key={division} value={division}>{division}</option>
                      ))}
                    </SelectInput>
                    <SelectInput
                      value={row.slot1}
                      onChange={(e) =>
                        setSeasonForm({
                          ...seasonForm,
                          divisionTimeOverrides: seasonForm.divisionTimeOverrides.map((item, i) =>
                            i === index ? { ...item, slot1: e.target.value } : item,
                          ),
                        })
                      }
                    >
                      <option value="">Slot 1</option>
                      {seasonTimes.map((time) => (
                        <option key={`s1-${index}-${time}`} value={time}>{time}</option>
                      ))}
                    </SelectInput>
                    <SelectInput
                      value={row.slot2}
                      onChange={(e) =>
                        setSeasonForm({
                          ...seasonForm,
                          divisionTimeOverrides: seasonForm.divisionTimeOverrides.map((item, i) =>
                            i === index ? { ...item, slot2: e.target.value } : item,
                          ),
                        })
                      }
                    >
                      <option value="">Slot 2</option>
                      {seasonTimes.map((time) => (
                        <option key={`s2-${index}-${time}`} value={time}>{time}</option>
                      ))}
                    </SelectInput>
                    <button
                      type="button"
                      onClick={() =>
                        setSeasonForm({
                          ...seasonForm,
                          divisionTimeOverrides: seasonForm.divisionTimeOverrides.filter((_, i) => i !== index),
                        })
                      }
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-red-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setSeasonForm({
                    ...seasonForm,
                    divisionTimeOverrides: [
                      ...seasonForm.divisionTimeOverrides,
                      { division: "", slot1: seasonTimes[0] ?? "", slot2: seasonTimes[1] ?? seasonTimes[0] ?? "" },
                    ],
                  })
                }
                className="mt-3 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-red-400"
              >
                Add division times
              </button>
            </div>
            <div className="sm:col-span-2">
              <button type="button" disabled={busy} onClick={saveSeason} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">
                {seasonForm.id ? "Save Season" : "Create Season"}
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        id="scheduler-parks"
        title="Parks & Fields"
        eyebrow="2. Facilities"
        complete={wizardCompleteById["scheduler-parks"]}
        open={stepOpen("scheduler-parks")}
        onToggle={() => toggleStepOpen("scheduler-parks")}
      >
        <FieldSetupPanel
          targetOrg={targetOrg}
          orgQuery={orgQuery}
          parks={parks}
          selectedSeasonId={selectedSeasonId}
          seasonTimes={seasonTimes}
          divisionSlotTimes={parseDivisionSlotTimes(
            settingsWithDivisionTimes(selectedSeason?.settings, seasonForm.divisionTimeOverrides),
          )}
          busy={busy}
          onBusy={setBusy}
          onNotice={setNotice}
          onError={setError}
          onRefresh={refreshParks}
        />
      </Panel>

      <Panel
        id="scheduler-matrix"
        title="Division constraints"
        eyebrow="3. Limits"
        complete={wizardCompleteById["scheduler-matrix"]}
        open={stepOpen("scheduler-matrix")}
        onToggle={() => toggleStepOpen("scheduler-matrix")}
      >
        <p className="mb-4 text-sm text-zinc-400">
          Who plays where is already on the weekly field board. Here you set how often each division can play, and the
          field order Generate should try first. Higher rank wins a shared field; unlisted board fields are used last.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[640px] w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="p-3">Division</th>
                <th className="p-3">Max games / week</th>
                <th className="p-3">Min days between</th>
                <th className="p-3">Avoid back-to-back</th>
                <th className="p-3">Double headers</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => {
                const boardFields = boardFieldsForDivision(parks, rule.division);
                const fieldById = new Map(boardFields.map((field) => [field.id, field]));
                for (const park of parks) {
                  for (const field of park.fields) {
                    if (!fieldById.has(field.id)) {
                      fieldById.set(field.id, {
                        id: field.id,
                        parkName: park.shortName || park.name,
                        name: field.name,
                      });
                    }
                  }
                }
                const ordered = rule.fieldPriorityIds
                  .map((id) => fieldById.get(id))
                  .filter((field): field is { id: string; parkName: string; name: string } => Boolean(field));
                const remaining = boardFields.filter((field) => !rule.fieldPriorityIds.includes(field.id));
                return (
                  <Fragment key={`${rule.id ?? "new"}-${rule.division}-${index}`}>
                    <tr className="border-t border-zinc-800">
                      <td className="p-3 font-semibold text-white">{rule.division || "—"}</td>
                      <td className="p-3">
                        <TextInput
                          placeholder="e.g. 2"
                          value={rule.maxGamesPerWeek ?? ""}
                          onChange={(e) => updateRule(index, { maxGamesPerWeek: numberOrNull(e.target.value) })}
                        />
                      </td>
                      <td className="p-3">
                        <TextInput
                          placeholder="e.g. 2"
                          value={rule.minDaysBetweenGames ?? ""}
                          onChange={(e) => updateRule(index, { minDaysBetweenGames: numberOrNull(e.target.value) })}
                        />
                      </td>
                      <td className="p-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rule.avoidBackToBack}
                            onChange={(e) => updateRule(index, { avoidBackToBack: e.target.checked })}
                          />
                          Yes
                        </label>
                      </td>
                      <td className="p-3">
                        <SelectInput
                          value={rule.allowDoubleHeaders ? "yes" : "no"}
                          onChange={(e) => updateRule(index, { allowDoubleHeaders: e.target.value === "yes" })}
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </SelectInput>
                      </td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => setRules(rules.filter((_, i) => i !== index))} className="text-red-200 hover:text-red-100">
                          Remove
                        </button>
                      </td>
                    </tr>
                    <tr className="border-t border-zinc-800/60 bg-zinc-950/40">
                      <td colSpan={6} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Field order</p>
                          {!ordered.length ? (
                            <p className="text-xs text-zinc-500">None = any board field.</p>
                          ) : null}
                          {ordered.map((field, fieldIndex) => (
                            <span
                              key={field.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                            >
                              <span className="tabular-nums text-zinc-500">{fieldIndex + 1}.</span>
                              {fieldLabel(field)}
                              <button
                                type="button"
                                aria-label={`Move ${field.name} up`}
                                disabled={fieldIndex === 0}
                                onClick={() => {
                                  const next = [...rule.fieldPriorityIds];
                                  const swap = next[fieldIndex - 1];
                                  next[fieldIndex - 1] = next[fieldIndex];
                                  next[fieldIndex] = swap;
                                  updateRule(index, { fieldPriorityIds: next });
                                }}
                                className="text-zinc-400 hover:text-white disabled:opacity-30"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${field.name} down`}
                                disabled={fieldIndex === ordered.length - 1}
                                onClick={() => {
                                  const next = [...rule.fieldPriorityIds];
                                  const swap = next[fieldIndex + 1];
                                  next[fieldIndex + 1] = next[fieldIndex];
                                  next[fieldIndex] = swap;
                                  updateRule(index, { fieldPriorityIds: next });
                                }}
                                className="text-zinc-400 hover:text-white disabled:opacity-30"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${field.name}`}
                                onClick={() =>
                                  updateRule(index, {
                                    fieldPriorityIds: rule.fieldPriorityIds.filter((id) => id !== field.id),
                                  })
                                }
                                className="text-zinc-500 hover:text-red-200"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {remaining.length ? (
                            <select
                              value=""
                              onChange={(event) => {
                                const id = event.target.value;
                                if (!id || rule.fieldPriorityIds.includes(id)) return;
                                updateRule(index, { fieldPriorityIds: [...rule.fieldPriorityIds, id] });
                              }}
                              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-red-400"
                            >
                              <option value="">Add field</option>
                              {remaining.map((field) => (
                                <option key={field.id} value={field.id}>
                                  {fieldLabel(field)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!rules.length ? (
            <p className="p-4 text-sm text-zinc-500">Save the weekly field board first so divisions appear here.</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={saveMatrix}
          disabled={!selectedSeasonId || busy || !rules.length}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
        >
          Save constraints
        </button>
      </Panel>

      <Panel
        id="scheduler-generate"
        title="Generate Schedule"
        eyebrow="4. Draft builder"
        complete={wizardCompleteById["scheduler-generate"]}
        open={stepOpen("scheduler-generate")}
        onToggle={() => toggleStepOpen("scheduler-generate")}
      >
        <p className="mb-4 text-sm text-zinc-400">
          Parks already placed each division on a field and night. Limits already cap how often they play.
          Team counts come from Teams & Rosters for {workingSeasonYear()}, including before a schedule season
          is saved. Pick which of those divisions to build, set the season target per team, then preview. Games
          are generated only between {seasonForm.gamesStartsOn || seasonForm.startsOn || "the season start"} and{" "}
          {seasonForm.gamesEndsOn || seasonForm.endsOn || "the season end"}.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectGenerateDivisions(rules.map((rule) => rule.division).filter((division) => (seasonSlotsByDivision.get(division) ?? 0) > 0))}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            Board only
          </button>
          <button
            type="button"
            onClick={() => selectGenerateDivisions(rules.map((rule) => rule.division).filter(Boolean))}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            All Limits
          </button>
          <button
            type="button"
            onClick={() => selectGenerateDivisions([])}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            None
          </button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[720px] w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="p-3">Build</th>
                <th className="p-3">Division</th>
                <th className="p-3">Teams</th>
                <th className="p-3">Season slots</th>
                <th className="p-3">Max / week</th>
                <th className="p-3">Double headers</th>
                <th className="p-3">Preview</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const slots = seasonSlotsByDivision.get(rule.division) ?? 0;
                const teams = teamCounts[rule.ageGroup || rule.division] ?? teamCounts[rule.division] ?? 0;
                const counts = previewCountsForDivision(preview, rule.division);
                const selected = selectedDivisions.includes(rule.division);
                const ready = teams >= 2 && slots > 0;
                return (
                  <tr key={rule.division} className="border-t border-zinc-800">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleDivision(rule.division, e.target.checked)}
                      />
                    </td>
                    <td className="p-3 font-semibold text-white">{rule.division}</td>
                    <td className="p-3">{teams}</td>
                    <td className="p-3">
                      {slots}
                      {boardDivisions.has(rule.division) ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-500">board</span>
                      ) : null}
                    </td>
                    <td className="p-3">{rule.maxGamesPerWeek ?? "—"}</td>
                    <td className="p-3">{rule.allowDoubleHeaders ? "Yes" : "No"}</td>
                    <td className="p-3 text-xs text-zinc-400">
                      {counts ? (
                        <span>
                          {counts.placed} placed
                          {counts.unscheduled ? ` · ${counts.unscheduled} left` : ""}
                        </span>
                      ) : ready ? (
                        "Ready"
                      ) : teams < 2 ? (
                        "Need 2+ teams"
                      ) : (
                        "No board slots"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rules.length ? (
            <p className="p-4 text-sm text-zinc-500">Set Parks and Limits first so divisions appear here.</p>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.5fr]">
          <div className="space-y-3">
            <p className="text-sm text-zinc-300">
              Games per team: <span className="font-semibold text-white">{seasonForm.gamesPerTeam || DEFAULT_SEASON_GAMES_PER_TEAM}</span>
              <span className="ml-2 text-xs text-zinc-500">Set on Season setup. 1-factor packer; odd divisions get a bye.</span>
            </p>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={allowConflicts} onChange={(e) => setAllowConflicts(e.target.checked)} />
              Allow conflict drafts to be saved
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!selectedSeasonId || busy || !selectedDivisions.length}
                onClick={() => void generate(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-red-400 disabled:opacity-60"
              >
                Preview
              </button>
              <button
                type="button"
                disabled={!selectedSeasonId || busy || !selectedDivisions.length}
                onClick={() => void generate(true)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                Replace generated draft
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <h3 className="text-lg font-semibold text-white">Preview summary</h3>
            {preview ? (
              <div className="mt-3 grid gap-3 text-sm text-zinc-300 sm:grid-cols-4">
                <div>
                  <p className="text-zinc-500">Games</p>
                  <p className="text-2xl font-semibold text-white">{preview.games.length}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Slots</p>
                  <p className="text-2xl font-semibold text-white">{preview.slots.length}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Warnings</p>
                  <p className="text-2xl font-semibold text-white">{preview.errors.length}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Unscheduled</p>
                  <p className="text-2xl font-semibold text-white">{preview.fairness.unscheduledGames.length}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Preview fills this summary before you replace draft games.</p>
            )}
            {preview?.errors.length ? (
              <ul className="mt-3 space-y-1 text-sm text-red-100">
                {preview.errors.map((item) => (
                  <li key={`${item.code}-${item.message}`}>
                    {formatGenerationError(item)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel
        id="scheduler-review"
        title="Review & Fix"
        eyebrow="5. Draft QA"
        complete={wizardCompleteById["scheduler-review"]}
        open={stepOpen("scheduler-review")}
        onToggle={() => toggleStepOpen("scheduler-review")}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
          <p>
            {draftGames.length - reviewSummary.unassigned} placed
            {reviewSummary.unassigned ? ` · ${reviewSummary.unassigned} unassigned` : ""}
            {reviewSummary.conflicts ? ` · ${reviewSummary.conflicts} conflicts` : ""}
            {` · ${filteredReviewGames.length} showing`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReviewFairnessOpen((open) => !open)}
              className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
            >
              {reviewFairnessOpen ? "Hide fairness" : "Fairness"}
            </button>
            <button type="button" onClick={() => void refreshDraftGames()} className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400">
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void repairConflicts()}
              disabled={busy || (reviewSummary.unassigned === 0 && reviewSummary.conflicts === 0)}
              className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              Fix conflicts
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReviewDivision("all")}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              reviewDivision === "all" ? "border-red-500/60 bg-red-500/10 text-red-100" : "border-zinc-700 text-zinc-200 hover:border-red-400"
            }`}
          >
            All ({draftGames.length})
          </button>
          {reviewSummary.byDivision.map((row) => (
            <button
              key={row.division}
              type="button"
              onClick={() => setReviewDivision(row.division)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                reviewDivision === row.division ? "border-red-500/60 bg-red-500/10 text-red-100" : "border-zinc-700 text-zinc-200 hover:border-red-400"
              }`}
            >
              {row.division} ({row.count}{row.conflicts ? ` · ${row.conflicts}` : ""})
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="w-44">
            <SelectInput value={reviewParkId} onChange={(e) => setReviewParkId(e.target.value)}>
              <option value="all">All parks</option>
              {parks.map((park) => (
                <option key={park.id} value={park.id}>{park.name}</option>
              ))}
            </SelectInput>
          </div>
          <div className="w-40">
            <SelectInput value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="READY">Ready</option>
              <option value="CONFLICT">Conflict</option>
              <option value="LOCKED">Locked</option>
              <option value="CANCELED">Canceled</option>
            </SelectInput>
          </div>
          <div className="min-w-48 flex-1">
            <TextInput value={reviewQuery} onChange={(e) => setReviewQuery(e.target.value)} placeholder="Search teams or fields" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={reviewConflictsOnly}
              onChange={(e) => {
                setReviewConflictsTouched(true);
                setReviewConflictsOnly(e.target.checked);
              }}
            />
            Conflicts only
          </label>
        </div>
        {reviewFairnessOpen ? (
          <div className="mb-3 overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="min-w-[640px] w-full text-left text-sm text-zinc-300">
              <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Home</th>
                  <th className="px-3 py-2">Away</th>
                  <th className="px-3 py-2">Early</th>
                  <th className="px-3 py-2">Late</th>
                  <th className="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {reviewFairness.map((team) => {
                  const homeAwaySkew = Math.abs(team.homeGames - team.awayGames);
                  const earlyLateSkew = Math.abs(team.earlyGames - team.lateGames);
                  return (
                    <tr key={`${team.division}-${team.teamName}`} className="border-t border-zinc-800">
                      <td className="px-3 py-1.5 font-semibold text-white">
                        {team.teamName}
                        {reviewDivision === "all" ? <span className="ml-2 text-xs font-normal text-zinc-500">{team.division}</span> : null}
                      </td>
                      <td className={`px-3 py-1.5 ${homeAwaySkew > 1 ? "text-amber-200" : ""}`}>{team.homeGames}</td>
                      <td className={`px-3 py-1.5 ${homeAwaySkew > 1 ? "text-amber-200" : ""}`}>{team.awayGames}</td>
                      <td className={`px-3 py-1.5 ${earlyLateSkew > 1 ? "text-amber-200" : ""}`}>{team.earlyGames}</td>
                      <td className={`px-3 py-1.5 ${earlyLateSkew > 1 ? "text-amber-200" : ""}`}>{team.lateGames}</td>
                      <td className="px-3 py-1.5">{team.totalGames}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!reviewFairness.length ? (
              <p className="p-3 text-sm text-zinc-500">No placed games in this filter yet.</p>
            ) : (
              <p className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
                Home/away is set first. Early/late is Slot 1 vs Slot 2. Amber means off by more than one.
              </p>
            )}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-[880px] w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="px-3 py-2">Game</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Where</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Issue</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviewGames.map((game) => {
                const editing = editingGameId === game.id;
                const issue = formatConflictSummary(game.conflictFlags, "");
                return (
                  <Fragment key={game.id}>
                    <tr
                      className={`cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/80 ${editing ? "bg-zinc-900/70" : ""}`}
                      onClick={() => setEditingGameId(editing ? null : game.id)}
                    >
                      <td className="px-3 py-1.5">
                        <p className="font-semibold text-white">{game.homeTeamName} vs {game.awayTeamName}</p>
                        <p className="text-xs text-zinc-500">
                          {game.division}
                          {game.roundLabel ? ` · ${game.roundLabel}` : ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {formatReviewDate(game.gameDate)}
                        {game.startTime ? ` · ${formatClock(game.startTime)}` : ""}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-300">
                        {[game.park?.name, game.field?.name].filter(Boolean).join(" · ") || "Unassigned"}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(game.status)}`}>{game.status}</span>
                      </td>
                      <td className="max-w-xs px-3 py-1.5 text-xs text-zinc-400">{issue || "—"}</td>
                    </tr>
                    {editing ? (
                      <tr className="border-t border-zinc-800 bg-zinc-950/80">
                        <td colSpan={5} className="p-3" onClick={(event) => event.stopPropagation()}>
                          <form id={`game-${game.id}`} action={(formData) => void updateDraftGame(formData, game.id)} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <FieldLabel label="Date">
                              <TextInput name="gameDate" type="date" defaultValue={dateValue(game.gameDate)} />
                            </FieldLabel>
                            <FieldLabel label="Start">
                              <TextInput name="startTime" defaultValue={game.startTime ?? ""} placeholder="17:45" />
                            </FieldLabel>
                            <FieldLabel label="End">
                              <TextInput name="endTime" defaultValue={game.endTime ?? ""} placeholder="19:15" />
                            </FieldLabel>
                            <FieldLabel label="Status">
                              <SelectInput name="status" defaultValue={game.status}>
                                <option value="DRAFT">Draft</option>
                                <option value="READY">Ready</option>
                                <option value="CONFLICT">Conflict</option>
                                <option value="LOCKED">Locked</option>
                                <option value="CANCELED">Canceled</option>
                              </SelectInput>
                            </FieldLabel>
                            <FieldLabel label="Park">
                              <SelectInput name="parkId" defaultValue={game.parkId ?? ""}>
                                <option value="">Unassigned</option>
                                {parks.map((park) => (
                                  <option key={park.id} value={park.id}>{park.name}</option>
                                ))}
                              </SelectInput>
                            </FieldLabel>
                            <FieldLabel label="Field">
                              <SelectInput name="fieldId" defaultValue={game.fieldId ?? ""}>
                                <option value="">Unassigned</option>
                                {allFields.map((field) => (
                                  <option key={field.id} value={field.id}>{field.parkName}: {field.name}</option>
                                ))}
                              </SelectInput>
                            </FieldLabel>
                            <div className="md:col-span-2">
                              <FieldLabel label="Notes">
                                <TextArea name="schedulerNotes" rows={2} defaultValue={game.schedulerNotes ?? ""} />
                              </FieldLabel>
                            </div>
                            <div className="flex items-end gap-2">
                              <button type="submit" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingGameId(null)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-red-400">
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!draftGames.length ? (
            <p className="p-4 text-sm text-zinc-500">Replace the generated draft first so games appear here.</p>
          ) : !filteredReviewGames.length ? (
            <p className="p-4 text-sm text-zinc-500">No games match this filter.</p>
          ) : null}
        </div>
      </Panel>

      <Panel
        id="scheduler-export"
        title="Export"
        eyebrow="6. Upload files"
        complete={wizardCompleteById["scheduler-export"]}
        open={stepOpen("scheduler-export")}
        onToggle={() => toggleStepOpen("scheduler-export")}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-2 text-sm text-zinc-400">
            <p>
              One Excel file, three tabs — Assignr, SportsConnect, and GameChanger. Only placed games are included.
              Team and field names must match each site exactly.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Assignr: Games → Import a spreadsheet</li>
              <li>SportsConnect: Schedules → Manage Schedules → Importing → Download Game Sample columns</li>
              <li>GameChanger: Organization → Schedule → Add games → Import Teams&apos; Schedule from Spreadsheet. Filter the division column, then delete that column before upload if the importer wants only date/time/home/away/location/duration.</li>
            </ul>
          </div>
          <a href={exportHref} aria-disabled={!selectedSeasonId} className={`rounded-xl px-4 py-2 text-sm font-semibold ${selectedSeasonId ? "bg-red-600 text-white hover:bg-red-500" : "pointer-events-none bg-zinc-800 text-zinc-500"}`}>
            Download workbook
          </a>
        </div>
      </Panel>

      <PracticeSlotsPanel
        orgQuery={orgQuery}
        seasonYear={workingSeasonYear()}
        parks={parks}
        allFields={allFields}
        practiceStartsOn={seasonForm.practiceStartsOn || seasonForm.startsOn}
        practiceEndsOn={seasonForm.practiceEndsOn || seasonForm.endsOn}
        complete={wizardCompleteById["scheduler-practice"]}
        open={stepOpen("scheduler-practice")}
        onToggle={() => toggleStepOpen("scheduler-practice")}
        onEditDates={() => jumpToStep("scheduler-season")}
        onPracticeChanged={() => {
          void refreshPracticeSummary(workingSeasonYear());
        }}
      />

      <CoachNotifyPanel
        orgQuery={orgQuery}
        seasonId={selectedSeasonId}
        complete={wizardCompleteById["scheduler-notify"]}
        open={stepOpen("scheduler-notify")}
        onToggle={() => toggleStepOpen("scheduler-notify")}
        onSent={(sentCount) => setNotifySentCount(sentCount)}
      />
    </div>
  );
}

type PracticeSlotView = {
  id: string;
  parkId: string | null;
  fieldId: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  notes: string | null;
  pairedTeamId: string | null;
  pairedTeamName: string | null;
};

type PracticeTeamRow = {
  teamId: string;
  teamName: string;
  slots: PracticeSlotView[];
};

type PracticeListRow = {
  key: string;
  teamId: string;
  teamName: string;
  slot: PracticeSlotView | null;
};

type PracticeDivisionSummary = {
  ageGroup: string;
  teamCount: number;
  assignedCount: number;
};

type PracticeEditTarget = {
  teamId: string;
  slotId: string | null;
  anchorKey: string;
};

type PracticeEditForm = {
  dayOfWeek: string;
  startTime: string;
  durationMinutes: string;
  parkId: string;
  fieldId: string;
  notes: string;
  pairWithTeamId: string;
};

const EMPTY_PRACTICE_FORM: PracticeEditForm = {
  dayOfWeek: "2",
  startTime: "17:45",
  durationMinutes: "90",
  parkId: "",
  fieldId: "",
  notes: "",
  pairWithTeamId: "",
};

function practiceLocation(
  slot: PracticeSlotView,
  parks: Park[],
  allFields: (Field & { parkName: string })[],
): string {
  const field = allFields.find((item) => item.id === slot.fieldId);
  if (field) return `${field.parkName} · ${field.name}`;
  const park = parks.find((item) => item.id === slot.parkId);
  return park?.name ?? "Unassigned";
}

function pickPracticeDivision(list: PracticeDivisionSummary[], preferred?: string): string {
  if (preferred && list.some((row) => row.ageGroup === preferred)) return preferred;
  return list.find((row) => row.assignedCount < row.teamCount)?.ageGroup ?? list[0]?.ageGroup ?? "";
}

function flattenPracticeRows(teams: PracticeTeamRow[]): PracticeListRow[] {
  const list: PracticeListRow[] = [];
  for (const team of teams) {
    const slots = [...team.slots].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    );
    if (!slots.length) {
      list.push({ key: `team-${team.teamId}`, teamId: team.teamId, teamName: team.teamName, slot: null });
      continue;
    }
    for (const slot of slots) {
      list.push({ key: slot.id, teamId: team.teamId, teamName: team.teamName, slot });
    }
  }
  return list.sort((a, b) => {
    const miss = Number(Boolean(a.slot)) - Number(Boolean(b.slot));
    if (miss !== 0) return miss;
    const name = a.teamName.localeCompare(b.teamName);
    if (name !== 0) return name;
    if (!a.slot || !b.slot) return 0;
    return a.slot.dayOfWeek - b.slot.dayOfWeek || a.slot.startTime.localeCompare(b.slot.startTime);
  });
}

function nextPracticeDay(usedDays: number[]): number {
  return [2, 4, 1, 3, 5, 6, 0].find((day) => !usedDays.includes(day)) ?? 2;
}

/**
 * Practice-slot assignment -- reuses this hub's already-loaded Park/Field
 * data. Unlike the game generator above, this doesn't produce matchups; it
 * assigns already-real Teams (post-draft-materialization) to a recurring
 * weekly slot, and writes the result straight into Team.practicePlan so
 * Coach Corner shows it immediately.
 */
function PracticeSlotsPanel({
  orgQuery,
  seasonYear,
  parks,
  allFields,
  practiceStartsOn,
  practiceEndsOn,
  complete,
  open,
  onToggle,
  onEditDates,
  onPracticeChanged,
}: {
  orgQuery: string;
  seasonYear: number;
  parks: Park[];
  allFields: (Field & { parkName: string })[];
  practiceStartsOn: string;
  practiceEndsOn: string;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  onEditDates?: () => void;
  onPracticeChanged?: () => void;
}) {
  const [divisions, setDivisions] = useState<PracticeDivisionSummary[]>([]);
  const [ageGroup, setAgeGroup] = useState("");
  const [rows, setRows] = useState<PracticeListRow[]>([]);
  const [edit, setEdit] = useState<PracticeEditTarget | null>(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [unassignedTouched, setUnassignedTouched] = useState(false);
  const [form, setForm] = useState<PracticeEditForm>(EMPTY_PRACTICE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function fetchDivisions(): Promise<PracticeDivisionSummary[]> {
    const params = new URLSearchParams(orgQuery);
    params.set("seasonYear", String(seasonYear));
    const response = await fetch(`/api/admin/scheduler/practice-slots?${params.toString()}`, { cache: "no-store" });
    const json = await safeJson(response);
    if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to load practice slots"));
    return (json as { divisions?: PracticeDivisionSummary[] }).divisions ?? [];
  }

  async function fetchRows(nextAgeGroup: string): Promise<PracticeListRow[]> {
    const params = new URLSearchParams(orgQuery);
    params.set("seasonYear", String(seasonYear));
    params.set("ageGroup", nextAgeGroup);
    const response = await fetch(`/api/admin/scheduler/practice-slots?${params.toString()}`, { cache: "no-store" });
    const json = await safeJson(response);
    if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to load practice slots"));
    const teams = (json as { teams?: PracticeTeamRow[] }).teams ?? [];
    return flattenPracticeRows(teams);
  }

  function applyRows(nextRows: PracticeListRow[], filterTouched: boolean) {
    setRows(nextRows);
    if (!filterTouched) setUnassignedOnly(nextRows.some((row) => !row.slot));
  }

  async function selectDivision(nextAgeGroup: string, filterTouched = unassignedTouched) {
    setAgeGroup(nextAgeGroup);
    setEdit(null);
    setError("");
    if (!nextAgeGroup) {
      setRows([]);
      return;
    }
    setBusy(true);
    try {
      applyRows(await fetchRows(nextAgeGroup), filterTouched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load practice slots");
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll(preferredAgeGroup?: string) {
    setBusy(true);
    setError("");
    try {
      const list = await fetchDivisions();
      setDivisions(list);
      const next = pickPracticeDivision(list, preferredAgeGroup);
      setAgeGroup(next);
      setEdit(null);
      if (next) applyRows(await fetchRows(next), unassignedTouched);
      else setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load practice slots");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // Reload when the season or org changes; keep the user's division after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgQuery, seasonYear]);

  function startEditing(row: PracticeListRow) {
    setEdit({ teamId: row.teamId, slotId: row.slot?.id ?? null, anchorKey: row.key });
    setForm(
      row.slot
        ? {
            dayOfWeek: String(row.slot.dayOfWeek),
            startTime: row.slot.startTime,
            durationMinutes: String(row.slot.durationMinutes),
            parkId: row.slot.parkId ?? "",
            fieldId: row.slot.fieldId ?? "",
            notes: row.slot.notes ?? "",
            pairWithTeamId: row.slot.pairedTeamId ?? "",
          }
        : EMPTY_PRACTICE_FORM,
    );
  }

  function startAddingDay(row: PracticeListRow) {
    const usedDays = rows.filter((item) => item.teamId === row.teamId && item.slot).map((item) => item.slot!.dayOfWeek);
    setEdit({ teamId: row.teamId, slotId: null, anchorKey: row.key });
    setForm({
      ...EMPTY_PRACTICE_FORM,
      dayOfWeek: String(nextPracticeDay(usedDays)),
      startTime: row.slot?.startTime ?? "17:45",
      durationMinutes: row.slot ? String(row.slot.durationMinutes) : "90",
      parkId: row.slot?.parkId ?? "",
      fieldId: row.slot?.fieldId ?? "",
    });
  }

  async function saveSlot(teamId: string) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(orgQuery);
      const organizationId = params.get("org") || "";
      const response = await fetch("/api/admin/scheduler/practice-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          seasonYear,
          ageGroup,
          teamId,
          slotId: edit?.slotId || null,
          dayOfWeek: Number(form.dayOfWeek),
          startTime: form.startTime,
          durationMinutes: Number(form.durationMinutes) || 90,
          parkId: form.parkId || null,
          fieldId: form.fieldId || null,
          notes: form.notes || null,
          pairWithTeamId: form.pairWithTeamId || null,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to save"));
      setEdit(null);
      await refreshAll(ageGroup);
      onPracticeChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(slotId: string) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(orgQuery);
      params.set("slotId", slotId);
      const response = await fetch(`/api/admin/scheduler/practice-slots?${params.toString()}`, { method: "DELETE" });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to remove"));
      setEdit(null);
      await refreshAll(ageGroup);
      onPracticeChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  const fieldsForSelectedPark = form.parkId ? allFields.filter((field) => field.parkId === form.parkId) : allFields;
  const pairableTeams = [...new Map(
    rows
      .filter((row) => row.teamId !== edit?.teamId)
      .map((row) => [row.teamId, { teamId: row.teamId, teamName: row.teamName, assigned: rows.some((item) => item.teamId === row.teamId && item.slot) }]),
  ).values()].sort((a, b) => Number(a.assigned) - Number(b.assigned) || a.teamName.localeCompare(b.teamName));
  const teamIds = new Set(rows.map((row) => row.teamId));
  const assignedTeamIds = new Set(rows.filter((row) => row.slot).map((row) => row.teamId));
  const assignedCount = assignedTeamIds.size;
  const unassignedCount = teamIds.size - assignedCount;
  const slotCount = rows.filter((row) => row.slot).length;
  const visibleRows = unassignedOnly ? rows.filter((row) => !row.slot) : rows;
  const startTimeOptions = withCurrentOption(PRACTICE_START_TIMES, form.startTime);
  const durationOptions = withCurrentOption(PRACTICE_DURATIONS, form.durationMinutes);
  const windowLabel =
    practiceStartsOn || practiceEndsOn
      ? `${formatReviewDate(practiceStartsOn || null)} – ${formatReviewDate(practiceEndsOn || null)}`
      : "not set";

  return (
    <Panel
      id="scheduler-practice"
      title="Practice Slots"
      eyebrow="7. Practice scheduling"
      complete={complete}
      open={open}
      onToggle={onToggle}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
        <p>
          {assignedCount} assigned
          {unassignedCount ? ` · ${unassignedCount} unassigned` : ""}
          {slotCount > assignedCount ? ` · ${slotCount} slots` : ""}
          {` · ${visibleRows.length} showing`}
          {` · Practices ${windowLabel}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {onEditDates ? (
            <button type="button" onClick={onEditDates} className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400">
              Edit dates
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshAll(ageGroup)}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="mb-3 text-sm text-zinc-400">
        Weekly nights per team — add a second day if they practice twice. Saving writes the Coach Corner practice plan.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {divisions.map((row) => {
          const selected = ageGroup === row.ageGroup;
          const unfinished = row.assignedCount < row.teamCount;
          return (
            <button
              key={row.ageGroup}
              type="button"
              onClick={() => void selectDivision(row.ageGroup)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                selected
                  ? "border-red-500/60 bg-red-500/10 text-red-100"
                  : unfinished
                    ? "border-amber-500/40 text-amber-100 hover:border-red-400"
                    : "border-zinc-700 text-zinc-200 hover:border-red-400"
              }`}
            >
              {row.ageGroup} ({row.assignedCount}/{row.teamCount})
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(event) => {
              setUnassignedTouched(true);
              setUnassignedOnly(event.target.checked);
            }}
          />
          Unassigned only
        </label>
      </div>
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-[720px] w-full text-left text-sm text-zinc-300">
          <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Where</th>
              <th className="px-3 py-2">Pair</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const editing = edit?.anchorKey === row.key;
              const slot = row.slot;
              const addingDay = Boolean(editing && !edit?.slotId && slot);
              return (
                <Fragment key={row.key}>
                  <tr
                    className={`cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/80 ${editing ? "bg-zinc-900/70" : ""}`}
                    onClick={() => (editing && !addingDay ? setEdit(null) : startEditing(row))}
                  >
                    <td className="px-3 py-1.5 font-semibold text-white">{row.teamName}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {slot
                        ? `${DAY_LABELS[slot.dayOfWeek] ?? ""} · ${formatClock(slot.startTime)} · ${slot.durationMinutes} min`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5">{slot ? practiceLocation(slot, parks, allFields) : "—"}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{slot?.pairedTeamName ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          slot
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-100"
                        }`}
                      >
                        {slot ? "Assigned" : "Needs slot"}
                      </span>
                    </td>
                  </tr>
                  {editing ? (
                    <tr className="border-t border-zinc-800 bg-zinc-950/80">
                      <td colSpan={5} className="p-3" onClick={(event) => event.stopPropagation()}>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <FieldLabel label="Day">
                            <SelectInput value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                              {DAY_LABELS.map((label, idx) => (
                                <option key={label} value={idx}>
                                  {label}
                                </option>
                              ))}
                            </SelectInput>
                          </FieldLabel>
                          <FieldLabel label="Start">
                            <SelectInput value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
                              {startTimeOptions.map((time) => (
                                <option key={time} value={time}>
                                  {formatClock(time)}
                                </option>
                              ))}
                            </SelectInput>
                          </FieldLabel>
                          <FieldLabel label="Duration">
                            <SelectInput
                              value={form.durationMinutes}
                              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                            >
                              {durationOptions.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                  {minutes} min
                                </option>
                              ))}
                            </SelectInput>
                          </FieldLabel>
                          <FieldLabel label="Park">
                            <SelectInput
                              value={form.parkId}
                              onChange={(e) => setForm({ ...form, parkId: e.target.value, fieldId: "" })}
                            >
                              <option value="">Unassigned</option>
                              {parks.map((park) => (
                                <option key={park.id} value={park.id}>
                                  {park.name}
                                </option>
                              ))}
                            </SelectInput>
                          </FieldLabel>
                          <FieldLabel label="Field">
                            <SelectInput
                              value={form.fieldId}
                              onChange={(e) => {
                                const fieldId = e.target.value;
                                const field = allFields.find((item) => item.id === fieldId);
                                setForm({ ...form, fieldId, parkId: field?.parkId || form.parkId });
                              }}
                            >
                              <option value="">Unassigned</option>
                              {fieldsForSelectedPark.map((field) => (
                                <option key={field.id} value={field.id}>
                                  {field.parkName}: {field.name}
                                </option>
                              ))}
                            </SelectInput>
                          </FieldLabel>
                          <FieldLabel label="Pair with (goes second)">
                            <SelectInput
                              value={form.pairWithTeamId}
                              onChange={(e) => setForm({ ...form, pairWithTeamId: e.target.value })}
                            >
                              <option value="">No pairing</option>
                              {pairableTeams.map((team) => (
                                <option key={team.teamId} value={team.teamId}>
                                  {team.teamName}
                                  {team.assigned ? " · assigned" : ""}
                                </option>
                              ))}
                            </SelectInput>
                          </FieldLabel>
                          <div className="md:col-span-2">
                            <FieldLabel label="Notes">
                              <TextInput
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                placeholder={'e.g. "Don\'t have to move the mound"'}
                              />
                            </FieldLabel>
                          </div>
                          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void saveSlot(row.teamId);
                              }}
                              disabled={busy}
                              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                            >
                              {addingDay ? "Add day" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEdit(null);
                              }}
                              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-red-400"
                            >
                              Cancel
                            </button>
                            {edit?.slotId && row.slot ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void removeSlot(row.slot!.id);
                                }}
                                disabled={busy}
                                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-rose-300 hover:border-rose-400 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            ) : null}
                            {row.slot && !addingDay ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startAddingDay(row);
                                }}
                                disabled={busy}
                                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-red-400 disabled:opacity-50"
                              >
                                Add another day
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!divisions.length && !busy ? (
          <p className="p-4 text-sm text-zinc-500">No real teams in this season yet.</p>
        ) : !rows.length && ageGroup && !busy ? (
          <p className="p-4 text-sm text-zinc-500">No teams found for this division yet.</p>
        ) : !visibleRows.length && rows.length ? (
          <p className="p-4 text-sm text-zinc-500">Every team in this division already has a slot.</p>
        ) : null}
      </div>
    </Panel>
  );
}

function notifyStatusClass(status: string) {
  if (status === "ready") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "suppressed") return "border-zinc-700 bg-zinc-900 text-zinc-400";
  return "border-amber-500/40 bg-amber-500/10 text-amber-100";
}

function CoachNotifyPanel({
  orgQuery,
  seasonId,
  complete,
  open,
  onToggle,
  onSent,
}: {
  orgQuery: string;
  seasonId: string;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  onSent?: (sentCount: number) => void;
}) {
  const [summary, setSummary] = useState<CoachNotifySummary | null>(null);
  const [rows, setRows] = useState<CoachNotifyPreviewRow[]>([]);
  const [division, setDivision] = useState("all");
  const [readyOnly, setReadyOnly] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    if (!seasonId) {
      setSummary(null);
      setRows([]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(orgQuery);
      params.set("seasonId", seasonId);
      const response = await fetch(`/api/admin/scheduler/notify?${params.toString()}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to load notify preview"));
      const payload = json as { summary: CoachNotifySummary; rows: CoachNotifyPreviewRow[] };
      setSummary(payload.summary);
      setRows(payload.rows ?? []);
      if (payload.summary.lastSentCount) onSent?.(payload.summary.lastSentCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notify preview");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgQuery, seasonId]);

  async function sendReady() {
    if (!seasonId || !summary?.readyCount) return;
    const confirmed = window.confirm(
      `Email ${summary.readyCount} head coach${summary.readyCount === 1 ? "" : "es"}? Teams without a coach are skipped.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams(orgQuery);
      const response = await fetch(`/api/admin/scheduler/notify?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to email coaches"));
      const sent = Number((json as { sent?: unknown }).sent) || 0;
      const failed = Number((json as { failed?: unknown }).failed) || 0;
      setNotice(
        failed
          ? `Emailed ${sent} coach${sent === 1 ? "" : "es"} · ${failed} failed`
          : `Emailed ${sent} coach${sent === 1 ? "" : "es"}`,
      );
      if (sent) onSent?.(sent);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to email coaches");
    } finally {
      setBusy(false);
    }
  }

  const divisions = useMemo(() => {
    const found = new Map<string, number>();
    for (const row of rows) found.set(row.ageGroup, (found.get(row.ageGroup) ?? 0) + 1);
    return [...found.entries()]
      .map(([ageGroup, count]) => ({ ageGroup, count }))
      .sort((a, b) => {
        const ageA = Number.parseInt(a.ageGroup, 10);
        const ageB = Number.parseInt(b.ageGroup, 10);
        if (Number.isFinite(ageA) && Number.isFinite(ageB) && ageA !== ageB) return ageA - ageB;
        return a.ageGroup.localeCompare(b.ageGroup);
      });
  }, [rows]);
  const visibleRows = rows.filter((row) => {
    if (division !== "all" && row.ageGroup !== division) return false;
    if (readyOnly && row.status !== "ready") return false;
    return true;
  });

  return (
    <Panel
      id="scheduler-notify"
      title="Notify Coaches"
      eyebrow="8. Head coach emails"
      complete={complete}
      open={open}
      onToggle={onToggle}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
        <p>
          {summary
            ? `${summary.readyCount} ready · ${summary.missingCoachCount} missing coach · ${summary.practiceCount} with practice · ${summary.gameCount} placed games`
            : "Load a season to preview emails."}
          {summary?.lastSentCount
            ? ` · last sent ${summary.lastSentCount}`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void sendReady()}
            disabled={!seasonId || busy || !summary?.canSend || !summary.readyCount}
            className="rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {summary?.lastSentCount ? "Send again" : "Email ready coaches"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-sm text-zinc-400">
        Each head coach gets their team&apos;s practices and placed draft games, plus a PDF attachment.
        Click a row to preview the email. Teams without a head coach are skipped.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDivision("all")}
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
            division === "all" ? "border-red-500/60 bg-red-500/10 text-red-100" : "border-zinc-700 text-zinc-200 hover:border-red-400"
          }`}
        >
          All ({rows.length})
        </button>
        {divisions.map((row) => (
          <button
            key={row.ageGroup}
            type="button"
            onClick={() => setDivision(row.ageGroup)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              division === row.ageGroup ? "border-red-500/60 bg-red-500/10 text-red-100" : "border-zinc-700 text-zinc-200 hover:border-red-400"
            }`}
          >
            {row.ageGroup} ({row.count})
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={readyOnly} onChange={(event) => setReadyOnly(event.target.checked)} />
          Ready only
        </label>
      </div>
      {notice ? <p className="mb-3 text-sm text-emerald-200">{notice}</p> : null}
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      {summary && !summary.canSend ? (
        <p className="mb-3 text-sm text-amber-200">{summary.sendBlockedReason}</p>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-[880px] w-full text-left text-sm text-zinc-300">
          <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Coach</th>
              <th className="px-3 py-2">Practice</th>
              <th className="px-3 py-2">Games</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const editing = editingTeamId === row.teamId;
              return (
                <Fragment key={row.teamId}>
                  <tr
                    className={`cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/80 ${editing ? "bg-zinc-900/70" : ""}`}
                    onClick={() => setEditingTeamId(editing ? null : row.teamId)}
                  >
                    <td className="px-3 py-1.5">
                      <p className="font-semibold text-white">{row.teamName}</p>
                      <p className="text-xs text-zinc-500">{row.ageGroup}</p>
                    </td>
                    <td className="px-3 py-1.5">
                      <p>{row.coachName || "—"}</p>
                      <p className="text-xs text-zinc-500">{row.coachEmail || "—"}</p>
                    </td>
                    <td className="px-3 py-1.5">{row.practiceSummary}</td>
                    <td className="px-3 py-1.5">{row.gameCount}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${notifyStatusClass(row.status)}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                  </tr>
                  {editing ? (
                    <tr className="border-t border-zinc-800 bg-zinc-950/80">
                      <td colSpan={5} className="p-3" onClick={(event) => event.stopPropagation()}>
                        <p className="text-xs font-semibold text-zinc-400">{row.subject}</p>
                        <div
                          className="mt-2 max-h-80 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900"
                          dangerouslySetInnerHTML={{ __html: row.html }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!seasonId ? (
          <p className="p-4 text-sm text-zinc-500">Select a season first.</p>
        ) : !rows.length && !busy ? (
          <p className="p-4 text-sm text-zinc-500">No real teams in this season yet.</p>
        ) : !visibleRows.length && rows.length ? (
          <p className="p-4 text-sm text-zinc-500">No teams match this filter.</p>
        ) : null}
      </div>
    </Panel>
  );
}
