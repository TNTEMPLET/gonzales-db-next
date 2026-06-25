"use client";

import { useEffect, useMemo, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";
import { formatOrganizationIdDisplay } from "@/lib/siteConfig";

type RolePreference = "HEAD_COACH" | "ASSISTANT_COACH" | "EITHER";
type SubmissionStatus = "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED";

type Submission = {
  id: string;
  status: SubmissionStatus;
  firstName: string;
  lastName: string;
  email: string;
  cellPhone: string;
  interestedDivision: string;
  rolePreference: RolePreference;
  hasCoachedBefore: boolean;
  priorDivision: string | null;
  notes: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

const statusLabels: Record<SubmissionStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  NOT_INTERESTED: "Not Interested",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

const roleLabels: Record<RolePreference, string> = {
  HEAD_COACH: "Head Coach",
  ASSISTANT_COACH: "Assistant Coach",
  EITHER: "Either",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminCoachingInterestManager({ targetOrg }: { targetOrg: ContentOrgId }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState<"" | SubmissionStatus>("");
  const [rolePreference, setRolePreference] = useState<"" | RolePreference>("");
  const [division, setDivision] = useState("");
  const [search, setSearch] = useState("");
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ org: targetOrg });
    if (status) params.set("status", status);
    if (rolePreference) params.set("rolePreference", rolePreference);
    if (division.trim()) params.set("division", division.trim());
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [division, rolePreference, search, status, targetOrg]);

  const counts = useMemo(() => {
    return submissions.reduce(
      (acc, submission) => {
        acc[submission.status] += 1;
        return acc;
      },
      { NEW: 0, CONTACTED: 0, NOT_INTERESTED: 0, CONVERTED: 0, ARCHIVED: 0 } as Record<SubmissionStatus, number>,
    );
  }, [submissions]);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/coaching-interest?${queryString}`, { cache: "no-store" });
      const json = (await response.json()) as { data?: Submission[]; error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to load coaching interest.");
      const rows = Array.isArray(json.data) ? json.data : [];
      setSubmissions(rows);
      setNotesById(Object.fromEntries(rows.map((row) => [row.id, row.adminNotes || ""])));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load coaching interest.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  async function updateSubmission(id: string, nextStatus?: SubmissionStatus) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/coaching-interest?org=${targetOrg}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: nextStatus,
          adminNotes: notesById[id] ?? "",
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Failed to update submission.");
      setNotice("Submission updated.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update submission.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      {error ? <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div> : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Coach Pipeline</h2>
            <p className="text-sm text-zinc-400">
              Reviewing {formatOrganizationIdDisplay(targetOrg)} coaching interest submissions.
            </p>
          </div>
          <a
            href={`/api/admin/coaching-interest?${queryString}&format=csv`}
            className="inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-brand-gold hover:text-brand-gold"
          >
            Export CSV
          </a>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <label className="text-xs text-zinc-500">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as "" | SubmissionStatus)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100">
              <option value="">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Role preference
            <select value={rolePreference} onChange={(e) => setRolePreference(e.target.value as "" | RolePreference)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100">
              <option value="">All roles</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500">
            Division
            <input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="10U, Majors..." className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100" />
          </label>
          <label className="text-xs text-zinc-500">
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone..." className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
          {Object.entries(counts).map(([key, value]) => (
            <span key={key} className="rounded-full border border-zinc-800 px-2 py-1">
              {statusLabels[key as SubmissionStatus]}: {value}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {busy && submissions.length === 0 ? <p className="text-sm text-zinc-500">Loading submissions...</p> : null}
        {!busy && submissions.length === 0 ? <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 text-sm text-zinc-500">No coaching interest submissions match the current filters.</p> : null}
        {submissions.map((submission) => (
          <article key={submission.id} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    {submission.firstName} {submission.lastName}
                  </h3>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                    {statusLabels[submission.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {submission.email} · {submission.cellPhone} · Submitted {formatDate(submission.createdAt)}
                </p>
                <p className="mt-3 text-sm text-zinc-200">
                  Interested in <span className="font-semibold">{submission.interestedDivision}</span> as{" "}
                  <span className="font-semibold">{roleLabels[submission.rolePreference]}</span>.
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Coached before: {submission.hasCoachedBefore ? "Yes" : "No"}
                  {submission.priorDivision ? ` · ${submission.priorDivision}` : ""}
                </p>
                {submission.notes ? <p className="mt-3 text-sm text-zinc-300">Notes: {submission.notes}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(statusLabels).map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy || submission.status === value}
                    onClick={() => void updateSubmission(submission.id, value as SubmissionStatus)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs hover:border-brand-gold hover:text-brand-gold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {statusLabels[value as SubmissionStatus]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
              <label className="text-xs text-zinc-500">
                Admin notes
                <textarea
                  rows={2}
                  value={notesById[submission.id] ?? ""}
                  onChange={(e) => setNotesById((prev) => ({ ...prev, [submission.id]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateSubmission(submission.id)}
                className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-60"
              >
                Save Notes
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
