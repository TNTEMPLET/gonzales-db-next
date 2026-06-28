"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { BracketLayout, BracketLayoutPodium, LayoutMatch, LayoutRound } from "@/lib/tournament-brackets/bracketLayout";
import { collectAllDoubleElimMatchesByGame } from "@/lib/tournament-brackets/bracketLayout";
import {
  resolveClassicDoubleElimSlots,
  resolveClassicThreeTeamDoubleElimSlots,
} from "@/lib/tournament-brackets/classicDoubleElimDiagram";
import { resolveClassicSixTeamModifiedDeSlots } from "@/lib/tournament-brackets/classicSixTeamModifiedDeDiagram";
import {
  declaredChampionFromFinalSlots,
  declaredThirdPlaceFromSlots,
  bracketSurfaceTitle,
  formatChampionshipGameBadge,
  matchCardGameInfoLines,
} from "@/lib/tournament-brackets/bracketDisplayLabels";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import type { BracketParkInfo, BracketTournamentInfo, BracketVisualTuning } from "@/lib/tournament-brackets/bracketSpec";
import { hasBracketTournamentInfo } from "@/lib/tournament-brackets/tournamentInfo";
import type { BracketColorScheme, BracketThemeColors } from "@/lib/tournament-brackets/bracketTheme";
import { bracketThemeCssVars } from "@/lib/tournament-brackets/bracketTheme";
import { resolveMatchDisplayStatus } from "@/lib/gamechanger/matchDisplayStatus";
import { getBracketConnectorVariant } from "@/lib/tournament-brackets/bracketConnectorPaths";
import { matchGridPlacement, podiumColumnGridPlacement } from "@/lib/tournament-brackets/bracketGridPlacement";
import {
  BRACKET_THIRD_PLACE_MATCH_ID,
  clampBracketScoreInput,
  isByeBracketMatch,
  type BracketMatchScores,
} from "@/lib/tournament-brackets/bracketScoring";

import { BracketConnectorCell, FinalChampionConnectorCell } from "@/components/brackets/BracketConnector";
import ClassicDoubleElimDiagram from "@/components/brackets/ClassicDoubleElimDiagram";
import ClassicSixTeamModifiedDeDiagram from "@/components/brackets/ClassicSixTeamModifiedDeDiagram";
import {
  BRACKET_PODIUM_CHAMPION_SOURCE_ATTR,
  BRACKET_PODIUM_CHAMPION_TARGET_ATTR,
  BRACKET_PODIUM_THIRD_BAND_ATTR,
  BRACKET_PODIUM_THIRD_SOURCE_ATTR,
  BRACKET_PODIUM_THIRD_TARGET_ATTR,
} from "@/lib/tournament-brackets/bracketConnectorPaths";
import styles from "@/components/brackets/TournamentBracketView.module.css";

/** Classic LLBWS-style navy + red when no theme is passed. */
const LLBWS_FALLBACK_THEME: BracketThemeColors = { primaryHex: "#002f6c", accentHex: "#c8102e" };

export type BracketScoringViewProps = {
  enabled: boolean;
  editing: boolean;
  scores: Record<string, BracketMatchScores>;
  onScoresChange: (matchId: string, patch: Partial<BracketMatchScores>) => void;
};

export type BracketLiveGameStatus = {
  scoreLabel?: string;
  inningLabel?: string;
  statusLabel?: string;
};

type Props = {
  layout: BracketLayout;
  className?: string;
  style?: CSSProperties;
  /** When set, drives CSS variables (defaults to classic LLBWS ink colors). */
  themeColors?: BracketThemeColors | null;
  /** Light printable sheet vs dark bracket surface (public viewer toggle). */
  colorScheme?: BracketColorScheme;
  /** League logo from flyer options — large, low-opacity background (same origin as uploads). */
  logoWatermarkUrl?: string | null;
  /** Park / venue copy shown under the bracket title (legacy; classic unified uses `tournamentInfo` inset). */
  parkInfo?: BracketParkInfo | null;
  /** Official LL tournament header table (classic unified diagram). */
  tournamentInfo?: BracketTournamentInfo | null;
  /** DB-backed visual tuning values for classic bracket diagrams. */
  visualTuning?: BracketVisualTuning | null;
  /** Parent organization badge shown at the bottom-right of the bracket surface. */
  parentOrganizationLogo?: BracketParentOrganizationLogo | null;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  /** When set with `gameChangerEnabled`, match cards open the GameChanger scoreboard modal. */
  onMatchClick?: (matchId: string) => void;
  /** Enables click-to-scoreboard on non-bye games (public brackets with GameChanger configured). */
  gameChangerEnabled?: boolean;
  /**
   * When set (trimmed), used as the main H3 label source instead of `spec.divisionLabel`
   * (e.g. BracketProject.name from the admin list). Normalized with `bracketSurfaceTitle` (label only, or `— suffix` when used).
   */
  surfaceTitleOverride?: string | null;
  /** Public page: grid columns flex to container width (no fixed min-width scroll). */
  fluidWidth?: boolean;
};

export type BracketParentOrganizationLogo = {
  src: string;
  name?: string;
};

function mergeRootStyle(
  themeColors: BracketThemeColors | null | undefined,
  colorScheme: BracketColorScheme,
  style?: CSSProperties,
): CSSProperties {
  const base = bracketThemeCssVars(themeColors ?? LLBWS_FALLBACK_THEME, colorScheme) as CSSProperties;
  return { ...base, ...style };
}

function rowSpanForMatch(firstRoundCount: number, layoutSlotCountInRound: number): number {
  return firstRoundCount / layoutSlotCountInRound;
}

function matchAtCanonicalSlot(round: LayoutRound, slotIndex: number): LayoutMatch | null {
  if (round.layoutSlotCount != null) {
    return round.matches.find((x) => x.canonicalSlotIndex === slotIndex) ?? null;
  }
  return round.matches[slotIndex] ?? null;
}

function incomingFeederVariant(rounds: LayoutRound[], roundIndex: number, slotIndex: number) {
  if (roundIndex <= 0) return "both";
  const prevRound = rounds[roundIndex - 1];
  if (!prevRound) return "both";
  const topHas = matchAtCanonicalSlot(prevRound, 2 * slotIndex) != null;
  const bottomHas = matchAtCanonicalSlot(prevRound, 2 * slotIndex + 1) != null;
  return getBracketConnectorVariant(topHas, bottomHas);
}

function isSixTeamEightSlotByeLayout(rounds: LayoutRound[], laneRows: number) {
  const firstRound = rounds[0];
  return (
    laneRows === 4 &&
    firstRound?.layoutSlotCount === 4 &&
    firstRound.matches.length === 2
  );
}

function matchGameBadge(m: Pick<LayoutMatch, "officialGameNumber" | "championshipRole">): string | undefined {
  return formatChampionshipGameBadge(m);
}

function liveStatusLabel(status: BracketLiveGameStatus | null | undefined): string | undefined {
  if (!status) return undefined;
  return [status.scoreLabel, status.inningLabel, status.statusLabel]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ") || undefined;
}

function matchScoresForHeader(
  match: Pick<LayoutMatch, "id" | "homeScore" | "awayScore">,
  scoring?: BracketScoringViewProps | null,
): { homeScore?: number; awayScore?: number } {
  const stored = scoring?.scores[match.id];
  return {
    homeScore: stored?.homeScore ?? match.homeScore,
    awayScore: stored?.awayScore ?? match.awayScore,
  };
}

