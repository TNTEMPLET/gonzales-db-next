"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Candidate = {
  id: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
};

type OpenResponse = {
  cycle: {
    id: string;
    organizationId: string;
    seasonYear: number;
    ageGroup: string;
    title: string | null;
    hasShowcase: boolean;
    status: string;
  };
  candidates: Candidate[];
  draft: Record<string, number>;
  hasSubmitted: boolean;
};

const REQUIRED_VOTES = 12;

export default function AllStarVotePage() {
  const [cycleId, setCycleId] = useState("");
  const [token, setToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<OpenResponse | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");

  const isLocked = Boolean(data?.hasSubmitted);
  const canRender = Boolean(cycleId);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCycleId(params.get("cycleId") || params.get("c") || "");
    setToken(params.get("token") || params.get("t") || "");
  }, []);

  const loadBallot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/all-star/vote/open?cycleId=${encodeURIComponent(cycleId)}&token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as OpenResponse | { error?: string };
      if (!response.ok) throw new Error("error" in json ? json.error : "Failed to open ballot");
      const payload = json as OpenResponse;
      setData(payload);
      setRatings(payload.draft || {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open ballot");
    } finally {
      setLoading(false);
    }
  }, [cycleId, token]);

  useEffect(() => {
    if (!canRender) {
      setLoading(false);
      setError("Missing cycleId in link.");
      return;
    }
    void loadBallot();
  }, [canRender, loadBallot]);

  async function saveDraft() {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/all-star/vote/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: data.cycle.id, token, ratings }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to save draft");
      setNotice("Draft saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setBusy(false);
    }
  }

  async function submitBallot() {
    if (!data) return;
    if (ratedCount !== REQUIRED_VOTES) {
      setError(`You must rate exactly ${REQUIRED_VOTES} candidates before submitting.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/all-star/vote/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: data.cycle.id, token, ratings }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to submit ballot");
      setNotice("Ballot submitted successfully.");
      await loadBallot();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit ballot");
    } finally {
      setBusy(false);
    }
  }

  const ratedCount = useMemo(
    () => Object.values(ratings).filter((rating) => rating >= 1 && rating <= 5).length,
    [ratings],
  );
  const filteredCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.candidates;
    return data.candidates.filter((candidate) => {
      return (
        candidate.playerFullName.toLowerCase().includes(query) ||
        candidate.team.toLowerCase().includes(query) ||
        candidate.jerseyNumber.toLowerCase().includes(query) ||
        String(candidate.showcaseBibNumber || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [candidateSearch, data]);
  const votedCandidates = useMemo(
    () => filteredCandidates.filter((candidate) => (ratings[candidate.id] || 0) >= 1),
    [filteredCandidates, ratings],
  );
  const unvotedCandidates = useMemo(
    () => filteredCandidates.filter((candidate) => !((ratings[candidate.id] || 0) >= 1)),
    [filteredCandidates, ratings],
  );
  const isVoteCountValid = ratedCount === REQUIRED_VOTES;

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-10">
      <section className="max-w-4xl mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">All-Star Ballot</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Rate each player from 1 to 5. Save your draft anytime and submit when final.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
        ) : null}
        {notice ? (
          <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div>
        ) : null}

        {loading ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">Loading ballot…</div>
        ) : null}

        {!loading && data ? (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-sm text-zinc-300">
                {data.cycle.organizationId.toUpperCase()} · {data.cycle.ageGroup} · {data.cycle.seasonYear}
                {data.cycle.title ? ` · ${data.cycle.title}` : ""}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Rated {ratedCount} of {data.candidates.length} players.
              </p>
              <p
                className={`text-xs mt-2 ${
                  isVoteCountValid ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                Vote Status: {ratedCount}/{REQUIRED_VOTES} selected
                {isVoteCountValid ? " (ready to submit)" : " (select exactly 12)"}
              </p>
              {isLocked ? (
                <p className="text-xs text-amber-300 mt-2">This ballot has already been submitted and is locked.</p>
              ) : null}
            </div>
            <input
              value={candidateSearch}
              onChange={(event) => setCandidateSearch(event.target.value)}
              placeholder="Search candidates by name, team, jersey, or bib"
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-4 py-2 border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                  Available Candidates ({unvotedCandidates.length})
                </div>
                {unvotedCandidates.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-zinc-500">
                    {filteredCandidates.length === 0
                      ? "No candidates match your search."
                      : "All visible candidates are selected."}
                  </p>
                ) : (
                  unvotedCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="px-4 py-3 border-b border-zinc-800 last:border-b-0 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {candidate.playerFullName} · {candidate.team}
                          {candidate.jerseyNumber?.trim() &&
                          !["tbd", "n/a", "na"].includes(candidate.jerseyNumber.trim().toLowerCase())
                            ? ` · #${candidate.jerseyNumber}`
                            : ""}
                          {data.cycle.hasShowcase && candidate.showcaseBibNumber
                            ? ` · Bib ${candidate.showcaseBibNumber}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={busy || isLocked}
                            onClick={() => setRatings((prev) => ({ ...prev, [candidate.id]: value }))}
                            className="h-8 w-8 rounded-md border text-sm border-zinc-700 text-zinc-300 disabled:opacity-50"
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-4 py-2 border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                  Selected Candidates ({votedCandidates.length})
                </div>
                {votedCandidates.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-zinc-500">No selected candidates yet.</p>
                ) : (
                  votedCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="px-4 py-3 border-b border-zinc-800 last:border-b-0 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {candidate.playerFullName} · {candidate.team}
                          {candidate.jerseyNumber?.trim() &&
                          !["tbd", "n/a", "na"].includes(candidate.jerseyNumber.trim().toLowerCase())
                            ? ` · #${candidate.jerseyNumber}`
                            : ""}
                          {data.cycle.hasShowcase && candidate.showcaseBibNumber
                            ? ` · Bib ${candidate.showcaseBibNumber}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={busy || isLocked}
                            onClick={() => setRatings((prev) => ({ ...prev, [candidate.id]: value }))}
                            className={`h-8 w-8 rounded-md border text-sm ${
                              ratings[candidate.id] === value
                                ? "border-brand-purple bg-brand-purple/20 text-brand-purple"
                                : "border-zinc-700 text-zinc-300"
                            } disabled:opacity-50`}
                          >
                            {value}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={busy || isLocked}
                          onClick={() =>
                            setRatings((prev) => {
                              const next = { ...prev };
                              delete next[candidate.id];
                              return next;
                            })
                          }
                          className="ml-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || isLocked}
                onClick={() => void saveDraft()}
                className="rounded-lg border border-zinc-600 text-zinc-200 px-4 py-2 text-sm disabled:opacity-60"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={busy || isLocked || !isVoteCountValid}
                onClick={() => void submitBallot()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Submit Final Ballot
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
