"use client";

import { useRef, useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";

import {
  assignrScopeToQueryParam,
  type AdminAssignrScope,
} from "@/lib/admin/assignrOrgScope";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

type GameRow = {
  gameExternalId: string;
  organizationId: ContentOrgId;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string | null;
  status: string;
  venue: string | null;
  subvenue: string | null;
};

type ExistingScore = {
  gameExternalId: string;
  homeScore: number;
  awayScore: number;
};

type Props = {
  games: GameRow[];
  existingScores: ExistingScore[];
  scope: AdminAssignrScope;
};

type ScoreState = {
  homeScore: string;
  awayScore: string;
};

type VenueCatalogEntry = {
  venue: string;
  subVenue: string;
};

type ScoresFieldOption = {
  sourcePark: string;
  sourceField: string;
  key: string;
};

type ScoresImportPreviewSample = {
  rowNumber: number;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  startTime: string;
  location: string;
  field: string;
  homeScore: number | null;
  awayScore: number | null;
  outcome:
    | "matched"
    | "unmatched"
    | "skippedMissingScore"
    | "skippedRainedOut";
  matchedGameId?: string;
  matchedSubVenue?: string;
};

type ScoresImportPreview = {
  rowCount: number;
  parks: string[];
  fields: ScoresFieldOption[];
  venues: string[];
  venueCatalog: VenueCatalogEntry[];
  suggestedMappings: {
    parkMappings: Record<string, string>;
    fieldMappings: Record<string, string>;
  };
  summary: {
    processed: number;
    matched: number;
    unmatched: number;
    skippedMissingScore: number;
    skippedRainedOut: number;
  };
  samples: {
    matched: ScoresImportPreviewSample[];
    unmatched: ScoresImportPreviewSample[];
    skippedMissingScore: ScoresImportPreviewSample[];
    skippedRainedOut: ScoresImportPreviewSample[];
  };
  error?: string;
};

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

function formatGameDate(value: string | null) {
  if (!value) return "Date TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date TBD";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAgeGroupSortValue(ageGroup: string) {
  const normalized = ageGroup.trim().toUpperCase();
  const numericMatch =
    normalized.match(/^(\d+)\s*U$/) || normalized.match(/^(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : Number.POSITIVE_INFINITY;
}

function sortAgeGroups(a: string, b: string) {
  const aValue = getAgeGroupSortValue(a);
  const bValue = getAgeGroupSortValue(b);
  if (aValue !== bValue) return aValue - bValue;
  return a.localeCompare(b);
}

export default function AdminScoresManager({
  games,
  existingScores,
  scope,
}: Props) {
  const router = useRouter();
  const orgQuery = assignrScopeToQueryParam(scope);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialScoresMap = useMemo(() => {
    const map = new Map<string, ScoreState>();
    for (const score of existingScores) {
      map.set(score.gameExternalId, {
        homeScore: String(score.homeScore),
        awayScore: String(score.awayScore),
      });
    }
    return map;
  }, [existingScores]);

  const [scores, setScores] = useState<Record<string, ScoreState>>(() => {
    const mapEntries = Array.from(initialScoresMap.entries()).map(
      ([gameExternalId, value]) => [gameExternalId, value] as const,
    );
    return Object.fromEntries(mapEntries);
  });
  const [lockedScores, setLockedScores] = useState<Record<string, boolean>>(
    () => {
      const entries = existingScores.map((score) => [
        score.gameExternalId,
        true,
      ]);
      return Object.fromEntries(entries);
    },
  );
  const [savedGameIds, setSavedGameIds] = useState<Record<string, boolean>>(
    () => {
      const entries = existingScores.map((score) => [
        score.gameExternalId,
        true,
      ]);
      return Object.fromEntries(entries);
    },
  );
  const [activeAgeGroup, setActiveAgeGroup] = useState<string>("");
  const [savingGameId, setSavingGameId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ScoresImportPreview | null>(
    null,
  );
  const [parkMappings, setParkMappings] = useState<Record<string, string>>({});
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const subVenueOptionsByVenue = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of importPreview?.venueCatalog ?? []) {
      const current = map.get(entry.venue) ?? [];
      if (!current.includes(entry.subVenue)) {
        current.push(entry.subVenue);
      }
      map.set(entry.venue, current);
    }
    for (const [venue, values] of map.entries()) {
      map.set(
        venue,
        values.sort((a, b) => a.localeCompare(b)),
      );
    }
    return map;
  }, [importPreview?.venueCatalog]);

  const missingParks = useMemo(() => {
    return (importPreview?.parks ?? []).filter((park) => !parkMappings[park]?.trim());
  }, [importPreview?.parks, parkMappings]);

  const missingFields = useMemo(() => {
    return (importPreview?.fields ?? []).filter(
      (field) => !fieldMappings[field.key]?.trim(),
    );
  }, [fieldMappings, importPreview?.fields]);

  const nonRainoutGames = useMemo(
    () => games.filter((game) => game.status !== "C"),
    [games],
  );

  const ageGroups = useMemo(() => {
    const groups = Array.from(
      new Set(nonRainoutGames.map((game) => game.ageGroup)),
    ).sort(sortAgeGroups);
    return groups;
  }, [nonRainoutGames]);

  const selectedAgeGroup = activeAgeGroup || ageGroups[0] || "";

  const filteredGames = useMemo(() => {
    const source = selectedAgeGroup
      ? nonRainoutGames.filter((game) => game.ageGroup === selectedAgeGroup)
      : nonRainoutGames;

    return [...source].sort((a, b) => {
      const aDate = a.gameDate ? new Date(a.gameDate).valueOf() : Infinity;
      const bDate = b.gameDate ? new Date(b.gameDate).valueOf() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return `${a.homeTeam} ${a.awayTeam}`.localeCompare(
        `${b.homeTeam} ${b.awayTeam}`,
      );
    });
  }, [nonRainoutGames, selectedAgeGroup]);

  const { unscoredGames, scoredGames } = useMemo(() => {
    const unscored: GameRow[] = [];
    const scored: GameRow[] = [];

    for (const game of filteredGames) {
      const hasSavedScore = Boolean(savedGameIds[game.gameExternalId]);

      if (hasSavedScore) {
        scored.push(game);
      } else {
        unscored.push(game);
      }
    }

    return { unscoredGames: unscored, scoredGames: scored };
  }, [filteredGames, savedGameIds]);

  const ageGroupUnscoredCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const game of nonRainoutGames) {
      const hasSavedScore = Boolean(savedGameIds[game.gameExternalId]);

      if (!hasSavedScore) {
        counts[game.ageGroup] = (counts[game.ageGroup] || 0) + 1;
      }
    }

    return counts;
  }, [nonRainoutGames, savedGameIds]);

  function updateScore(
    gameExternalId: string,
    side: "homeScore" | "awayScore",
    value: string,
  ) {
    if (!/^\d*$/.test(value)) return;
    setScores((prev) => ({
      ...prev,
      [gameExternalId]: {
        homeScore: prev[gameExternalId]?.homeScore ?? "",
        awayScore: prev[gameExternalId]?.awayScore ?? "",
        [side]: value,
      },
    }));
  }

  async function saveScore(game: GameRow) {
    if (game.status !== "A") {
      setError("Rained-Out games cannot be scored.");
      setNotice("");
      return;
    }

    const row = scores[game.gameExternalId] || { homeScore: "", awayScore: "" };
    const homeScore = Number(row.homeScore);
    const awayScore = Number(row.awayScore);

    if (
      row.homeScore === "" ||
      row.awayScore === "" ||
      Number.isNaN(homeScore) ||
      Number.isNaN(awayScore)
    ) {
      setError("Both scores are required.");
      setNotice("");
      return;
    }

    setSavingGameId(game.gameExternalId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        orgQuery ? `/api/admin/scores?${orgQuery}` : "/api/admin/scores",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameExternalId: game.gameExternalId,
          organizationId: game.organizationId,
          ageGroup: game.ageGroup,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          gameDate: game.gameDate,
          gameStatus: game.status,
          homeScore,
          awayScore,
        }),
      },
      );

      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          json && "error" in json ? json.error : "Failed to save score",
        );
      }

      setNotice(
        `Saved score: ${game.homeTeam} ${homeScore} - ${awayScore} ${game.awayTeam}`,
      );
      setLockedScores((prev) => ({
        ...prev,
        [game.gameExternalId]: true,
      }));
      setSavedGameIds((prev) => ({
        ...prev,
        [game.gameExternalId]: true,
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save score");
    } finally {
      setSavingGameId(null);
    }
  }

  function downloadTemplate() {
    window.location.href = "/api/admin/scores/template";
  }

  function resetImportState() {
    setUploadedFile(null);
    setImportPreview(null);
    setParkMappings({});
    setFieldMappings({});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleImportPreview(file: File) {
    setImportBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        orgQuery
          ? `/api/admin/scores/import/preview?${orgQuery}`
          : "/api/admin/scores/import/preview",
        {
          method: "POST",
          body: formData,
        },
      );
      const json = (await safeJson(response)) as ScoresImportPreview;
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to preview scores import"));
      }

      setUploadedFile(file);
      setImportPreview(json);
      setParkMappings(json.suggestedMappings.parkMappings ?? {});
      setFieldMappings(json.suggestedMappings.fieldMappings ?? {});
      setNotice(
        `Parsed ${json.rowCount} rows. Matched ${json.summary.matched}, unmatched ${json.summary.unmatched}, missing scores ${json.summary.skippedMissingScore}, rained-out skipped ${json.summary.skippedRainedOut}.`,
      );
    } catch (err: unknown) {
      resetImportState();
      setError(
        err instanceof Error ? err.message : "Failed to preview scores import",
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function handleConfirmImport() {
    if (!uploadedFile) {
      setError("Upload a scores file before importing.");
      return;
    }
    if (missingParks.length > 0 || missingFields.length > 0) {
      setError("Complete park and field mappings before importing.");
      return;
    }

    setImportBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      formData.append("parkMappings", JSON.stringify(parkMappings));
      formData.append("fieldMappings", JSON.stringify(fieldMappings));

      const response = await fetch(
        orgQuery
          ? `/api/admin/scores/import?${orgQuery}`
          : "/api/admin/scores/import",
        {
          method: "POST",
          body: formData,
        },
      );
      const json = (await safeJson(response)) as {
        error?: string;
        processed?: number;
        matched?: number;
        saved?: number;
        unmatched?: number;
        skippedMissingScore?: number;
        skippedRainedOut?: number;
      };

      if (!response.ok) {
        throw new Error(json.error || "Failed to import CSV");
      }

      setNotice(
        `Import complete. Processed ${json.processed || 0}, matched ${json.matched || 0}, saved ${json.saved || 0}, unmatched ${json.unmatched || 0}, missing scores ${json.skippedMissingScore || 0}, rained-out skipped ${json.skippedRainedOut || 0}.`,
      );
      resetImportState();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-3 py-2"
          >
            Download Template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportPreview(file);
              }
            }}
          />
          <button
            type="button"
            disabled={importBusy}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-2 disabled:opacity-60"
          >
            {importBusy ? "Working..." : "Upload Scores CSV"}
          </button>
          {importPreview ? (
            <button
              type="button"
              disabled={importBusy}
              onClick={resetImportState}
              className="text-xs rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-3 py-2 disabled:opacity-60"
            >
              Cancel import
            </button>
          ) : null}
        </div>

        {importPreview ? (
          <ScoresImportMappingPanel
            fields={importPreview.fields}
            fieldMappings={fieldMappings}
            missingFields={missingFields}
            missingParks={missingParks}
            parkMappings={parkMappings}
            parks={importPreview.parks}
            setFieldMappings={setFieldMappings}
            setParkMappings={setParkMappings}
            subVenueOptionsByVenue={subVenueOptionsByVenue}
            summary={importPreview.summary}
            venues={importPreview.venues}
          />
        ) : null}

        {importPreview ? (
        <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                importBusy || missingParks.length > 0 || missingFields.length > 0
              }
              onClick={() => void handleConfirmImport()}
              className="text-xs rounded-lg border border-emerald-600 text-emerald-300 hover:bg-emerald-900/20 px-3 py-2 disabled:opacity-60"
            >
              {importBusy ? "Importing..." : "Confirm import"}
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {ageGroups.map((ageGroup) =>
            (() => {
              const hasZeroUnscored =
                (ageGroupUnscoredCounts[ageGroup] || 0) === 0;

              return (
                <button
                  key={ageGroup}
                  type="button"
                  onClick={() => setActiveAgeGroup(ageGroup)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold tracking-wide border transition ${
                    hasZeroUnscored
                      ? selectedAgeGroup === ageGroup
                        ? "border-emerald-400 text-emerald-300 bg-emerald-900/30"
                        : "border-emerald-700 text-emerald-300 hover:bg-emerald-900/20"
                      : selectedAgeGroup === ageGroup
                        ? "border-brand-gold text-brand-gold bg-brand-gold/10"
                        : "border-brand-gold/70 text-brand-gold hover:bg-brand-gold/10"
                  }`}
                >
                  {ageGroup}
                </button>
              );
            })(),
          )}
        </div>

        <div className="max-h-152 overflow-auto rounded-lg border border-zinc-800">
          {filteredGames.length === 0 ? (
            <p className="text-zinc-500 text-sm p-4">
              No games found for this age group.
            </p>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                  Unscored Games ({unscoredGames.length})
                </p>
              </div>
              {unscoredGames.length === 0 ? (
                <p className="text-zinc-500 text-sm p-4 border-b border-zinc-800">
                  No unscored games in this age group.
                </p>
              ) : (
                unscoredGames.map((game) => {
                  const isCancelled = game.status === "C";
                  const isLocked = Boolean(lockedScores[game.gameExternalId]);
                  const canEditScore = game.status === "A" && !isLocked;
                  const row = scores[game.gameExternalId] || {
                    homeScore: "",
                    awayScore: "",
                  };

                  return (
                    <div
                      key={game.gameExternalId}
                      className="grid gap-3 px-3 py-3 border-b border-zinc-800 md:grid-cols-[1.3fr_210px_100px]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {game.homeTeam} vs {game.awayTeam}
                        </p>
                        {scope === "all" ? (
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                            {getOrgDisplayName(game.organizationId)}
                          </p>
                        ) : null}
                        <p className="text-xs text-zinc-500">
                          {formatGameDate(game.gameDate)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {[game.venue, game.subvenue]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                          {isCancelled ? (
                            <span className="ml-2 text-red-400 font-semibold uppercase tracking-wide">
                              Rained-Out
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.homeScore}
                          disabled={!canEditScore}
                          onChange={(event) =>
                            updateScore(
                              game.gameExternalId,
                              "homeScore",
                              event.target.value,
                            )
                          }
                          placeholder="Home"
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
                        />
                        <span className="text-zinc-500">-</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.awayScore}
                          disabled={!canEditScore}
                          onChange={(event) =>
                            updateScore(
                              game.gameExternalId,
                              "awayScore",
                              event.target.value,
                            )
                          }
                          placeholder="Away"
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={
                          savingGameId === game.gameExternalId ||
                          game.status !== "A"
                        }
                        onClick={() => {
                          if (game.status !== "A") return;

                          if (isLocked) {
                            setError("");
                            setNotice("");
                            setLockedScores((prev) => ({
                              ...prev,
                              [game.gameExternalId]: false,
                            }));
                            return;
                          }

                          void saveScore(game);
                        }}
                        className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-2 disabled:opacity-60"
                      >
                        {game.status !== "A"
                          ? "Rained-Out"
                          : isLocked
                            ? "Edit"
                            : savingGameId === game.gameExternalId
                              ? "Saving..."
                              : "Save"}
                      </button>
                    </div>
                  );
                })
              )}

              <div className="px-3 py-2 border-y border-zinc-800 bg-zinc-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                  Scored Games ({scoredGames.length})
                </p>
              </div>
              {scoredGames.length === 0 ? (
                <p className="text-zinc-500 text-sm p-4">
                  No scored games in this age group yet.
                </p>
              ) : (
                scoredGames.map((game) => {
                  const isCancelled = game.status === "C";
                  const isLocked = Boolean(lockedScores[game.gameExternalId]);
                  const canEditScore = game.status === "A" && !isLocked;
                  const row = scores[game.gameExternalId] || {
                    homeScore: "",
                    awayScore: "",
                  };

                  return (
                    <div
                      key={game.gameExternalId}
                      className="grid gap-3 px-3 py-3 border-b border-zinc-800 last:border-b-0 md:grid-cols-[1.3fr_210px_100px]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {game.homeTeam} vs {game.awayTeam}
                        </p>
                        {scope === "all" ? (
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                            {getOrgDisplayName(game.organizationId)}
                          </p>
                        ) : null}
                        <p className="text-xs text-zinc-500">
                          {formatGameDate(game.gameDate)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {[game.venue, game.subvenue]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                          {isCancelled ? (
                            <span className="ml-2 text-red-400 font-semibold uppercase tracking-wide">
                              Rained-Out
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.homeScore}
                          disabled={!canEditScore}
                          onChange={(event) =>
                            updateScore(
                              game.gameExternalId,
                              "homeScore",
                              event.target.value,
                            )
                          }
                          placeholder="Home"
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
                        />
                        <span className="text-zinc-500">-</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.awayScore}
                          disabled={!canEditScore}
                          onChange={(event) =>
                            updateScore(
                              game.gameExternalId,
                              "awayScore",
                              event.target.value,
                            )
                          }
                          placeholder="Away"
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={
                          savingGameId === game.gameExternalId ||
                          game.status !== "A"
                        }
                        onClick={() => {
                          if (game.status !== "A") return;

                          if (isLocked) {
                            setError("");
                            setNotice("");
                            setLockedScores((prev) => ({
                              ...prev,
                              [game.gameExternalId]: false,
                            }));
                            return;
                          }

                          void saveScore(game);
                        }}
                        className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-2 disabled:opacity-60"
                      >
                        {game.status !== "A"
                          ? "Rained-Out"
                          : isLocked
                            ? "Edit"
                            : savingGameId === game.gameExternalId
                              ? "Saving..."
                              : "Save"}
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ScoresImportMappingPanel(props: {
  summary: ScoresImportPreview["summary"];
  parks: string[];
  venues: string[];
  fields: ScoresFieldOption[];
  parkMappings: Record<string, string>;
  setParkMappings: Dispatch<SetStateAction<Record<string, string>>>;
  fieldMappings: Record<string, string>;
  setFieldMappings: Dispatch<SetStateAction<Record<string, string>>>;
  subVenueOptionsByVenue: Map<string, string[]>;
  missingParks: string[];
  missingFields: ScoresFieldOption[];
}) {
  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Processed</p>
          <p className="font-semibold text-zinc-100">{props.summary.processed}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Matched</p>
          <p className="font-semibold text-emerald-300">{props.summary.matched}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Unmatched</p>
          <p className="font-semibold text-amber-300">{props.summary.unmatched}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Missing scores
          </p>
          <p className="font-semibold text-zinc-100">
            {props.summary.skippedMissingScore}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Rained-out skipped
          </p>
          <p className="font-semibold text-zinc-100">
            {props.summary.skippedRainedOut}
          </p>
        </div>
      </div>

      {props.parks.length > 0 || props.fields.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {props.parks.length > 0 ? (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
                  Park to venue mapping
                </h3>
                {props.missingParks.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-300">
                    {props.missingParks.length} park label
                    {props.missingParks.length === 1 ? "" : "s"} still need a
                    venue.
                  </p>
                ) : null}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-950">
                  <tr className="text-left text-zinc-400">
                    <th className="px-4 py-2">Imported park</th>
                    <th className="px-4 py-2">Assignr venue</th>
                  </tr>
                </thead>
                <tbody>
                  {props.parks.map((park) => (
                    <tr key={park} className="border-t border-zinc-800">
                      <td className="px-4 py-2">{park}</td>
                      <td className="px-4 py-2">
                        <select
                          value={props.parkMappings[park] || ""}
                          onChange={(event) =>
                            props.setParkMappings((current) => ({
                              ...current,
                              [park]: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                        >
                          <option value="">Select venue…</option>
                          {props.venues.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {props.fields.length > 0 ? (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
                  Field to sub-venue mapping
                </h3>
                {props.missingFields.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-300">
                    {props.missingFields.length} field label
                    {props.missingFields.length === 1 ? "" : "s"} still need a
                    sub-venue.
                  </p>
                ) : null}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-950">
                  <tr className="text-left text-zinc-400">
                    <th className="px-4 py-2">Imported field</th>
                    <th className="px-4 py-2">Assignr sub-venue</th>
                  </tr>
                </thead>
                <tbody>
                  {props.fields.map((field) => {
                    const mappedVenue = props.parkMappings[field.sourcePark] || "";
                    const scopedOptions = mappedVenue
                      ? props.subVenueOptionsByVenue.get(mappedVenue) ?? []
                      : Array.from(props.subVenueOptionsByVenue.values()).flat();

                    return (
                      <tr key={field.key} className="border-t border-zinc-800">
                        <td className="px-4 py-2">
                          <div>{field.sourceField}</div>
                          <div className="text-xs text-zinc-500">
                            {field.sourcePark}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={props.fieldMappings[field.key] || ""}
                            onChange={(event) =>
                              props.setFieldMappings((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                          >
                            <option value="">Select sub-venue…</option>
                            {scopedOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          No park or field labels were found in the upload. Matching will use
          match IDs and team/date/time fallbacks.
        </p>
      )}
    </div>
  );
}
