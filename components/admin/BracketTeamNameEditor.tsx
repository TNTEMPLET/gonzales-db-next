"use client";

import { useEffect, useMemo, useState } from "react";

import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  collectEditableTeamLabels,
  specPatchFromTeamRenames,
  teamLabelRenamesFromDraft,
} from "@/lib/tournament-brackets/bracketTeamRename";

type Props = {
  spec: BracketSpec;
  projectId: string;
  projectUpdatedAt: string;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
};

export default function BracketTeamNameEditor({
  spec,
  projectId,
  projectUpdatedAt,
  busy,
  onSave,
}: Props) {
  const originals = useMemo(() => collectEditableTeamLabels(spec), [spec]);
  const [draftByOriginal, setDraftByOriginal] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const label of collectEditableTeamLabels(spec)) {
      next[label] = label;
    }
    setDraftByOriginal(next);
  }, [projectId, projectUpdatedAt, spec]);

  const pendingRenames = teamLabelRenamesFromDraft(originals, draftByOriginal);
  const hasChanges = pendingRenames.length > 0;

  async function handleSave() {
    if (!hasChanges) return;
    const patch = specPatchFromTeamRenames(spec, pendingRenames);
    await onSave(patch);
  }

  if (originals.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        No team names to edit yet. Add teams in bracket structure first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        Fix typos or update display names after publish. Renames apply everywhere that team appears
        (all rounds, including games already scored). Match IDs, scores, and bracket layout stay the
        same.
      </p>
      <ul className="space-y-2">
        {originals.map((original) => (
          <li
            key={original}
            className="flex flex-col gap-1 rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-2 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500" title={original}>
              Was: {original}
            </span>
            <input
              className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm sm:min-w-[12rem] sm:flex-[2]"
              value={draftByOriginal[original] ?? original}
              disabled={busy}
              onChange={(e) =>
                setDraftByOriginal((prev) => ({
                  ...prev,
                  [original]: e.target.value,
                }))
              }
              aria-label={`Rename ${original}`}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || !hasChanges}
        onClick={() => void handleSave()}
        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
      >
        Save team name{pendingRenames.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
