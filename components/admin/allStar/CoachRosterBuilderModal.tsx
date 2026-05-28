"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgId = "gonzales" | "ascension";
type TeamColor = "GOLD" | "PURPLE" | "NAVY" | "RED";

const ORG_LABELS: Record<OrgId, string> = {
  gonzales: "Gonzales Diamond Baseball",
  ascension: "Ascension Little League",
};

const ORG_COLORS: Record<OrgId, TeamColor[]> = {
  gonzales: ["PURPLE", "GOLD"],
  ascension: ["NAVY", "RED"],
};

type AvailableCandidate = {
  id: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
};

type CandidateGroup = {
  cycleId: string;
  cycleName: string;
  candidates: AvailableCandidate[];
};

type DraftState = {
  org: OrgId;
  year: number;
  ageGroup: string;
  teamColor: TeamColor;
  sourceCycleIds: string[];
  selectedPlayerIds: string[];
  savedAt: string;
  label: string;
};

// ─── Draft helpers ────────────────────────────────────────────────────────────

const DRAFT_PREFIX = "coachRosterDraft_";

function draftKey(org: OrgId, year: number, ageGroup: string, teamColor: TeamColor) {
  return `${DRAFT_PREFIX}${org}_${year}_${encodeURIComponent(ageGroup)}_${teamColor}`;
}

function loadAllDrafts(): DraftState[] {
  const drafts: DraftState[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw) drafts.push(JSON.parse(raw) as DraftState);
    } catch {
      /* ignore malformed */
    }
  }
  return drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function saveDraft(draft: DraftState) {
  const key = draftKey(draft.org, draft.year, draft.ageGroup, draft.teamColor);
  localStorage.setItem(key, JSON.stringify(draft));
}

function clearDraft(org: OrgId, year: number, ageGroup: string, teamColor: TeamColor) {
  localStorage.removeItem(draftKey(org, year, ageGroup, teamColor));
}

function discardDraft(draft: DraftState) {
  clearDraft(draft.org, draft.year, draft.ageGroup, draft.teamColor);
}

function fmtDraftDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// ─── Step types ───────────────────────────────────────────────────────────────