function byeSlotClass(label: string): string {
  return label === BYE_SLOT_LABEL ? ` ${styles.slotBye}` : "";
}

const BRACKET_SLOT_FIT_MAX_PX = 13;
const BRACKET_SLOT_FIT_MIN_PX = 9;

/** Base px when computed style is unavailable — matches ~0.625rem schedule meta. */
const BRACKET_SCHEDULE_LINE_FIT_MAX_PX = 10;
const BRACKET_SCHEDULE_LINE_FIT_MIN_PX = 6;

/** Shrinks team label font until it fits the slot width on one line. */
function BracketSlotScore({
  value,
  editing,
  ariaLabel,
  onChange,
}: {
  value: number | undefined;
  editing: boolean;
  ariaLabel: string;
  onChange: (next: number | undefined) => void;
}) {
  if (!editing) {
    if (value == null) return null;
    return (
      <span className={styles.slotScoreRead} aria-label={ariaLabel}>
        {value}
      </span>
    );
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      className={styles.slotScoreInput}
      aria-label={ariaLabel}
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(clampBracketScoreInput(e.target.value))}
    />
  );
}

function BracketMatchSlotRow({
  label,
  side,
  matchId,
  matchMeta,
  scoring,
}: {
  label: string;
  side: "home" | "away";
  matchId: string;
  matchMeta: Pick<LayoutMatch, "home" | "away" | "homeScore" | "awayScore" | "winnerSide">;
  scoring?: BracketScoringViewProps | null;
}) {
  const isBye = label.trim() === BYE_SLOT_LABEL;
  const editing = Boolean(scoring?.editing);
  const stored = scoring?.scores[matchId];
  const scoreValue =
    side === "home"
      ? (stored?.homeScore ?? matchMeta.homeScore)
      : (stored?.awayScore ?? matchMeta.awayScore);
  const showScore = !isBye && (editing || scoreValue != null);

  return (
    <div
      className={`${styles.slot}${byeSlotClass(label)}${showScore ? ` ${styles.slotWithScore}` : ""}`}
      data-bracket-match-slot={side}
    >
      <BracketSlotLabel label={label} />
      {showScore ? (
        <BracketSlotScore
          value={scoreValue}
          editing={editing}
          ariaLabel={`${label} score`}
          onChange={(next) => {
            scoring?.onScoresChange(matchId, side === "home" ? { homeScore: next } : { awayScore: next });
          }}
        />
      ) : null}
    </div>
  );
}

function BracketTiePicker({
  matchId,
  homeLabel,
  awayLabel,
  scoring,
}: {
  matchId: string;
  homeLabel: string;
  awayLabel: string;
  scoring: BracketScoringViewProps;
}) {
  return (
    <div className={styles.tiePicker} role="group" aria-label="Select winner (tied score)">
      <button
        type="button"
        className={styles.tiePickerBtn}
        onClick={() => scoring.onScoresChange(matchId, { winnerSide: "home" })}
      >
        {homeLabel} wins
      </button>
      <button
        type="button"
        className={styles.tiePickerBtn}
        onClick={() => scoring.onScoresChange(matchId, { winnerSide: "away" })}
      >
        {awayLabel} wins
      </button>
    </div>
  );
}

function bracketTieState(
  matchId: string,
  matchMeta: Pick<LayoutMatch, "home" | "away" | "homeScore" | "awayScore" | "winnerSide">,
  scoring?: BracketScoringViewProps | null,
): boolean {
  if (!scoring?.editing || isByeBracketMatch(matchMeta)) return false;
  const s = scoring.scores[matchId];
  const hs = s?.homeScore ?? matchMeta.homeScore;
  const as = s?.awayScore ?? matchMeta.awayScore;
  if (hs == null || as == null || hs !== as) return false;
  return !(s?.winnerSide ?? matchMeta.winnerSide);
}

function BracketSlotLabel({ label }: { label: string }) {
  const labelRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const slot = el.parentElement;
    if (!slot) return;

    const fit = () => {
      const cs = getComputedStyle(slot);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const avail = slot.clientWidth - pad;
      if (avail < 4) return;

      const maxPx = parseFloat(cs.fontSize) || BRACKET_SLOT_FIT_MAX_PX;
      const minPx = Math.min(BRACKET_SLOT_FIT_MIN_PX, maxPx * 0.68);
      let size = maxPx;
      el.style.fontSize = `${size}px`;

      while (size > minPx && el.scrollWidth > avail) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [label]);

  return (
    <span ref={labelRef} className={styles.slotLabel}>
      {label}
    </span>
  );
}

/** Single-line schedule (date/time, field/venue): shrink font like team slots; ellipsis only past min size. */
function BracketScheduleFitLine({ text }: { text: string }) {
  const lineRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const line = lineRef.current;
    const span = spanRef.current;
    if (!line || !span) return;

    const fit = () => {
      const avail = line.clientWidth;
      if (avail < 4) return;
      const cs = getComputedStyle(line);
      const maxPx = parseFloat(cs.fontSize) || BRACKET_SCHEDULE_LINE_FIT_MAX_PX;
      const minPx = Math.min(BRACKET_SCHEDULE_LINE_FIT_MIN_PX, maxPx * 0.65);
      let size = maxPx;
      span.style.fontSize = `${size}px`;

      while (size > minPx && span.scrollWidth > avail) {
        size -= 0.5;
        span.style.fontSize = `${size}px`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(line);
    return () => ro.disconnect();
  }, [text]);

  const t = text.trim();
  if (!t) {
    return <div className={styles.matchScheduleLineFit} aria-hidden />;
  }

  return (
    <div ref={lineRef} className={styles.matchScheduleLineFit}>
      <span ref={spanRef} className={styles.matchScheduleLineFitText}>
        {t}
      </span>
    </div>
  );
}

/** Nudges the champion plaque so its vertical center lines up with the final match card. */
function usePodiumChampionPlaqueAlign(wrapRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const root = wrap.closest("section");
      const match = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
      const plaque = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}]`);
      if (!match || !plaque) {
        wrap.style.transform = "";
        return;
      }
      const matchCy = (match.getBoundingClientRect().top + match.getBoundingClientRect().bottom) / 2;
      const plaqueCy = (plaque.getBoundingClientRect().top + plaque.getBoundingClientRect().bottom) / 2;
      const delta = matchCy - plaqueCy;
      wrap.style.transform = Math.abs(delta) > 0.5 ? `translateY(${delta}px)` : "";
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    const root = wrap.closest("section");
    const match = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
    const plaque = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}]`);
    if (match) ro.observe(match);
    if (plaque) ro.observe(plaque);
    return () => ro.disconnect();
  }, [wrapRef]);
}

const PODIUM_THIRD_BAND_SYNC_MAX_PX = 280;
const PODIUM_THIRD_ALIGN_MAX_PX = 120;

type PodiumThirdSyncMode = false | "full" | "align-only";

/**
 * Keeps 3rd-place game and plaque bottom bands aligned.
 * `full`: height sync + vertical align (standard brackets).
 * `align-only`: card-based height + align only (compact 6-team; avoids row measure feedback loop).
 */
