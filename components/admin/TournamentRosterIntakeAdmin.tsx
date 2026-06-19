"use client";

import { useEffect, useMemo, useState } from "react";

import type { RosterPlayerInput } from "@/lib/tournament-rosters/csv";

type SubmissionPlayer = RosterPlayerInput & { id: string; rowNumber: number };
type Submission = {
  id: string;
  status: string;
  source: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterPhone: string | null;
  notes: string | null;
  originalFilename: string | null;
  createdAt: string;
  players: SubmissionPlayer[];
};
type LinkRow = {
  id: string;
  teamName: string;
  ageGroup: string | null;
  status: string;
  updatedAt: string;
  submissions: Submission[];
};

type Props = {
  organizationId: string;
  seasonYear: number;
  bracketProjectId: string;
  teams: string[];
  ageGroup?: string | null;
};

type CreatedLink = { linkId: string; teamName: string; publicUrl: string };

function latestSubmission(link: LinkRow): Submission | null {
  return link.submissions[0] ?? null;
}

async function readRosterApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`Empty response from roster API (HTTP ${res.status}).`);
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Roster API returned non-JSON (HTTP ${res.status}): ${trimmed.slice(0, 180)}`);
  }
}

export default function TournamentRosterIntakeAdmin({
  organizationId,
  seasonYear,
  bracketProjectId,
  teams,
  ageGroup,
}: Props) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [createdLinks, setCreatedLinks] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, RosterPlayerInput[]>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const linkedTeams = useMemo(() => new Set(links.map((link) => link.teamName)), [links]);
  const missingTeams = teams.filter((team) => !linkedTeams.has(team));

  async function loadLinks() {
    if (!bracketProjectId) return;
    const qs = new URLSearchParams({ organizationId, seasonYear: String(seasonYear), bracketProjectId });
    const res = await fetch(`/api/admin/tournament-rosters/links?${qs.toString()}`, { cache: "no-store" });
    const json = await readRosterApiJson<{ data?: LinkRow[]; error?: string }>(res);
    if (!res.ok) throw new Error(json.error ?? `Could not load roster links (${res.status})`);
    setLinks(json.data ?? []);
    const nextDrafts: Record<string, RosterPlayerInput[]> = {};
    for (const link of json.data ?? []) {
      const sub = latestSubmission(link);
      if (sub) {
        nextDrafts[sub.id] = sub.players.map((p) => ({
          firstName: p.firstName,
          lastName: p.lastName,
          jerseyNumber: p.jerseyNumber,
        }));
      }
    }
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadLinks().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, seasonYear, bracketProjectId]);

  async function generateMissingLinks() {
    if (!missingTeams.length) {
      setNotice("All visible bracket teams already have roster links.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tournament-rosters/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          seasonYear,
          bracketProjectId,
          teams: missingTeams.map((teamName) => ({ teamName, ageGroup })),
        }),
      });
      const json = await readRosterApiJson<{ data?: { links: LinkRow[]; created: CreatedLink[] }; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Could not generate links (${res.status})`);
      setLinks(json.data?.links ?? []);
      setCreatedLinks((prev) => {
        const next = { ...prev };
        for (const item of json.data?.created ?? []) next[item.linkId] = item.publicUrl;
        return next;
      });
      setNotice(`Generated ${json.data?.created.length ?? 0} roster link(s). Copy them now or regenerate later.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateLink(linkId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tournament-rosters/links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, action: "regenerate" }),
      });
      const json = await readRosterApiJson<{ data?: { link: LinkRow; publicUrl: string }; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Could not regenerate link (${res.status})`);
      if (json.data) {
        setCreatedLinks((prev) => ({ ...prev, [linkId]: json.data!.publicUrl }));
        await loadLinks();
      }
      setNotice("Roster link regenerated. Copy the new link now.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(submissionId: string, index: number, patch: Partial<RosterPlayerInput>) {
    setDrafts((prev) => ({
      ...prev,
      [submissionId]: (prev[submissionId] ?? []).map((player, i) => (i === index ? { ...player, ...patch } : player)),
    }));
  }

  async function reviewSubmission(submissionId: string, action: "approve" | "reject" | "reopen") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tournament-rosters/submissions/${encodeURIComponent(submissionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, players: drafts[submissionId] }),
      });
      const json = await readRosterApiJson<{ error?: string; errors?: string[] }>(res);
      if (!res.ok) throw new Error(json.errors?.join("\n") || json.error || `Review failed (${res.status})`);
      await loadLinks();
      setNotice(action === "approve" ? "Roster approved." : action === "reject" ? "Roster rejected." : "Roster reopened.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-sky-900/70 bg-sky-950/20">
      <summary className="cursor-pointer list-none p-4 text-xs font-semibold uppercase tracking-wide text-sky-200 marker:content-none [&::-webkit-details-marker]:hidden">
        GameChanger roster intake
        <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-sky-200/70">
          Link-only upload and review queue
        </span>
      </summary>
      <div className="space-y-4 border-t border-sky-900/60 p-4 sm:p-5">
        <p className="text-xs leading-relaxed text-zinc-400">
          Generate one private no-login link per team. Coaches submit first name, last name, and jersey number; submissions stay pending until approved.
        </p>
        {notice ? <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-2 text-xs text-emerald-200">{notice}</p> : null}
        {error ? <p className="rounded-lg border border-red-800 bg-red-950/30 p-2 text-xs text-red-200 whitespace-pre-wrap">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !teams.length} onClick={() => void generateMissingLinks()} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-40">
            Generate missing team links
          </button>
          <button type="button" disabled={busy} onClick={() => void loadLinks()} className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
            Refresh queue
          </button>
          <a href={`/api/admin/tournament-rosters/export?organizationId=${encodeURIComponent(organizationId)}&seasonYear=${seasonYear}&bracketProjectId=${encodeURIComponent(bracketProjectId)}`} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950/40">
            Export all approved
          </a>
        </div>
        {!teams.length ? <p className="text-xs text-amber-300">No concrete teams found in this bracket yet.</p> : null}
        <div className="space-y-3">
          {links.map((link) => {
            const submission = latestSubmission(link);
            const draft = submission ? drafts[submission.id] ?? [] : [];
            const publicUrl = createdLinks[link.id];
            return (
              <div key={link.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-100">{link.teamName}</h4>
                    <p className="text-xs text-zinc-500">Link {link.status} · Latest submission: {submission?.status ?? "none"}</p>
                    {publicUrl ? <input readOnly value={publicUrl} className="mt-2 w-full min-w-[18rem] rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-[11px] text-zinc-200" onFocus={(e) => e.currentTarget.select()} /> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {publicUrl ? (
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(publicUrl)} className="rounded-lg border border-zinc-600 px-2 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800">Copy link</button>
                    ) : null}
                    <button type="button" disabled={busy} onClick={() => void regenerateLink(link.id)} className="rounded-lg border border-zinc-600 px-2 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">Regenerate link</button>
                    {submission?.status === "APPROVED" ? (
                      <a href={`/api/admin/tournament-rosters/export?linkId=${encodeURIComponent(link.id)}`} className="rounded-lg bg-emerald-700 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-600">Export CSV</a>
                    ) : null}
                  </div>
                </div>
                {submission ? (
                  <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                    <p className="text-xs text-zinc-500">
                      Submitted {new Date(submission.createdAt).toLocaleString()} via {submission.source}
                      {submission.submitterName ? ` by ${submission.submitterName}` : ""}
                    </p>
                    <div className="grid grid-cols-[1fr_1fr_5rem] gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
                      <span>First</span><span>Last</span><span>#</span>
                    </div>
                    {draft.map((player, index) => (
                      <div key={index} className="grid grid-cols-[1fr_1fr_5rem] gap-2">
                        <input value={player.firstName} disabled={submission.status === "APPROVED" || busy} onChange={(e) => updateDraft(submission.id, index, { firstName: e.target.value })} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm" />
                        <input value={player.lastName} disabled={submission.status === "APPROVED" || busy} onChange={(e) => updateDraft(submission.id, index, { lastName: e.target.value })} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm" />
                        <input value={player.jerseyNumber} disabled={submission.status === "APPROVED" || busy} onChange={(e) => updateDraft(submission.id, index, { jerseyNumber: e.target.value })} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm" />
                      </div>
                    ))}
                    {submission.notes ? <p className="text-xs text-zinc-400">Notes: {submission.notes}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      {submission.status !== "APPROVED" ? <button type="button" disabled={busy} onClick={() => void reviewSubmission(submission.id, "approve")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-40">Approve</button> : null}
                      {submission.status !== "REJECTED" ? <button type="button" disabled={busy} onClick={() => void reviewSubmission(submission.id, "reject")} className="rounded-lg border border-red-800 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/40 disabled:opacity-40">Reject</button> : null}
                      {submission.status !== "PENDING" ? <button type="button" disabled={busy} onClick={() => void reviewSubmission(submission.id, "reopen")} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">Reopen</button> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
