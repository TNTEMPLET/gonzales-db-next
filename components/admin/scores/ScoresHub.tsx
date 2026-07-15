"use client";

import { useState } from "react";

import AdminGamesImportManager from "@/components/admin/AdminGamesImportManager";
import AdminScoresManager from "@/components/admin/AdminScoresManager";
import ScoresWorkflowNav, {
  type ScoresSectionId,
} from "@/components/admin/scores/ScoresWorkflowNav";
import type { AdminAssignrScope } from "@/lib/admin/assignrScopeShared";
import type {
  UnifiedGameChangerConnection,
  UnifiedScoreGame,
} from "@/lib/admin/unifiedScoreSources";

type Props = {
  games: UnifiedScoreGame[];
  connections: UnifiedGameChangerConnection[];
  scope: AdminAssignrScope;
  seasonYear: number;
};

/**
 * Scores console shell: workflow nav + shared managers.
 * AdminScoresManager already embeds GameChanger service UI; section focus scrolls/expands intent.
 */
export default function ScoresHub({ games, connections, scope, seasonYear }: Props) {
  const [section, setSection] = useState<ScoresSectionId>("queue");

  return (
    <div className="space-y-4">
      <ScoresWorkflowNav active={section} onChange={setSection} />
      <p className="text-sm text-zinc-400">
        {section === "queue"
          ? "Enter or review finals for loaded league and tournament games."
          : section === "gamechanger"
            ? "Connect a public GameChanger scoreboard, preview completed games, then import finals."
            : "Upload a scores spreadsheet when bulk entry is faster than the queue."}
      </p>

      {section === "import" ? (
        <AdminGamesImportManager scope={scope} />
      ) : (
        <AdminScoresManager
          games={games}
          connections={connections}
          scope={scope}
          seasonYear={seasonYear}
          preferGameChangerExpanded={section === "gamechanger"}
        />
      )}
    </div>
  );
}