type Step = "drafts" | 1 | 2 | 3;

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: "Team Setup" },
    { n: 2, label: "Source Cycles" },
    { n: 3, label: "Select Players" },
  ];
  const currentNum: number = current === "drafts" ? 0 : current;
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map(({ n, label }, idx) => (
        <div key={n} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors " +
                (currentNum === n
                  ? "bg-violet-600 text-white"
                  : currentNum > n
                    ? "bg-emerald-700/60 text-emerald-200"
                    : "bg-zinc-800 text-zinc-500")
              }
            >
              {currentNum > n ? "✓" : n}
            </div>
            <span
              className={
                "text-[11px] mt-1 whitespace-nowrap " +
                (currentNum === n ? "text-violet-300" : currentNum > n ? "text-emerald-400" : "text-zinc-600")
              }
            >
              {label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={
                "h-px w-12 mx-2 mb-5 transition-colors " +
                (currentNum > n ? "bg-emerald-700/60" : "bg-zinc-700")
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Draft picker (shown if saved drafts exist) ───────────────────────────────

function DraftPickerStep({
  drafts,
  onResume,
  onDiscard,
  onStartNew,
}: {
  drafts: DraftState[];
  onResume: (draft: DraftState) => void;
  onDiscard: (draft: DraftState) => void;
  onStartNew: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        You have {drafts.length} saved draft{drafts.length !== 1 ? "s" : ""}. Resume one or start
        a new roster.
      </p>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {drafts.map((d) => (
          <div
            key={draftKey(d.org, d.year, d.ageGroup, d.teamColor)}
            className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{d.label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {ORG_LABELS[d.org]} · {d.selectedPlayerIds.length} player
                  {d.selectedPlayerIds.length !== 1 ? "s" : ""} selected ·{" "}
                  <span className="text-zinc-500">Saved {fmtDraftDate(d.savedAt)}</span>
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onDiscard(d)}
                  className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:text-red-400 hover:border-red-800/50 transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => onResume(d)}
                  className="rounded border border-violet-700/60 bg-violet-950/30 px-3 py-1 text-xs text-violet-300 hover:bg-violet-950/60 transition-colors font-medium"
                >
                  Resume →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-zinc-800 flex justify-end">
        <button
          type="button"
          onClick={onStartNew}
          className="rounded-lg bg-violet-700 hover:bg-violet-600 px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          + New Roster
        </button>
      </div>
    </div>
  );
}

// ─── Step 1: Team Setup ───────────────────────────────────────────────────────

function Step1TeamSetup({
  org,
  setOrg,
  year,
  setYear,
  ageGroup,
  setAgeGroup,
  teamColor,
  setTeamColor,
  onNext,
}: {
  org: OrgId;
  setOrg: (v: OrgId) => void;
  year: number;
  setYear: (v: number) => void;
  ageGroup: string;
  setAgeGroup: (v: string) => void;
  teamColor: TeamColor;
  setTeamColor: (v: TeamColor) => void;
  onNext: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1];
  const colors = ORG_COLORS[org];

  useEffect(() => {
    if (!colors.includes(teamColor)) setTeamColor(colors[0]);
  }, [org, colors, teamColor, setTeamColor]);

  const canContinue = ageGroup.trim().length >= 2;

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">
        Configure the new coach-selected All-Star team.
      </p>

      {/* Organization */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Organization</label>
        <div className="flex gap-2">
          {(["gonzales", "ascension"] as OrgId[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrg(o)}
              className={
                "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors " +
                (org === o
                  ? "border-violet-600 bg-violet-950/40 text-violet-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800")
              }
            >
              {ORG_LABELS[o]}
            </button>
          ))}
        </div>
      </div>

      {/* Season Year */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Season Year</label>
        <div className="flex gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors " +
                (year === y
                  ? "border-violet-600 bg-violet-950/40 text-violet-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800")
              }
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Age Group */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Age Group{" "}
          <span className="text-zinc-600 font-normal">(e.g. 12U DYB)</span>
        </label>
        <input
          type="text"
          value={ageGroup}
          onChange={(e) => setAgeGroup(e.target.value)}
          placeholder="e.g. 12U DYB"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
        />
      </div>

      {/* Team Color */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Team Color</label>
        <div className="flex gap-2">
          {colors.map((c) => {
            const activeCls =
              c === "GOLD"
                ? "border-yellow-600 bg-yellow-950/40 text-yellow-200"
                : c === "PURPLE"
                  ? "border-violet-600 bg-violet-950/40 text-violet-200"
                  : c === "NAVY"
                    ? "border-blue-700 bg-blue-950/40 text-blue-200"
                    : "border-red-700 bg-red-950/40 text-red-200";
            return (
              <button
                key={c}
                type="button"
                onClick={() => setTeamColor(c)}
                className={
                  "rounded-lg border px-5 py-2 text-sm font-semibold tracking-wide transition-colors " +
                  (teamColor === c ? activeCls : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800")
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {ageGroup.trim() && (
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 text-sm">
          <span className="text-zinc-500">New cycle name: </span>
          <span className="font-semibold text-white">
            {year} – {ageGroup.trim()} – {teamColor}
          </span>
          <span className="text-zinc-500 ml-2">({ORG_LABELS[org]})</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onNext}
          className="rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 text-sm font-medium text-white transition-colors"
        >
          Next: Source Cycles →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Source Cycles ────────────────────────────────────────────────────

function Step2SourceCycles({
  org,
  year,
  targetAgeGroup,
  targetColor,
  selectedCycleIds,
  setSelectedCycleIds,
  onBack,
  onNext,
  onSaveDraft,
}: {
  org: OrgId;
  year: number;
  targetAgeGroup: string;
  targetColor: TeamColor;
  selectedCycleIds: Set<string>;
  setSelectedCycleIds: Dispatch<SetStateAction<Set<string>>>;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
}) {
  const [cycles, setCycles] = useState<Array<{ id: string; cycleName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/all-star/cycles?org=${org}&seasonYear=${year}`)
      .then((r) => r.json())
      .then((json: { data?: Array<{ id: string; organizationId: string; seasonYear: number; ageGroup: string; allStarAgeGroupLabel: string | null; title: string | null }> }) => {
        if (!json.data) throw new Error("Failed to load cycles");
        const mapped = json.data.map((c) => {
          const ageLabel = c.allStarAgeGroupLabel ?? c.ageGroup;
          const normalizedTitle = (c.title ?? "").trim().toUpperCase();
          let color =
            ["GOLD", "PURPLE", "NAVY", "RED"].includes(normalizedTitle)
              ? normalizedTitle
              : org === "ascension"
                ? normalizedTitle.includes("SECOND TEAM") ? "RED" : "NAVY"
                : normalizedTitle === "11U DYB"
                  ? "GOLD"
                  : normalizedTitle.includes("SECOND TEAM")
                    ? "GOLD"
                    : "PURPLE";
          return { id: c.id, cycleName: `${c.seasonYear} - ${ageLabel} - ${color}` };
        });
        setCycles(mapped);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load cycles"))
      .finally(() => setLoading(false));
  }, [org, year]);

  function toggle(id: string) {
    setSelectedCycleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Choose which existing ballot cycles to pull unselected players from.
      </p>

      <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-2.5 text-sm flex items-center gap-2">
        <span className="text-zinc-500">Building:</span>
        <span className="font-semibold text-white">{year} – {targetAgeGroup} – {targetColor}</span>
        <span className="text-zinc-500">({ORG_LABELS[org]})</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm py-3">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          Loading cycles…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {!loading && !error && cycles.length === 0 && (
        <p className="text-zinc-500 text-sm italic py-2">No ballot cycles found for {ORG_LABELS[org]} {year}.</p>
      )}
      {!loading && cycles.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto rounded-lg border border-zinc-700/60 p-2">
          {cycles.map((c) => (
            <label key={c.id} className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer hover:bg-zinc-800/50 transition-colors">
              <input type="checkbox" checked={selectedCycleIds.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-zinc-600 bg-zinc-800 text-violet-600" />
              <span className="text-sm text-zinc-200">{c.cycleName}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors">
          ← Back
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onSaveDraft} disabled={selectedCycleIds.size === 0} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-40">
            Save Draft
          </button>
          <button type="button" disabled={selectedCycleIds.size === 0} onClick={onNext} className="rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 text-sm font-medium text-white transition-colors">
            Next: Pick Players →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Pick Players ─────────────────────────────────────────────────────

function Step3PickPlayers({
  year,
  targetAgeGroup,
  targetColor,
  feeCents,
  setFeeCents,
  sourceCycleIds,
  selectedIds,
  setSelectedIds,
  candidatesCache,
  setCandidatesCache,
  onBack,
  onSubmit,
  onSaveDraft,
  submitting,
  submitError,
}: {
  year: number;
  targetAgeGroup: string;
  targetColor: TeamColor;
  feeCents: number;
  setFeeCents: (v: number) => void;
  sourceCycleIds: string[];
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  candidatesCache: CandidateGroup[] | null;
  setCandidatesCache: (v: CandidateGroup[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Stable key to detect when source cycles actually changed
  const cycleKey = [...sourceCycleIds].sort().join(",");
  const lastFetchedKey = useRef<string | null>(null);

  useEffect(() => {
    // Only fetch if cache is empty or source cycles changed
    if (candidatesCache !== null && lastFetchedKey.current === cycleKey) return;
    lastFetchedKey.current = cycleKey;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ cycleIds: sourceCycleIds.join(",") });
    fetch(`/api/admin/all-star/payments/coach-roster/candidates?${params.toString()}`)
      .then((r) => r.json())
      .then((json: { candidatesByCycle?: CandidateGroup[] }) => {
        if (!json.candidatesByCycle) throw new Error("Failed to load candidates");
        setCandidatesCache(json.candidatesByCycle);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load candidates"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleKey]);

  const groups = candidatesCache ?? [];
  const allCandidates = groups.flatMap((g) => g.candidates);

  const filteredGroups = search.trim()
    ? groups
        .map((g) => ({
          ...g,
          candidates: g.candidates.filter(
            (c) =>
              c.playerFullName.toLowerCase().includes(search.toLowerCase()) ||
              c.team.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.candidates.length > 0)
    : groups;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(candidates: AvailableCandidate[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of candidates) {
        if (checked) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  const totalCandidates = allCandidates.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">
            Select players to add to{" "}
            <span className="text-white font-semibold">{year} – {targetAgeGroup} – {targetColor}</span>.
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">Showing unselected players only.</p>
        </div>
        {totalCandidates > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectedIds.size === allCandidates.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(allCandidates.map((c) => c.id)));
            }}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors shrink-0"
          >
            {selectedIds.size === allCandidates.length ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {totalCandidates > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name or team…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600 focus:outline-none"
        />
      )}

      {loading && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm py-3">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          Loading candidates…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {!loading && !error && totalCandidates === 0 && candidatesCache !== null && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
          No unselected candidates found in the chosen source cycles.
        </div>
      )}

      {filteredGroups.length > 0 && (
        <div className="space-y-3 max-h-72 overflow-y-auto rounded-lg border border-zinc-700/60 p-3">
          {filteredGroups.map((group) => {
            const allGroupSelected = group.candidates.every((c) => selectedIds.has(c.id));
            const someSelected = group.candidates.some((c) => selectedIds.has(c.id));
            return (
              <div key={group.cycleId}>
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    type="checkbox"
                    checked={allGroupSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allGroupSelected; }}
                    onChange={(e) => toggleGroup(group.candidates, e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-800 text-violet-600"
                  />
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{group.cycleName}</span>
                  <span className="text-xs text-zinc-600">
                    ({group.candidates.filter((c) => selectedIds.has(c.id)).length}/{group.candidates.length} selected)
                  </span>
                </div>
                <div className="space-y-0.5 ml-5">
                  {group.candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 rounded px-2 py-1.5 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="rounded border-zinc-600 bg-zinc-800 text-violet-600"
                      />
                      <span className="text-sm text-zinc-200 flex-1">{c.playerFullName}</span>
                      <span className="text-xs text-zinc-500">{c.team}</span>
                      {c.jerseyNumber && <span className="text-xs text-zinc-600">#{c.jerseyNumber}</span>}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-300">
              <span className="font-semibold text-white">{selectedIds.size}</span>{" "}
              player{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Fee per player:</label>
              <input
                type="number"
                min={0}
                step={100}
                value={(feeCents / 100).toFixed(2)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 0) setFeeCents(Math.round(v * 100));
                }}
                className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 text-right focus:border-violet-600 focus:outline-none"
              />
            </div>
          </div>
          <div className="text-xs text-zinc-500">
            Total to collect:{" "}
            <span className="text-zinc-300 font-medium">${((selectedIds.size * feeCents) / 100).toFixed(2)}</span>
          </div>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">{submitError}</div>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} disabled={submitting} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-40">
          ← Back
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onSaveDraft} disabled={submitting} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-40">
            Save Draft
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || submitting || loading}
            onClick={onSubmit}
            className="rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 text-sm font-semibold text-white transition-colors"
          >
            {submitting
              ? "Creating…"
              : `Create Roster & Seed ${selectedIds.size} Payment${selectedIds.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function CoachRosterBuilderModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const currentYear = new Date().getFullYear();

  // Step 1 state
  const [org, setOrg] = useState<OrgId>("gonzales");
  const [year, setYear] = useState(currentYear);
  const [ageGroup, setAgeGroup] = useState("");
  const [teamColor, setTeamColor] = useState<TeamColor>("GOLD");

  // Step 2 state
  const [selectedCycleIds, setSelectedCycleIds] = useState<Set<string>>(new Set());

  // Step 3 state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [feeCents, setFeeCents] = useState(9500);

  // Candidate cache (lifted from Step3 to avoid re-fetching on back/forward)
  const [candidatesCache, setCandidatesCache] = useState<CandidateGroup[] | null>(null);

  // Navigation
  const [step, setStep] = useState<Step>(1);

  // Draft state
  const [savedDrafts, setSavedDrafts] = useState<DraftState[]>([]);
  const [draftSavedFlash, setDraftSavedFlash] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ cycleName: string; count: number } | null>(null);

  // On mount: check for saved drafts
  useEffect(() => {
    const drafts = loadAllDrafts();
    if (drafts.length > 0) {
      setSavedDrafts(drafts);
      setStep("drafts");
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Current draft label (used for save)
  function getDraftLabel() {
    return `${year} – ${ageGroup.trim() || "…"} – ${teamColor}`;
  }

  function handleSaveDraft() {
    const draft: DraftState = {
      org,
      year,
      ageGroup: ageGroup.trim(),
      teamColor,
      sourceCycleIds: Array.from(selectedCycleIds),
      selectedPlayerIds: Array.from(selectedPlayerIds),
      savedAt: new Date().toISOString(),
      label: getDraftLabel(),
    };
    saveDraft(draft);
    setDraftSavedFlash(true);
    setTimeout(() => setDraftSavedFlash(false), 2000);
  }

  function handleResumeDraft(draft: DraftState) {
    setOrg(draft.org);
    setYear(draft.year);
    setAgeGroup(draft.ageGroup);
    setTeamColor(draft.teamColor);
    setSelectedCycleIds(new Set(draft.sourceCycleIds));
    setSelectedPlayerIds(new Set(draft.selectedPlayerIds));
    setCandidatesCache(null); // will re-fetch in step 3
    setStep(3);
  }

  function handleDiscardDraft(draft: DraftState) {
    discardDraft(draft);
    setSavedDrafts((prev) => prev.filter((d) => d.label !== draft.label || d.org !== draft.org));
    // If no drafts left, go to step 1
    if (savedDrafts.length <= 1) setStep(1);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const selectedCandidates = Array.from(selectedPlayerIds).map((id) => ({
        sourceCandidateId: id,
      }));

      const res = await fetch("/api/admin/all-star/payments/coach-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org,
          seasonYear: year,
          ageGroup: ageGroup.trim(),
          teamColor,
          allStarAgeGroupLabel: ageGroup.trim(),
          selectedCandidates,
          feeCents,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        cycleName?: string;
        playersCreated?: number;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setSubmitError(json.error ?? "Failed to create roster");
        return;
      }
      // Clear the draft on success
      clearDraft(org, year, ageGroup.trim(), teamColor);
      setSuccess({ cycleName: json.cycleName ?? "", count: json.playersCreated ?? 0 });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">Build Coach-Selected Roster</h2>
            {draftSavedFlash && (
              <span className="text-xs text-emerald-400 animate-pulse">✓ Draft saved</span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {success ? (
            <div className="text-center space-y-4 py-4">
              <div className="text-4xl">🎉</div>
              <div>
                <p className="text-white font-semibold text-base">{success.cycleName}</p>
                <p className="text-zinc-400 text-sm mt-1">
                  Created with{" "}
                  <span className="text-emerald-300 font-medium">{success.count} player</span>
                  {success.count !== 1 ? "s" : ""} and payment records seeded.
                </p>
              </div>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => { onSuccess(); onClose(); }}
                  className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors"
                >
                  View in Summary
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSuccess(null);
                    setStep(1);
                    setAgeGroup("");
                    setSelectedCycleIds(new Set());
                    setSelectedPlayerIds(new Set());
                    setCandidatesCache(null);
                    setFeeCents(9500);
                  }}
                  className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors"
                >
                  Build Another
                </button>
              </div>
            </div>
          ) : step === "drafts" ? (
            <DraftPickerStep
              drafts={savedDrafts}
              onResume={handleResumeDraft}
              onDiscard={handleDiscardDraft}
              onStartNew={() => setStep(1)}
            />
          ) : (
            <>
              <StepIndicator current={step} />
              {step === 1 && (
                <Step1TeamSetup
                  org={org}
                  setOrg={(v) => { setOrg(v); setCandidatesCache(null); }}
                  year={year}
                  setYear={(v) => { setYear(v); setCandidatesCache(null); }}
                  ageGroup={ageGroup}
                  setAgeGroup={setAgeGroup}
                  teamColor={teamColor}
                  setTeamColor={setTeamColor}
                  onNext={() => setStep(2)}
                />
              )}
              {step === 2 && (
                <Step2SourceCycles
                  org={org}
                  year={year}
                  targetAgeGroup={ageGroup}
                  targetColor={teamColor}
                  selectedCycleIds={selectedCycleIds}
                  setSelectedCycleIds={(v) => {
                    setSelectedCycleIds(v);
                    setCandidatesCache(null); // invalidate cache when source cycles change
                  }}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                  onSaveDraft={handleSaveDraft}
                />
              )}
              {step === 3 && (
                <Step3PickPlayers
                  year={year}
                  targetAgeGroup={ageGroup}
                  targetColor={teamColor}
                  feeCents={feeCents}
                  setFeeCents={setFeeCents}
                  sourceCycleIds={Array.from(selectedCycleIds)}
                  selectedIds={selectedPlayerIds}
                  setSelectedIds={setSelectedPlayerIds}
                  candidatesCache={candidatesCache}
                  setCandidatesCache={setCandidatesCache}
                  onBack={() => setStep(2)}
                  onSubmit={handleSubmit}
                  onSaveDraft={handleSaveDraft}
                  submitting={submitting}
                  submitError={submitError}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
