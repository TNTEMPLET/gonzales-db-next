"use client";

import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";
import {
  eventWatchLabel,
  gcOrganizationEventFanUrl,
} from "@/lib/gamechanger/gcFanUrls";
import {
  liveBaseballSituationFromEvent,
  type BracketSide,
} from "@/lib/gamechanger/liveBaseballSituation";
import { isLiveGcEvent, normalizeTeamNameForMatch } from "@/lib/gamechanger/matchEventsToBracket";
import type { GcBracketMatchRef, GcLiveSituation, GcScoreboardEvent } from "@/lib/gamechanger/types";

import styles from "@/components/brackets/GameChangerEventScoreboard.module.css";

type Props = {
  bracketMatch: GcBracketMatchRef;
  event: GcScoreboardEvent;
  liveStatus?: BracketLiveGameStatus | null;
  organizationId?: string;
  writerSituation?: GcLiveSituation | null;
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

function countDots(count: number | undefined, max: number): string {
  if (count == null) return "—";
  return Array.from({ length: max }, (_, i) => (i < count ? "●" : "○")).join("");
}

function CountGroup({
  label,
  value,
  dots,
  ariaLabel,
}: {
  label: string;
  value?: number;
  dots?: string;
  ariaLabel: string;
}) {
  return (
    <div className={styles.countGroup} aria-label={ariaLabel}>
      <span className={styles.countLabel}>{label}</span>
      {dots != null ? (
        <span className={styles.countDots}>{dots}</span>
      ) : (
        <span className={styles.countValue}>{value ?? "—"}</span>
      )}
    </div>
  );
}

export default function GameChangerEventScoreboard({
  bracketMatch,
  event,
  liveStatus,
  organizationId,
  writerSituation,
}: Props) {
  const scores = displayScores(bracketMatch, event);
  const status = statusBadge(event, liveStatus);
  const isLive =
    status === "LIVE" ||
    status === "Live" ||
    event.game_status === "live" ||
    isLiveGcEvent(event);

  const baseSituation = liveBaseballSituationFromEvent(event, bracketMatch);
  const situation = writerSituation ?? baseSituation;

  const inning = liveStatus?.inningLabel ?? situation.inningLabel;
  const homeLabel = bracketMatch.home.trim();
  const awayLabel = bracketMatch.away.trim();

  const showCount =
    isLive &&
    (situation.balls != null || situation.strikes != null || situation.outsInHalf != null);

  const battingSide: BracketSide | undefined = isLive ? situation.battingSide : undefined;

  const watchLabel = organizationId ? eventWatchLabel(event, isLive) : undefined;
  const watchUrl =
    organizationId && watchLabel ? gcOrganizationEventFanUrl(organizationId, event.id) : undefined;

  return (
    <div className={styles.board} data-live={isLive ? "true" : "false"}>
      <div className={styles.header}>
        <span className={styles.status}>{status}</span>
        {inning ? <span className={styles.inning}>{inning}</span> : null}
      </div>

      {showCount ? (
        <div className={styles.countRow} aria-label="Live pitch count">
          <CountGroup
            label="B"
            dots={situation.balls != null ? countDots(situation.balls, 3) : undefined}
            ariaLabel={
              situation.balls != null ? `${situation.balls} balls` : "Balls not available from GameChanger"
            }
          />
          <CountGroup
            label="S"
            dots={situation.strikes != null ? countDots(situation.strikes, 2) : undefined}
            ariaLabel={
              situation.strikes != null ? `${situation.strikes} strikes` : "Strikes not available from GameChanger"
            }
          />
          <CountGroup
            label="O"
            dots={situation.outsInHalf != null ? countDots(situation.outsInHalf, 3) : undefined}
            ariaLabel={
              situation.outsInHalf != null
                ? `${situation.outsInHalf} outs`
                : "Outs not available from GameChanger"
            }
          />
        </div>
      ) : null}

      <div className={styles.teams}>
        <div className={styles.teamRow} data-batting={battingSide === "home" ? "true" : "false"}>
          <div className={styles.teamMeta}>
            {battingSide === "home" ? (
              <span className={styles.atBatBadge} aria-label="At bat">At bat</span>
            ) : null}
            <span className={styles.teamName} title={homeLabel}>
              {homeLabel}
            </span>
          </div>
          <span className={styles.teamScore}>{scores.homeScore}</span>
        </div>
        <div className={styles.vs}>vs</div>
        <div className={styles.teamRow} data-batting={battingSide === "away" ? "true" : "false"}>
          <div className={styles.teamMeta}>
            {battingSide === "away" ? (
              <span className={styles.atBatBadge} aria-label="At bat">At bat</span>
            ) : null}
            <span className={styles.teamName} title={awayLabel}>
              {awayLabel}
            </span>
          </div>
          <span className={styles.teamScore}>{scores.awayScore}</span>
        </div>
      </div>

      {watchUrl && watchLabel ? (
        <a
          className={styles.watchLink}
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {watchLabel}
        </a>
      ) : null}

      <p className={styles.footer}>GameChanger live scoreboard · Updates automatically</p>
    </div>
  );
}
