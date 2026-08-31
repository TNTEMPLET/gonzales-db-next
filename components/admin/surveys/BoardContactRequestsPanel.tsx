"use client";

import { useEffect, useMemo, useState } from "react";
import { toCsvSafeValue } from "@/lib/admin/teamsImportHelpers";

type BoardContactRequest = {
  id: string;
  phone: string | null;
  email: string | null;
  organizationId: string | null;
  divisionName: string | null;
  submittedAt: string;
  contactedAt: string | null;
  surveyId: string;
  surveyTitle: string;
  seasonYear: number;
};

const ORG_BADGE_LABELS: Record<string, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
  fallball: "Fall Ball",
};

function orgBadgeLabel(orgId: string | null): string {
  if (!orgId) return "Unknown Org";
  return ORG_BADGE_LABELS[orgId] ?? orgId;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export default function BoardContactRequestsPanel({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const [requests, setRequests] = useState<BoardContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      const params = new URLSearchParams();
      if (orgFilter) params.set("respondentOrg", orgFilter);
      if (onlyOpen) params.set("onlyOpen", "true");
      const res = await fetch(`/api/admin/surveys/board-contact-requests?${params.toString()}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to load requests");
      setRequests((data.requests as BoardContactRequest[]) || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgFilter, onlyOpen]);

  const handleToggleContacted = async (id: string, contacted: boolean) => {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/admin/surveys/board-contact-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: id, contacted }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error((data.error as string) || "Failed to update");
      }
      setRequests((prev) =>
        onlyOpen && contacted
          ? prev.filter((r) => r.id !== id)
          : prev.map((r) => (r.id === id ? { ...r, contactedAt: contacted ? new Date().toISOString() : null } : r)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setUpdatingId(null);
    }
  };

  const csvHref = useMemo(() => {
    const header = ["Survey", "Org", "Division", "Phone", "Email", "Submitted", "Contacted"];
    const rows = requests.map((r) => [
      r.surveyTitle,
      orgBadgeLabel(r.organizationId),
      r.divisionName || "",
      r.phone || "",
      r.email || "",
      fmtDate(r.submittedAt),
      r.contactedAt ? fmtDate(r.contactedAt) : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(toCsvSafeValue).join(",")).join("\n");
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [requests]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {isMasterAdmin && (
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200"
            >
              <option value="">All Orgs</option>
              <option value="gonzales">Gonzales DYB</option>
              <option value="ascension">Ascension LL</option>
              <option value="fallball">Fall Ball</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Open requests only
          </label>
        </div>
        <a
          href={csvHref}
          download={`board-contact-requests-${new Date().toISOString().slice(0, 10)}.csv`}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
        >
          Export CSV
        </a>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
          {onlyOpen ? "No open board contact requests." : "No board contact requests found."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-zinc-800 text-[11px] uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Survey</th>
                <th className="px-4 py-3">Org / Division</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{req.phone || "—"}</div>
                    {req.email && <div className="text-[11px] text-zinc-500">{req.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{req.surveyTitle}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-emerald-300/90 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {orgBadgeLabel(req.organizationId)}
                    </span>
                    {req.divisionName && (
                      <span className="ml-1.5 font-medium text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {req.divisionName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(req.submittedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleContacted(req.id, !req.contactedAt)}
                      disabled={updatingId === req.id}
                      className={`rounded-lg px-3 py-1 text-[11px] font-bold disabled:opacity-50 ${
                        req.contactedAt
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      }`}
                      title={req.contactedAt ? `Contacted ${fmtDate(req.contactedAt)}` : undefined}
                    >
                      {req.contactedAt ? "✓ Contacted" : "Mark Contacted"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
