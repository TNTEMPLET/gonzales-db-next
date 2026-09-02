"use client";

import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/draft/clientError";

type PreviewRow = { teamName: string; fullName: string; playerId: string | null };
type PreviewPersonnelRow = {
  teamName: string;
  personnelName: string;
  personnelRole: string;
  volunteerId: string | null;
  volunteerTypeId: string | null;
};
type Preview = {
  rows: PreviewRow[];
  totalPlayers: number;
  unresolvedCount: number;
  personnelRows: PreviewPersonnelRow[];
  totalPersonnel: number;
  unresolvedPersonnelCount: number;
};

export default function SportsConnectExportPanel({ sessionId }: { sessionId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/draft/sessions/${sessionId}/export-sportsconnect?preview=1`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load export preview");
        if (!cancelled) setPreview(data);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const unresolvedNames = preview?.rows.filter((r) => !r.playerId).map((r) => r.fullName) ?? [];
  const unresolvedPersonnelNames =
    preview?.personnelRows.filter((r) => !r.volunteerId).map((r) => r.personnelName) ?? [];

  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">
            Export for SportsConnect
          </div>
          <p className="text-xs text-zinc-400">
            CSV formatted for SportsConnect&apos;s Team Management → Import Teams screen.
          </p>
        </div>
        <a
          href={`/api/admin/draft/sessions/${sessionId}/export-sportsconnect`}
          download
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500"
        >
          ⬇️ Download CSV for SportsConnect Import
        </a>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Checking Player IDs…</p>
      ) : error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : preview ? (
        <div className="text-xs text-zinc-400">
          <p>
            <span className="font-semibold text-zinc-200">{preview.totalPlayers - preview.unresolvedCount}</span>{" "}
            of <span className="font-semibold text-zinc-200">{preview.totalPlayers}</span> players have a
            Player ID ready to import.
            {preview.unresolvedCount > 0 && (
              <span className="text-amber-400">
                {" "}
                {preview.unresolvedCount} need a Player ID fixed manually in SportsConnect after import.
              </span>
            )}
          </p>
          {unresolvedNames.length > 0 && (
            <p className="mt-1 text-amber-300/90">Missing: {unresolvedNames.join(", ")}</p>
          )}
          <p className="mt-2">
            <span className="font-semibold text-zinc-200">
              {preview.totalPersonnel - preview.unresolvedPersonnelCount}
            </span>{" "}
            of <span className="font-semibold text-zinc-200">{preview.totalPersonnel}</span> coaches have a
            Volunteer ID ready to import.
            {preview.unresolvedPersonnelCount > 0 && (
              <span className="text-amber-400">
                {" "}
                {preview.unresolvedPersonnelCount} need a Volunteer ID fixed manually in SportsConnect after
                import.
              </span>
            )}
          </p>
          {unresolvedPersonnelNames.length > 0 && (
            <p className="mt-1 text-amber-300/90">Missing: {unresolvedPersonnelNames.join(", ")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
