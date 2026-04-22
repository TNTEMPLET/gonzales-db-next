"use client";

import { useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ContentOrgId } from "@/lib/siteConfig";

type GameRow = {
  gameExternalId: string;
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
  targetOrg: ContentOrgId;
};

type ScoreState = {
  homeScore: string;
  awayScore: string;
};

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
  targetOrg,
}: Props) {
  const router = useRouter();
  const orgQuery = `org=${targetOrg}`;
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
      const response = await fetch(`/api/admin/scores?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameExternalId: game.gameExternalId,
          ageGroup: game.ageGroup,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          gameDate: game.gameDate,
          gameStatus: game.status,
          homeScore,
          awayScore,
        }),
      });

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

  async function handleCsvUpload(file: File) {
    setImportBusy(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/admin/scores/import?${orgQuery}`, {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as {
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
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
                void handleCsvUpload(file);
              }
            }}
          />
          <button
            type="button"
            disabled={importBusy}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs rounded-lg border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-3 py-2 disabled:opacity-60"
          >
            {importBusy ? "Importing..." : "Upload Scores CSV"}
          </button>
        </div>

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
