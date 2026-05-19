"use client";

import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";
import { normalizeTeamNameForMatch } from "@/lib/gamechanger/matchEventsToBracket";
import type { GcBracketMatchRef, GcScoreboardEvent } from "@/lib/gamechanger/types";

import styles from "@/components/brackets/GameChangerEventScoreboard.module.css";

type Props = {
  bracketMatch: GcBracketMatchRef;
  event: GcScoreboardEvent;
  liveStatus?: BracketLiveGameStatus | null;
};

function displayScores(
  bracketMatch: GcBracketMatchRef,
  event: GcScoreboardEvent,
): { homeScore: string; awayScore: string } {
  const gcHome = event.home_team.score;
  const gcAway = event.away_team.score;
  const flipped =
    normalizeTeamNameForMatch(bracketMatch.home) !== normalizeTeamNameForMatch(event.home_team.name);
  const homeScore = flipped ? gcAway : gcHome;
  const awayScore = flipped ? gcHome : gcAway;
  return {
    homeScore: homeScore != null ? String(homeScore) : "—",
    awayScore: awayScore != null ? String(awayScore) : "—",
  };
}

function statusBadge(event: GcScoreboardEvent, liveStatus?: BracketLiveGameStatus | null): string {
  if (liveStatus?.statusLabel) return liveStatus.statusLabel;
  if (event.game_status === "completed") return "Final";
  if (event.game_status === "live") return "Live";
  return "Scheduled";
}

export default function GameChangerEventScoreboard({ bracketMatch, event, liveStatus }: Props) {
  const scores = displayScores(bracketMatch, event);
  const status = statusBadge(event, liveStatus);
  const isLive = status === "LIVE" || status === "Live" || event.game_status === "live";
  const inning = liveStatus?.inningLabel;
  const homeLabel = bracketMatch.home.trim();
  const awayLabel = bracketMatch.away.trim();

  return (
    <div className={styles.board} data-live={isLive ? "true" : "false"}>
      <div className={styles.header}>
        <span className={styles.status}>{status}</span>
        {inning ? <span className={styles.inning}>{inning}</span> : null}
      </div>
      <div className={styles.teams}>
        <div className={styles.teamRow}>
          <span className={styles.teamName} title={homeLabel}>
            {homeLabel}
          </span>
          <span className={styles.teamScore}>{scores.homeScore}</span>
        </div>
        <div className={styles.vs}>vs</div>
        <div className={styles.teamRow}>
          <span className={styles.teamName} title={awayLabel}>
            {awayLabel}
          </span>
          <span className={styles.teamScore}>{scores.awayScore}</span>
        </div>
      </div>
      <p className={styles.footer}>GameChanger live scoreboard · Updates automatically</p>
    </div>
  );
}