function usePodiumThirdBandHeightSync(mode: PodiumThirdSyncMode, rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const scope = rootRef.current;
    if (!mode || !scope) {
      return () => {
        scope?.style.removeProperty("--bracket-podium-third-band-sync-height");
      };
    }
    const alignOnly = mode === "align-only";
    const sync = () => {
      const gameRow = scope.querySelector(`[${BRACKET_PODIUM_THIRD_BAND_ATTR}="game"]`);
      const plaqueRow = scope.querySelector(`[${BRACKET_PODIUM_THIRD_BAND_ATTR}="plaque"]`);
      const game = gameRow?.querySelector(`[${BRACKET_PODIUM_THIRD_SOURCE_ATTR}]`);
      const plaque = plaqueRow?.querySelector(`[${BRACKET_PODIUM_THIRD_TARGET_ATTR}]`);
      const gameCardH = game instanceof HTMLElement ? game.offsetHeight : 0;
      const plaqueCardH = plaque instanceof HTMLElement ? plaque.offsetHeight : 0;
      const gameH = alignOnly
        ? gameCardH
        : gameCardH || (gameRow instanceof HTMLElement ? gameRow.offsetHeight : 0);
      const plaqueH = alignOnly
        ? plaqueCardH
        : plaqueCardH || (plaqueRow instanceof HTMLElement ? plaqueRow.offsetHeight : 0);
      const h = Math.min(Math.max(gameH, plaqueH, 0), PODIUM_THIRD_BAND_SYNC_MAX_PX);
      if (h > 0) {
        scope.style.setProperty("--bracket-podium-third-band-sync-height", `${Math.ceil(h)}px`);
      }
      if (gameRow instanceof HTMLElement && plaqueRow instanceof HTMLElement) {
        if (game && plaque) {
          const gameRect = game.getBoundingClientRect();
          const plaqueRect = plaque.getBoundingClientRect();
          const delta = (gameRect.top + gameRect.bottom) / 2 - (plaqueRect.top + plaqueRect.bottom) / 2;
          const plaqueRowRect = plaqueRow.getBoundingClientRect();
          const visualScale = plaqueRow.offsetHeight > 0 ? plaqueRowRect.height / plaqueRow.offsetHeight : 1;
          let cssDelta = visualScale > 0 ? delta / visualScale : delta;
          cssDelta = Math.max(-PODIUM_THIRD_ALIGN_MAX_PX, Math.min(PODIUM_THIRD_ALIGN_MAX_PX, cssDelta));
          plaqueRow.style.setProperty(
            "--bracket-podium-third-align-y",
            Math.abs(cssDelta) > 0.5 ? `${Math.round(cssDelta * 100) / 100}px` : "0px",
          );
          scope.dispatchEvent(new CustomEvent("bracket:podium-third-align", { bubbles: true }));
        } else {
          plaqueRow.style.removeProperty("--bracket-podium-third-align-y");
          scope.dispatchEvent(new CustomEvent("bracket:podium-third-align", { bubbles: true }));
        }
      }
    };
    sync();
    const raf = window.requestAnimationFrame(sync);
    const ro = new ResizeObserver(sync);
    if (!alignOnly) {
      ro.observe(scope);
    }
    const gameRow = scope.querySelector(`[${BRACKET_PODIUM_THIRD_BAND_ATTR}="game"]`);
    const plaqueRow = scope.querySelector(`[${BRACKET_PODIUM_THIRD_BAND_ATTR}="plaque"]`);
    if (!alignOnly && gameRow) ro.observe(gameRow);
    if (!alignOnly && plaqueRow) ro.observe(plaqueRow);
    const game = gameRow?.querySelector(`[${BRACKET_PODIUM_THIRD_SOURCE_ATTR}]`);
    const plaque = plaqueRow?.querySelector(`[${BRACKET_PODIUM_THIRD_TARGET_ATTR}]`);
    if (game) ro.observe(game);
    if (plaque) ro.observe(plaque);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      scope.style.removeProperty("--bracket-podium-third-band-sync-height");
      if (plaqueRow instanceof HTMLElement) {
        plaqueRow.style.removeProperty("--bracket-podium-third-align-y");
      }
    };
  }, [mode, rootRef]);
}

function hasBracketParkInfo(park?: BracketParkInfo | null): boolean {
  if (!park) return false;
  const heading = park.heading?.trim();
  const body = park.body?.trim();
  const contacts =
    park.contacts?.filter((c) => Boolean(c.name?.trim() || c.phone?.trim())) ?? [];
  return Boolean(heading || body || contacts.length > 0);
}

