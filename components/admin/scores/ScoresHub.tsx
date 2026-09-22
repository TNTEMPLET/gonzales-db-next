"use client";

import { useState } from "react";

import GameChangerPanel from "@/components/admin/scores/GameChangerPanel";
import ScoreQueue from "@/components/admin/scores/ScoreQueue";
import ScoresImportPanel from "@/components/admin/scores/ScoresImportPanel";
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
  seasonLabel?: string;
};

export default function ScoresHub({
  games,
  connections,
  scope,
  seasonLabel,
}: Props) {
  const [section, setSection] = useState<ScoresSectionId>("queue");

  return (
    <div className="space-y-4">
      <ScoresWorkflowNav active={section} onChange={setSection} />
      <p className="text-sm text-zinc-400">
        {section === "queue"
          ? `Enter finals for ${seasonLabel || "this season"} league games that have already started.`
          : section === "gamechanger"
            ? "Connect a public GameChanger scoreboard, preview completed games, then import finals."
            : "Upload a scores spreadsheet when bulk entry is faster than the queue."}
      </p>

      {section === "queue" ? <ScoreQueue games={games} /> : null}
      {section === "gamechanger" ? (
        <GameChangerPanel games={games} connections={connections} />
      ) : null}
      {section === "import" ? <ScoresImportPanel scope={scope} /> : null}
    </div>
  );
}