function ParkAside({ park }: { park?: BracketParkInfo | null }) {
  const heading = park?.heading?.trim();
  const body = park?.body?.trim();
  const contacts =
    park?.contacts?.filter((c) => Boolean(c.name?.trim() || c.phone?.trim())) ?? [];
  if (!heading && !body && contacts.length === 0) return null;
  return (
    <aside className={styles.parkAside} aria-label={heading || "Park information"}>
      {heading ? <h4 className={styles.parkHeading}>{heading}</h4> : null}
      {body ? (
        <div className={styles.parkBody}>
          {body.split(/\n+/).map((line, i) => (
            <p key={i} className={styles.parkLine}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {contacts.length > 0 ? (
        <div className={styles.parkContacts}>
          <div className={styles.parkContactsHeading}>Point of contact</div>
          <ul className={styles.parkContactList}>
            {contacts.map((c, i) => (
              <li key={i} className={styles.parkContactItem}>
                {c.name?.trim() ? <div className={styles.parkContactName}>{c.name.trim()}</div> : null}
                {c.phone?.trim() ? <div className={styles.parkContactPhone}>{c.phone.trim()}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function ThirdPlaceMatchArticle({
  podium,
  scoring,
  liveStatus,
  onMatchClick,
  gameChangerEnabled,
}: {
  podium: BracketLayoutPodium;
  scoring?: BracketScoringViewProps | null;
  liveStatus?: BracketLiveGameStatus | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
}) {
  const match: LayoutMatch = {
    id: BRACKET_THIRD_PLACE_MATCH_ID,
    home: podium.thirdPlaceSlotHome,
    away: podium.thirdPlaceSlotAway,
    slotHome: podium.thirdPlaceSlotHome,
    slotAway: podium.thirdPlaceSlotAway,
    ...(podium.thirdPlaceGameInfo?.officialGameNumber ? { officialGameNumber: podium.thirdPlaceGameInfo.officialGameNumber } : {}),
    ...(podium.thirdPlaceGameInfo?.dateLabel ? { dateLabel: podium.thirdPlaceGameInfo.dateLabel } : {}),
    ...(podium.thirdPlaceGameInfo?.time ? { time: podium.thirdPlaceGameInfo.time } : {}),
    ...(podium.thirdPlaceGameInfo?.venue ? { venue: podium.thirdPlaceGameInfo.venue } : {}),
    ...(podium.thirdPlaceGameInfo?.field ? { field: podium.thirdPlaceGameInfo.field } : {}),
    ...(podium.thirdPlaceScores?.homeScore != null ? { homeScore: podium.thirdPlaceScores.homeScore } : {}),
    ...(podium.thirdPlaceScores?.awayScore != null ? { awayScore: podium.thirdPlaceScores.awayScore } : {}),
    ...(podium.thirdPlaceScores?.winnerSide ? { winnerSide: podium.thirdPlaceScores.winnerSide } : {}),
  };
  const showTie = bracketTieState(match.id, match, scoring);
  const badgeLabel = ["3rd place", matchGameBadge(match)].filter(Boolean).join(" · ");
  const displayStatus = resolveMatchDisplayStatus(liveStatus, matchScoresForHeader(match, scoring));
  const isLive = isLiveBracketStatus(liveStatus);
  const clickable =
    Boolean(gameChangerEnabled && onMatchClick && !scoring?.editing && !isByeBracketMatch(match));
  const handleActivate = () => {
    if (clickable && onMatchClick) onMatchClick(match.id);
  };
  const matchClass = [
    styles.match,
    styles.thirdPlaceMatch,
    isLive ? styles.matchLive : "",
    clickable ? styles.matchClickable : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={matchClass}
      {...{ [BRACKET_PODIUM_THIRD_SOURCE_ATTR]: "" }}
      aria-label={`Third place: ${podium.thirdPlaceSlotHome} versus ${podium.thirdPlaceSlotAway}`}
      {...(clickable
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: handleActivate,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleActivate();
              }
            },
          }
        : {})}
    >
      <MatchGameHeader
        gameLabel={badgeLabel}
        liveStatus={displayStatus}
        badgeClassName={styles.thirdPlaceMatchBadge}
      />
      <BracketMatchSlotRow
        label={podium.thirdPlaceSlotHome}
        side="home"
        matchId={match.id}
        matchMeta={match}
        scoring={scoring}
      />
      <MatchGameInfoBetweenTeams meta={match} />
      <BracketMatchSlotRow
        label={podium.thirdPlaceSlotAway}
        side="away"
        matchId={match.id}
        matchMeta={match}
        scoring={scoring}
      />
      {showTie && scoring ? (
        <BracketTiePicker
          matchId={match.id}
          homeLabel={podium.thirdPlaceSlotHome}
          awayLabel={podium.thirdPlaceSlotAway}
          scoring={scoring}
        />
      ) : null}
    </article>
  );
}

function ChampionRoundColumn({
  podium,
  className,
  style,
}: {
  podium: BracketLayoutPodium;
  className?: string;
  style?: CSSProperties;
}) {
  const plaqueWrapRef = useRef<HTMLDivElement>(null);
  usePodiumChampionPlaqueAlign(plaqueWrapRef);
  const champ = declaredChampionFromFinalSlots(
    podium.finalMatch.slotHome,
    podium.finalMatch.slotAway,
    podium.finalMatch,
  );
  const third = declaredThirdPlaceFromSlots(podium.thirdPlaceSlotHome, podium.thirdPlaceSlotAway);
  const isChampionTbd = champ.trim() === "TBD";
  const isThirdTbd = third.trim() === "TBD";
  const rootClass = [styles.championRoundColumn, className].filter(Boolean).join(" ");
  return (
    <div className={rootClass} style={style} aria-label="Champion round">
      <div ref={plaqueWrapRef} className={styles.championPlaqueWrap}>
        <div
          className={
            isChampionTbd
              ? `${styles.championPlaque} ${styles.championPlaqueUndecided}`
              : styles.championPlaque
          }
          {...{ [BRACKET_PODIUM_CHAMPION_TARGET_ATTR]: "" }}
          aria-label={isChampionTbd ? `${podium.championHeading}. Champion not yet decided.` : undefined}
        >
          {isChampionTbd ? (
            <div className={styles.championPlaqueTitleCentered}>{podium.championHeading}</div>
          ) : (
            <>
              <div className={styles.championPlaqueTitle}>{podium.championHeading}</div>
              <div className={styles.championPlaqueName}>{champ}</div>
            </>
          )}
        </div>
      </div>
      <div className={styles.thirdPlacePlaqueBottomRow} {...{ [BRACKET_PODIUM_THIRD_BAND_ATTR]: "plaque" }}>
        <div
          className={
            isThirdTbd
              ? `${styles.thirdPlacePlaque} ${styles.thirdPlacePlaqueUndecided}`
              : styles.thirdPlacePlaque
          }
          {...{ [BRACKET_PODIUM_THIRD_TARGET_ATTR]: "" }}
          aria-label={isThirdTbd ? "Third place not yet decided." : undefined}
        >
          {isThirdTbd ? (
            <div className={styles.championPlaqueTitleCentered}>3rd Place</div>
          ) : (
            <>
              <div className={styles.championPlaqueTitle}>3rd Place</div>
              <div className={styles.championPlaqueName}>{third}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BracketSurface({
  rootClass,
  rootStyle,
  colorScheme,
  ariaLabel,
  title,
  parkInfo,
  logoWatermarkUrl,
  parentOrganizationLogo,
  podium,
  parkBelowTitle = true,
  children,
}: {
  rootClass: string;
  rootStyle: CSSProperties;
  colorScheme: BracketColorScheme;
  ariaLabel: string;
  title: ReactNode;
  parkInfo?: BracketParkInfo | null;
  logoWatermarkUrl?: string | null;
  parentOrganizationLogo?: BracketParentOrganizationLogo | null;
  podium?: BracketLayoutPodium | null;
  /** When false, park is rendered in the grid or champion column instead of under the title. */
  parkBelowTitle?: boolean;
  children: ReactNode;
}) {
  const src = logoWatermarkUrl?.trim();
  const parentLogoSrc = parentOrganizationLogo?.src.trim();
  const parentLogoAlt = parentOrganizationLogo?.name?.trim()
    ? `${parentOrganizationLogo.name.trim()} logo`
    : "Parent organization logo";
  const showParkAboveChampion = podium != null && hasBracketParkInfo(parkInfo);
  const body =
    podium != null ? (
      <div className={styles.bracketBodyRow}>
        <div className={styles.bracketMainPane}>{children}</div>
        <div className={styles.flatChampionGutter} aria-hidden>
          <div className={styles.connectorCellFlat}>
            <FinalChampionConnectorCell />
          </div>
        </div>
        <div className={styles.flatChampionColumn}>
          {showParkAboveChampion ? (
            <div className={styles.flatChampionParkSlot}>
              <ParkAside park={parkInfo} />
            </div>
          ) : null}
          <ChampionRoundColumn podium={podium} />
        </div>
      </div>
    ) : (
      children
    );
  return (
    <section
      className={rootClass}
      style={rootStyle}
      data-bracket-scheme={colorScheme}
      aria-label={ariaLabel}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          className={styles.watermarkImg}
          draggable={false}
          decoding="async"
          fetchPriority="low"
        />
      ) : null}
      <div className={styles.rootForeground}>
        {title}
        {parkBelowTitle ? <ParkAside park={parkInfo} /> : null}
        {body}
      </div>
      {parentLogoSrc ? (
        <div className={styles.poweredByBadge} aria-label="Powered by parent organization">
          <span className={styles.poweredByText}>powered by:</span>
          <img src={parentLogoSrc} alt={parentLogoAlt} className={styles.poweredByLogo} draggable={false} decoding="async" />
        </div>
      ) : null}
    </section>
  );
}

function MatchGameInfoBetweenTeams({
  meta,
}: {
  meta: Pick<LayoutMatch, "dateLabel" | "time" | "venue" | "field">;
}) {
  const { when, where, isPlaceholder } = matchCardGameInfoLines(meta);
  if (isPlaceholder) return null;
  if (!when && !where) return null;
  return (
    <div
      className={[
        styles.matchScheduleMeta,
        styles.matchGameInfoBetweenTeams,
        isPlaceholder ? styles.matchScheduleMetaPlaceholder : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={isPlaceholder ? "Game information (placeholder)" : "Game information"}
    >
      <BracketScheduleFitLine text={when} />
      <BracketScheduleFitLine text={where} />
    </div>
  );
}

function isLiveBracketStatus(status: BracketLiveGameStatus | null | undefined): boolean {
  return status?.statusLabel?.trim().toUpperCase() === "LIVE";
}

function MatchArticle({
  match,
  gameLabel,
  liveStatus,
  schedule,
  podiumChampionSource,
  scoring,
  onMatchClick,
  gameChangerEnabled,
}: {
  match: LayoutMatch;
  gameLabel?: string;
  liveStatus?: BracketLiveGameStatus | null;
  schedule?: Pick<LayoutMatch, "dateLabel" | "time" | "venue" | "field">;
  podiumChampionSource?: boolean;
  scoring?: BracketScoringViewProps | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
}) {
  const { slotHome, slotAway } = match;
  const showTie = bracketTieState(match.id, match, scoring);
  const displayStatus = resolveMatchDisplayStatus(liveStatus, matchScoresForHeader(match, scoring));
  const isLive = isLiveBracketStatus(liveStatus);
  const clickable =
    Boolean(gameChangerEnabled && onMatchClick && !scoring?.editing && !isByeBracketMatch(match));

  const matchClass = [
    styles.match,
    isLive ? styles.matchLive : "",
    clickable ? styles.matchClickable : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleActivate = () => {
    if (clickable && onMatchClick) onMatchClick(match.id);
  };

  return (
    <article
      className={matchClass}
      data-bracket-match-id={match.id}
      {...(podiumChampionSource ? { [BRACKET_PODIUM_CHAMPION_SOURCE_ATTR]: "" } : {})}
      aria-label={`${slotHome} versus ${slotAway}`}
      {...(clickable
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: handleActivate,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleActivate();
              }
            },
          }
        : {})}
    >
      <MatchGameHeader gameLabel={gameLabel} liveStatus={displayStatus} />
      <BracketMatchSlotRow label={slotHome} side="home" matchId={match.id} matchMeta={match} scoring={scoring} />
      <MatchGameInfoBetweenTeams meta={schedule ?? {}} />
      <BracketMatchSlotRow label={slotAway} side="away" matchId={match.id} matchMeta={match} scoring={scoring} />
      {showTie && scoring ? (
        <BracketTiePicker matchId={match.id} homeLabel={slotHome} awayLabel={slotAway} scoring={scoring} />
      ) : null}
    </article>
  );
}

function MatchGameHeader({
  gameLabel,
  liveStatus,
  badgeClassName,
}: {
  gameLabel?: string;
  liveStatus?: BracketLiveGameStatus | null;
  badgeClassName?: string;
}) {
  const statusLabel = liveStatusLabel(liveStatus);
  if (!gameLabel && !statusLabel) return null;
  return (
    <div className={badgeClassName ?? styles.matchGameBadge}>
      <span className={styles.matchGameBadgeLabel}>{gameLabel}</span>
      {statusLabel ? <span className={styles.matchLiveStatus}>{statusLabel}</span> : null}
    </div>
  );
}

function MobileBracketRounds({
  rounds,
  podium,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
}: {
  rounds: LayoutRound[];
  podium?: BracketLayoutPodium | null;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
}) {
  const champion = podium
    ? declaredChampionFromFinalSlots(podium.finalMatch.slotHome, podium.finalMatch.slotAway, podium.finalMatch)
    : "";
  const thirdPlace = podium ? declaredThirdPlaceFromSlots(podium.thirdPlaceSlotHome, podium.thirdPlaceSlotAway) : "";
  const hasChampion = podium != null;

  return (
    <div className={styles.mobileRoundCards} aria-label="Mobile bracket summary">
      <div className={styles.mobileBracketIntro}>
        <div>
          <p className={styles.mobileBracketKicker}>Phone view</p>
          <p className={styles.mobileBracketHelp}>
            Games are grouped by round for easy reading. The full bracket diagram is available below.
          </p>
        </div>
      </div>

      {hasChampion ? (
        <section className={styles.mobilePodiumSummary} aria-label="Tournament results summary">
          <div className={styles.mobilePodiumCard}>
            <span className={styles.mobilePodiumLabel}>{podium.championHeading}</span>
            <strong className={styles.mobilePodiumName}>{champion.trim() || "TBD"}</strong>
          </div>
          <div className={styles.mobilePodiumCard}>
            <span className={styles.mobilePodiumLabel}>3rd Place</span>
            <strong className={styles.mobilePodiumName}>{thirdPlace.trim() || "TBD"}</strong>
          </div>
        </section>
      ) : null}

      <div className={styles.mobileRoundStack}>
        {rounds.map((round) => (
          <section key={round.id} className={styles.mobileRoundSection} aria-label={round.label}>
            <div className={styles.mobileRoundHeader}>
              <h4 className={styles.mobileRoundTitle}>{round.label}</h4>
              <span className={styles.mobileRoundCount}>
                {round.matches.length} game{round.matches.length === 1 ? "" : "s"}
              </span>
            </div>
            <ol className={styles.mobileMatchList}>
              {round.matches.map((match) => (
                <li key={match.id}>
                  <MatchArticle
                    match={match}
                    gameLabel={matchGameBadge(match)}
                    liveStatus={liveGameStatuses?.[match.id]}
                    schedule={match}
                    scoring={scoring}
                    onMatchClick={onMatchClick}
                    gameChangerEnabled={gameChangerEnabled}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}

        {podium ? (
          <section className={styles.mobileRoundSection} aria-label="3rd Place">
            <div className={styles.mobileRoundHeader}>
              <h4 className={styles.mobileRoundTitle}>3rd Place</h4>
              <span className={styles.mobileRoundCount}>1 game</span>
            </div>
            <ThirdPlaceMatchArticle
              podium={podium}
              scoring={scoring}
              liveStatus={liveGameStatuses?.[BRACKET_THIRD_PLACE_MATCH_ID]}
              onMatchClick={onMatchClick}
              gameChangerEnabled={gameChangerEnabled}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function FullBracketDiagramFrame({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={styles.desktopBracketDiagram} data-mobile-expanded={isOpen ? "true" : "false"}>
      <button
        type="button"
        className={styles.mobileFullBracketToggle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? "Hide full bracket diagram" : "Show full bracket diagram"}
      </button>
      <div className={styles.fullBracketDiagramBody}>{children}</div>
    </div>
  );
}

function ConnectedBracketGrid({
  rounds,
  laneRows,
  title,
  rootClass,
  style,
  colorScheme,
  parkInfo,
  logoWatermarkUrl,
  parentOrganizationLogo,
  podium,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
  embedded = false,
}: {
  rounds: LayoutRound[];
  /** Full first-round width (leaf rows); used for grid row template and spans. */
  laneRows: number;
  title: string;
  rootClass: string;
  style?: CSSProperties;
  colorScheme: BracketColorScheme;
  parkInfo?: BracketParkInfo | null;
  logoWatermarkUrl?: string | null;
  parentOrganizationLogo?: BracketParentOrganizationLogo | null;
  podium?: BracketLayoutPodium | null;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
  /** When true, render only the connected grid (no BracketSurface wrapper). */
  embedded?: boolean;
}) {
  const R = rounds.length;
  const N = laneRows > 0 ? laneRows : rounds[0]?.layoutSlotCount ?? rounds[0]?.matches.length ?? 0;
  const hasPodium = Boolean(podium);
  const baseCols = 2 * R - 1;
  const useCompactSixTeamByeLayout = isSixTeamEightSlotByeLayout(rounds, N);
  const laneMinHeight = useCompactSixTeamByeLayout ? "1rem" : "2.5rem";
  const gridTemplateColumns = [
    ...Array.from({ length: baseCols }, (_, i) =>
      /* Wider floor than minmax(0,1fr) so field/venue lines between teams are not clipped */
      i % 2 === 0 ? "minmax(11rem, 1fr)" : "minmax(1.25rem, 0.28fr)",
    ),
    ...(hasPodium ? (["minmax(1.25rem, 0.28fr)", "minmax(11rem, 1fr)"] as const) : []),
  ].join(" ");

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns,
    gridTemplateRows: `auto repeat(${N}, minmax(${laneMinHeight}, auto))`,
    columnGap: "0.35rem",
    rowGap: "0.45rem",
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
  };

  const gridRef = useRef<HTMLDivElement>(null);
  usePodiumThirdBandHeightSync(
    hasPodium ? (useCompactSixTeamByeLayout ? "align-only" : "full") : false,
    gridRef,
  );

  const cells: ReactNode[] = [];
  const parkInPodiumHeader = hasPodium && hasBracketParkInfo(parkInfo);

  for (let ri = 0; ri < R; ri++) {
    const round = rounds[ri]!;
    const col = 2 * ri + 1;
    if (!(parkInPodiumHeader && ri === R - 1)) {
      cells.push(
        <div
          key={`hdr-${round.id}`}
          className={styles.gridConnHdrSpacer}
          style={{ gridColumn: col, gridRow: 1 }}
          aria-hidden
        />,
      );
    }
    if (ri < R - 1) {
      cells.push(
        <div
          key={`hdr-gap-${round.id}`}
          className={styles.gridConnHdrSpacer}
          style={{ gridColumn: col + 1, gridRow: 1 }}
        />,
      );
    }
  }

  if (hasPodium) {
    if (parkInPodiumHeader) {
      cells.push(
        <div
          key="hdr-park-podium"
          className={styles.gridParkAsideCell}
          style={{ gridColumn: `${2 * R - 1} / span 3`, gridRow: 1 }}
        >
          <ParkAside park={parkInfo} />
        </div>,
      );
    } else {
      cells.push(
        <div key="hdr-champion-gap" className={styles.gridConnHdrSpacer} style={{ gridColumn: 2 * R, gridRow: 1 }} />,
      );
      cells.push(
        <div
          key="hdr-champion"
          className={styles.gridConnHdrSpacer}
          style={{ gridColumn: 2 * R + 1, gridRow: 1 }}
          aria-hidden
        />,
      );
    }
  }

  for (let ri = 0; ri < R; ri++) {
    const round = rounds[ri]!;
    const slotCount = round.layoutSlotCount ?? round.matches.length;
    const col = 2 * ri + 1;
    const isFinalSingleMatchPodium = hasPodium && podium != null && ri === R - 1 && slotCount === 1;
    for (let j = 0; j < slotCount; j++) {
      const m = matchAtCanonicalSlot(round, j);
      const { rowStart, span } = matchGridPlacement(rounds, ri, j, N, useCompactSixTeamByeLayout);
      if (m) {
        if (isFinalSingleMatchPodium) {
          const p = podium!;
          cells.push(
            <div
              key={m.id}
              className={[
                styles.gridMatchWrap,
                styles.finalRoundPodiumGridWrap,
                useCompactSixTeamByeLayout ? styles.finalRoundPodiumGridWrapCompactSix : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ gridColumn: col, gridRow: `${rowStart} / span ${span}` }}
            >
              <div className={styles.finalRoundPodiumInner}>
                <div className={styles.finalRoundChampionshipSlot}>
                  <MatchArticle
                    match={m}
                    gameLabel={matchGameBadge(m)}
                    liveStatus={liveGameStatuses?.[m.id]}
                    schedule={m}
                    podiumChampionSource
                    scoring={scoring}
                    onMatchClick={onMatchClick}
                    gameChangerEnabled={gameChangerEnabled}
                  />
                </div>
                <div
                  className={styles.thirdPlaceGameBottomRow}
                  {...{ [BRACKET_PODIUM_THIRD_BAND_ATTR]: "game" }}
                >
                  <ThirdPlaceMatchArticle
                    podium={p}
                    scoring={scoring}
                    liveStatus={liveGameStatuses?.[BRACKET_THIRD_PLACE_MATCH_ID]}
                    onMatchClick={onMatchClick}
                    gameChangerEnabled={gameChangerEnabled}
                  />
                </div>
              </div>
            </div>,
          );
        } else {
          cells.push(
            <div
              key={m.id}
              className={styles.gridMatchWrap}
              style={{ gridColumn: col, gridRow: `${rowStart} / span ${span}` }}
            >
              <MatchArticle
                match={m}
                gameLabel={matchGameBadge(m)}
                liveStatus={liveGameStatuses?.[m.id]}
                schedule={m}
                scoring={scoring}
                onMatchClick={onMatchClick}
                gameChangerEnabled={gameChangerEnabled}
              />
            </div>,
          );
        }
      } else {
        cells.push(
          <div
            key={`slot-${round.id}-${j}`}
            className={styles.gridSlotFiller}
            style={{ gridColumn: col, gridRow: `${rowStart} / span ${span}` }}
            aria-hidden
          />,
        );
      }
    }
  }

  for (let ri = 0; ri < R - 1; ri++) {
    const prevRound = rounds[ri]!;
    const nextRound = rounds[ri + 1]!;
    const nextSlotCount = nextRound.layoutSlotCount ?? nextRound.matches.length;
    const span = rowSpanForMatch(N, nextSlotCount);
    const col = 2 * (ri + 1);
    for (let j = 0; j < nextSlotCount; j++) {
      const topHas = matchAtCanonicalSlot(prevRound, 2 * j) != null;
      const bottomHas = matchAtCanonicalSlot(prevRound, 2 * j + 1) != null;
      const topMatchId = matchAtCanonicalSlot(prevRound, 2 * j)?.id;
      const bottomMatchId = matchAtCanonicalSlot(prevRound, 2 * j + 1)?.id;
      const targetMatchId = matchAtCanonicalSlot(nextRound, j)?.id;
      const variant = getBracketConnectorVariant(topHas, bottomHas);
      const feedsFinalPodiumMatch = hasPodium && ri + 1 === R - 1;
      const rowStart = 2 + j * span;
      cells.push(
        <div
          key={`conn-${ri}-${j}`}
          className={styles.connectorCell}
          style={{ gridColumn: col, gridRow: `${rowStart} / span ${span}` }}
        >
          <BracketConnectorCell
            variant={variant}
            feedsFinalPodiumMatch={feedsFinalPodiumMatch}
            topMatchId={topMatchId}
            bottomMatchId={bottomMatchId}
            targetMatchId={targetMatchId}
          />
        </div>,
      );
    }
  }

  if (hasPodium && podium) {
    const { rowStart: rowStartFinal, span: spanFinal } = podiumColumnGridPlacement(
      N,
      useCompactSixTeamByeLayout,
    );
    cells.push(
      <div
        key="conn-final-champion"
        className={styles.connectorCell}
        style={{ gridColumn: 2 * R, gridRow: `${rowStartFinal} / span ${spanFinal}` }}
      >
        <FinalChampionConnectorCell />
      </div>,
    );
    cells.push(
      <ChampionRoundColumn
        key="champion-round-cell"
        podium={podium}
        className={[
          styles.championRoundGridCell,
          useCompactSixTeamByeLayout ? styles.championRoundGridCellCompactSix : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ gridColumn: 2 * R + 1, gridRow: `${rowStartFinal} / span ${spanFinal}` }}
      />,
    );
  }

  const grid = (
    <div ref={gridRef} className={`${styles.bracketGrid} ${styles.bracketGridScroll}`} style={gridStyle}>
      {cells}
    </div>
  );

  if (embedded) {
    return <FullBracketDiagramFrame>{grid}</FullBracketDiagramFrame>;
  }

  return (
    <BracketSurface
      rootClass={rootClass}
      rootStyle={style ?? {}}
      colorScheme={colorScheme}
      ariaLabel="Tournament bracket"
      title={title ? <h3 className={styles.title}>{title}</h3> : null}
      parkInfo={parkInfo}
      logoWatermarkUrl={logoWatermarkUrl}
      parentOrganizationLogo={parentOrganizationLogo}
      podium={null}
      parkBelowTitle={!parkInPodiumHeader}
    >
      <MobileBracketRounds
        rounds={rounds}
        podium={podium}
        scoring={scoring}
        liveGameStatuses={liveGameStatuses}
        onMatchClick={onMatchClick}
        gameChangerEnabled={gameChangerEnabled}
      />
      <FullBracketDiagramFrame>{grid}</FullBracketDiagramFrame>
    </BracketSurface>
  );
}

function DoubleEliminationBracketView({
  layout,
  rootClass,
  rootStyle,
  colorScheme,
  bracketTitle,
  parkInfo,
  tournamentInfo,
  visualTuning,
  logoWatermarkUrl,
  parentOrganizationLogo,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
  fluidWidth = false,
}: {
  layout: Extract<BracketLayout, { mode: "double_elimination" }>;
  rootClass: string;
  rootStyle?: CSSProperties;
  colorScheme: BracketColorScheme;
  bracketTitle: string;
  parkInfo?: BracketParkInfo | null;
  tournamentInfo?: BracketTournamentInfo | null;
  visualTuning?: BracketVisualTuning | null;
  logoWatermarkUrl?: string | null;
  parentOrganizationLogo?: BracketParentOrganizationLogo | null;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
  fluidWidth?: boolean;
}) {
  const mobileRounds: LayoutRound[] = [
    layout.winnersBracket.rounds,
    layout.losersBracket?.rounds ?? [],
    layout.championship
      ? [{ id: "championship", label: layout.championship.label, matches: layout.championship.matches }]
      : [],
  ].flat();

  const allMatchesByGame = collectAllDoubleElimMatchesByGame(
    layout.winnersBracket.rounds,
    layout.losersBracket?.rounds,
    layout.championship?.matches,
  );
  const ifNecessaryMatch =
    layout.mode === "double_elimination" ? layout.classicChampionshipPodium?.ifNecessaryMatch : null;
  if (ifNecessaryMatch?.officialGameNumber?.trim()) {
    allMatchesByGame.set(ifNecessaryMatch.officialGameNumber.trim(), ifNecessaryMatch);
  }
  const classicSixSlots =
    layout.diagramStyle === "classic_unified" && layout.classicVariant === "six_team_modified_de"
      ? resolveClassicSixTeamModifiedDeSlots(allMatchesByGame)
      : null;
  const classicThreeSlots =
    layout.diagramStyle === "classic_unified" && layout.classicVariant === "three_team"
      ? resolveClassicThreeTeamDoubleElimSlots(allMatchesByGame)
      : null;
  const classicFiveResolveOptions = layout.officialTemplateId
    ? { officialTemplateId: layout.officialTemplateId }
    : undefined;
  const classicFiveSlots =
    layout.diagramStyle === "classic_unified" && layout.classicVariant === "five_team"
      ? resolveClassicDoubleElimSlots(allMatchesByGame, classicFiveResolveOptions)
      : null;

  const renderMatch = (props: {
    match: LayoutMatch;
    scoring?: BracketScoringViewProps | null;
    liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
    onMatchClick?: (matchId: string) => void;
    gameChangerEnabled?: boolean;
  }) => (
    <MatchArticle
      match={props.match}
      gameLabel={matchGameBadge(props.match)}
      liveStatus={props.liveGameStatuses?.[props.match.id]}
      schedule={props.match}
      scoring={props.scoring}
      onMatchClick={props.onMatchClick}
      gameChangerEnabled={props.gameChangerEnabled}
    />
  );

  const useClassicUnifiedDiagram = Boolean(classicThreeSlots || classicSixSlots || classicFiveSlots);

  return (
    <BracketSurface
      rootClass={rootClass}
      rootStyle={rootStyle ?? {}}
      colorScheme={colorScheme}
      ariaLabel="Double elimination tournament bracket"
      title={bracketTitle ? <h3 className={styles.title}>{bracketTitle}</h3> : null}
      parkInfo={parkInfo}
      logoWatermarkUrl={logoWatermarkUrl}
      parentOrganizationLogo={parentOrganizationLogo}
      podium={null}
      parkBelowTitle={!useClassicUnifiedDiagram && hasBracketParkInfo(parkInfo)}
    >
      <MobileBracketRounds
        rounds={mobileRounds}
        podium={null}
        scoring={scoring}
        liveGameStatuses={liveGameStatuses}
        onMatchClick={onMatchClick}
        gameChangerEnabled={gameChangerEnabled}
      />
      <FullBracketDiagramFrame>
        {classicSixSlots ? (
          <ClassicSixTeamModifiedDeDiagram
            slots={classicSixSlots}
            tournamentInfo={tournamentInfo}
            visualTuning={visualTuning}
            championPodium={layout.classicChampionshipPodium ?? null}
            renderMatch={renderMatch}
            scoring={scoring}
            liveGameStatuses={liveGameStatuses}
            onMatchClick={onMatchClick}
            gameChangerEnabled={gameChangerEnabled}
            fluidWidth={fluidWidth}
          />
        ) : classicThreeSlots ? (
          <ClassicDoubleElimDiagram
            slots={classicThreeSlots}
            variant="three_team"
            tournamentInfo={tournamentInfo}
            visualTuning={visualTuning}
            championPodium={layout.classicChampionshipPodium ?? null}
            renderMatch={renderMatch}
            scoring={scoring}
            liveGameStatuses={liveGameStatuses}
            onMatchClick={onMatchClick}
            gameChangerEnabled={gameChangerEnabled}
            fluidWidth={fluidWidth}
          />
        ) : classicFiveSlots ? (
          <ClassicDoubleElimDiagram
            slots={classicFiveSlots}
            variant="five_team"
            tournamentInfo={tournamentInfo}
            visualTuning={visualTuning}
            championPodium={layout.classicChampionshipPodium ?? null}
            renderMatch={renderMatch}
            scoring={scoring}
            liveGameStatuses={liveGameStatuses}
            onMatchClick={onMatchClick}
            gameChangerEnabled={gameChangerEnabled}
            fluidWidth={fluidWidth}
          />
        ) : (
        <div className={styles.doubleElimDiagram}>
          <div className={styles.doubleElimMainRow}>
            <div className={styles.doubleElimSection}>
              <p className={styles.doubleElimSectionLabel}>{layout.winnersBracket.label}</p>
              <ConnectedBracketGrid
                embedded
                rounds={layout.winnersBracket.rounds}
                laneRows={layout.winnersBracket.connectedLaneRowCount}
                title=""
                rootClass={rootClass}
                colorScheme={colorScheme}
                scoring={scoring}
                liveGameStatuses={liveGameStatuses}
                onMatchClick={onMatchClick}
                gameChangerEnabled={gameChangerEnabled}
              />
            </div>
            {layout.losersBracket ? (
              <div className={styles.doubleElimSection}>
                <p className={styles.doubleElimSectionLabel}>{layout.losersBracket.label}</p>
                <ConnectedBracketGrid
                  embedded
                  rounds={layout.losersBracket.rounds}
                  laneRows={layout.losersBracket.connectedLaneRowCount}
                  title=""
                  rootClass={rootClass}
                  colorScheme={colorScheme}
                  scoring={scoring}
                  liveGameStatuses={liveGameStatuses}
                  onMatchClick={onMatchClick}
                  gameChangerEnabled={gameChangerEnabled}
                />
              </div>
            ) : null}
            {layout.championship ? (
              <div className={styles.doubleElimChampionship}>
                <p className={styles.doubleElimSectionLabel}>{layout.championship.label}</p>
                <ol className={styles.doubleElimChampionshipList}>
                  {layout.championship.matches.map((m) => (
                    <li key={m.id}>
                      <MatchArticle
                        match={m}
                        gameLabel={matchGameBadge(m)}
                        liveStatus={liveGameStatuses?.[m.id]}
                        schedule={m}
                        scoring={scoring}
                        onMatchClick={onMatchClick}
                        gameChangerEnabled={gameChangerEnabled}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </div>
        )}
      </FullBracketDiagramFrame>
    </BracketSurface>
  );
}

export default function TournamentBracketView({
  layout,
  className,
  style,
  themeColors,
  colorScheme = "light",
  logoWatermarkUrl,
  parentOrganizationLogo,
  parkInfo,
  tournamentInfo,
  visualTuning,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
  surfaceTitleOverride,
  fluidWidth = false,
}: Props) {
  const rootClass = [styles.root, fluidWidth ? styles.rootFluidWidth : null, className]
    .filter(Boolean)
    .join(" ");
  const rootStyle = mergeRootStyle(themeColors, colorScheme, style);
  const divisionForHeading = layout.mode === "empty" ? undefined : layout.divisionLabel;
  const headingLabel = surfaceTitleOverride?.trim() || divisionForHeading;

  if (layout.mode === "empty") {
    return (
      <BracketSurface
        rootClass={rootClass}
        rootStyle={rootStyle}
        colorScheme={colorScheme}
        ariaLabel="Bracket preview"
        title={layout.title ? <h3 className={styles.title}>{layout.title}</h3> : null}
        parkInfo={parkInfo}
        logoWatermarkUrl={logoWatermarkUrl}
        parentOrganizationLogo={parentOrganizationLogo}
        podium={null}
      >
        <p className={styles.emptyMessage}>{layout.message}</p>
      </BracketSurface>
    );
  }

  if (layout.mode === "match_grid") {
    const matchGridTitle = bracketSurfaceTitle(headingLabel, `Games (${layout.games.length})`);
    return (
      <BracketSurface
        rootClass={rootClass}
        rootStyle={rootStyle}
        colorScheme={colorScheme}
        ariaLabel="Tournament games"
        title={
          matchGridTitle ? <h3 className={styles.title}>{matchGridTitle}</h3> : null
        }
        parkInfo={parkInfo}
        logoWatermarkUrl={logoWatermarkUrl}
        parentOrganizationLogo={parentOrganizationLogo}
        podium={null}
      >
        <ul className={styles.grid}>
          {layout.games.map((g, i) => (
            <li key={g.id} className={styles.gameCard}>
              <div className={styles.gameMeta}>
                {[g.dateLabel, g.time, g.venue, g.field].filter(Boolean).join(" · ") || `Game ${i + 1}`}
              </div>
              <div className={styles.gameTeams}>
                {g.homeTeam}
                <div className={styles.vs}>vs</div>
                {g.awayTeam}
              </div>
            </li>
          ))}
        </ul>
      </BracketSurface>
    );
  }

  if (layout.mode === "double_elimination") {
    const bracketTitle = bracketSurfaceTitle(headingLabel);
    return (
      <DoubleEliminationBracketView
        layout={layout}
        rootClass={rootClass}
        rootStyle={rootStyle}
        colorScheme={colorScheme}
        bracketTitle={bracketTitle}
        parkInfo={parkInfo}
        tournamentInfo={tournamentInfo}
        visualTuning={visualTuning}
        logoWatermarkUrl={logoWatermarkUrl}
        parentOrganizationLogo={parentOrganizationLogo}
        scoring={scoring}
        liveGameStatuses={liveGameStatuses}
        onMatchClick={onMatchClick}
        gameChangerEnabled={gameChangerEnabled}
        fluidWidth={fluidWidth}
      />
    );
  }

  const bracketTitle = bracketSurfaceTitle(headingLabel);
  const podium = layout.podium ?? null;
  const isCompactSixTeamBracket =
    layout.treeLayout === "connected" &&
    layout.connectedLaneRowCount === 4 &&
    layout.rounds[0]?.layoutSlotCount === 4 &&
    layout.rounds[0]?.matches.length === 2;
  const treeRootClass = isCompactSixTeamBracket
    ? `${rootClass} ${styles.rootCompactSixTeam}`
    : rootClass;

  if (layout.treeLayout === "connected") {
    const laneRows =
      layout.connectedLaneRowCount ??
      layout.rounds[0]?.layoutSlotCount ??
      layout.rounds[0]?.matches.length ??
      0;
    return (
      <ConnectedBracketGrid
        rounds={layout.rounds}
        laneRows={laneRows}
        title={bracketTitle}
        rootClass={treeRootClass}
        style={rootStyle}
        colorScheme={colorScheme}
        parkInfo={parkInfo}
        logoWatermarkUrl={logoWatermarkUrl}
        parentOrganizationLogo={parentOrganizationLogo}
        podium={podium}
        scoring={scoring}
        liveGameStatuses={liveGameStatuses}
        onMatchClick={onMatchClick}
        gameChangerEnabled={gameChangerEnabled}
      />
    );
  }

  return (
    <BracketSurface
      rootClass={rootClass}
      rootStyle={rootStyle}
      colorScheme={colorScheme}
      ariaLabel="Tournament bracket"
      title={bracketTitle ? <h3 className={styles.title}>{bracketTitle}</h3> : null}
      parkInfo={parkInfo}
      logoWatermarkUrl={logoWatermarkUrl}
      parentOrganizationLogo={parentOrganizationLogo}
      podium={podium}
      parkBelowTitle={!(podium != null && hasBracketParkInfo(parkInfo))}
    >
      <MobileBracketRounds
        rounds={layout.rounds}
        podium={podium}
        scoring={scoring}
        liveGameStatuses={liveGameStatuses}
        onMatchClick={onMatchClick}
        gameChangerEnabled={gameChangerEnabled}
      />
      <FullBracketDiagramFrame>
        <div className={styles.tree}>
          {layout.rounds.map((round) => (
            <section key={round.id} className={styles.round}>
              <ol className={styles.matchList}>
                {round.matches.map((m) => (
                  <li key={m.id}>
                    <MatchArticle
                      match={m}
                      gameLabel={matchGameBadge(m)}
                      liveStatus={liveGameStatuses?.[m.id]}
                      schedule={m}
                      scoring={scoring}
                      onMatchClick={onMatchClick}
                      gameChangerEnabled={gameChangerEnabled}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </FullBracketDiagramFrame>
    </BracketSurface>
  );
}
