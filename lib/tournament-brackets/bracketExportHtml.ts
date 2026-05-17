import type { BracketLayout, BracketLayoutPodium, LayoutMatch, LayoutRound } from "@/lib/tournament-brackets/bracketLayout";
import {
  bracketSurfaceTitle,
  declaredChampionFromFinalSlots,
  declaredThirdPlaceFromSlots,
  formatBracketGameBadge,
  matchCardGameInfoLines,
} from "@/lib/tournament-brackets/bracketDisplayLabels";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import type { BracketParkInfo } from "@/lib/tournament-brackets/bracketSpec";
import {
  BRACKET_CONNECTOR_EXPORT_ASSUMED_H,
  BRACKET_CONNECTOR_EXPORT_ASSUMED_W,
  bracketConnectorBothForHtmlExport,
  bracketConnectorCenterFeederFromSize,
  bracketConnectorHorizontalAtPercentFromSize,
  bracketConnectorPaintScriptSource,
  bracketConnectorSingleFromSize,
  BRACKET_PODIUM_CHAMPION_SOURCE_ATTR,
  BRACKET_PODIUM_CHAMPION_TARGET_ATTR,
  BRACKET_PODIUM_THIRD_SOURCE_ATTR,
  BRACKET_PODIUM_THIRD_TARGET_ATTR,
  getBracketConnectorVariant,
  type BracketConnectorVariant,
} from "@/lib/tournament-brackets/bracketConnectorPaths";
import {
  bracketThemeCssVarsString,
  type BracketThemeColors,
} from "@/lib/tournament-brackets/bracketTheme";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EXPORT_THEME_FALLBACK: BracketThemeColors = {
  primaryHex: "#002f6c",
  accentHex: "#c8102e",
};

/** LLBWS-style bracket surface (matches TournamentBracketView.module.css). */
const EMBEDDED_CSS = `
html { box-sizing: border-box; }
*, *::before, *::after { box-sizing: inherit; }
:root { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
body { margin: 0; padding: 1.5rem; background: #e8edf4; color: #001a3d; min-width: 0; overflow-x: auto; }
h1 { font-size: 1.5rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 1rem; color: #001a3d; }
.bracket-root {
  --bracket-bg: #eef2f7;
  --bracket-surface: #ffffff;
  --bracket-border: #c5d0e0;
  --bracket-fg: #002f6c;
  --bracket-muted: #4a667f;
  --bracket-accent: #c8102e;
  --bracket-navy-deep: #001a3d;
  --bracket-round-divider: rgb(0 47 108 / 0.12);
  --bracket-card-shadow: 0 1px 2px rgb(0 47 108 / 0.06), 0 2px 8px rgb(0 26 61 / 0.06);
  --bracket-card-shadow-hover: 0 2px 4px rgb(0 47 108 / 0.08), 0 6px 16px rgb(0 26 61 / 0.08);
  --bracket-connector-opacity: 0.48;
  --bracket-podium-third-band-min-height: 7rem;
  position: relative;
  isolation: isolate;
  max-width: 100%;
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
  background: var(--bracket-bg);
  color: var(--bracket-fg);
  border: 1px solid var(--bracket-border);
  border-radius: 8px;
  padding: 1.125rem 1.25rem 3.35rem;
}
.bracket-title {
  position: relative;
  font-size: clamp(1.05rem, 2.8vw, 1.45rem);
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.075em;
  color: #ffffff;
  margin: 0 0 1.15rem;
  line-height: 1.12;
  text-align: center;
  text-wrap: balance;
  overflow-wrap: anywhere;
  padding: 0.7rem 3.25rem 0.72rem;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-bottom: 4px solid var(--bracket-accent);
  border-radius: 0.55rem;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.12), transparent 34%),
    linear-gradient(90deg, var(--bracket-navy-deep), var(--bracket-fg) 52%, var(--bracket-navy-deep));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.22),
    inset 0 -1px 0 rgb(0 0 0 / 0.28),
    0 0.55rem 1.1rem rgb(0 26 61 / 0.16);
  text-shadow: 0 2px 0 rgb(0 0 0 / 0.32), 0 0 1rem rgb(0 0 0 / 0.22);
}
.bracket-title::before,
.bracket-title::after {
  position: absolute;
  top: 50%;
  width: 1.45rem;
  height: 1.45rem;
  transform: translateY(-50%);
  border-radius: 999px;
  border: 2px solid rgb(255 255 255 / 0.85);
  background:
    linear-gradient(90deg, transparent 44%, var(--bracket-accent) 44% 56%, transparent 56%),
    #ffffff;
  box-shadow: inset 0 0 0 2px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.22);
  content: "";
}
.bracket-title::before {
  left: 1rem;
}
.bracket-title::after {
  right: 1rem;
}
.bracket-root-foreground { position: relative; z-index: 1; }
.bracket-watermark-img {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  width: min(118%, 42rem);
  max-height: 96%;
  object-fit: contain;
  opacity: 0.052;
  pointer-events: none;
  z-index: 0;
  user-select: none;
}
.bracket-powered-by {
  position: absolute;
  right: 0.95rem;
  bottom: 0.85rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: min(50%, 15rem);
  padding: 0.25rem 0.35rem 0.25rem 0.45rem;
  border-radius: 999px;
  border: 1px solid rgb(0 47 108 / 0.1);
  background: rgb(255 255 255 / 0.64);
  box-shadow: 0 1px 3px rgb(0 26 61 / 0.08);
}
.bracket-powered-by-text {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 0.52rem;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.045em;
  color: var(--bracket-muted);
  white-space: nowrap;
}
.bracket-powered-by-logo {
  width: auto;
  height: 1.35rem;
  max-width: 4.5rem;
  object-fit: contain;
  user-select: none;
}
.bracket-park {
  margin: 0 0 0.85rem;
  padding: 0.55rem 0.65rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--bracket-border);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 1px 2px rgb(0 47 108 / 0.05);
}
.bracket-park-heading {
  margin: 0 0 0.35rem;
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bracket-navy-deep);
}
.bracket-park-body { margin: 0; }
.bracket-park-line {
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.45;
  color: var(--bracket-muted);
}
.bracket-park-line + .bracket-park-line { margin-top: 0.2rem; }
.bracket-park-contacts {
  margin-top: 0.55rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgb(0 47 108 / 0.1);
}
.bracket-park-contacts-h {
  font-size: 0.625rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--bracket-navy-deep);
  margin: 0 0 0.35rem;
}
.bracket-park-contact-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.bracket-park-contact-item {
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.35;
}
.bracket-park-contact-name {
  font-weight: 700;
  color: var(--bracket-navy-deep);
}
.bracket-park-contact-phone {
  font-weight: 600;
  color: var(--bracket-muted);
  font-variant-numeric: tabular-nums;
  margin-top: 0.08rem;
}
.match-schedule-meta {
  padding: 0.35rem 0.55rem 0.45rem;
  font-size: 0.625rem;
  line-height: 1.4;
  font-weight: 500;
  color: var(--bracket-muted);
  background: rgb(248 250 252 / 0.95);
}
.match-schedule-line { margin: 0; }
.match-schedule-line + .match-schedule-line { margin-top: 0.12rem; }
.match-game-info-between {
  text-align: center;
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
}
.match-schedule-meta-placeholder {
  font-style: italic;
  color: var(--bracket-muted);
}
.bracket-html-match-wrap .match-schedule-meta {
  font-size: 0.6rem;
  padding: 0.28rem 0.45rem 0.35rem;
}
.tree { display: flex; flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
.round {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 12rem;
  padding: 0 0.875rem;
  border-right: 1px solid var(--bracket-round-divider, rgb(0 47 108 / 0.12));
}
.round:first-child { padding-left: 0; }
.round:last-child { border-right: none; padding-right: 0; }
.round-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #fff;
  background: var(--bracket-fg);
  margin: 0 0 0.35rem;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  text-align: center;
  box-shadow: inset 0 -2px 0 rgb(0 0 0 / 0.12);
}
.match-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
.match {
  border: 1px solid var(--bracket-border);
  border-radius: 6px;
  border-left: 4px solid var(--bracket-accent);
  background: var(--bracket-surface);
  box-shadow: var(--bracket-card-shadow);
  overflow: hidden;
}
.slot {
  position: relative;
  padding: 0.5rem 0.65rem 0.5rem 1.35rem;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--bracket-navy-deep);
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  min-width: 0;
}
.slot-fit-label {
  display: block;
  flex: 1 1 0;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}
.slot-with-score {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
}
.slot-score-read {
  flex: 0 0 auto;
  width: 2rem;
  min-width: 2rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--bracket-navy-deep);
  border: 1px solid var(--bracket-border);
  border-radius: 0.25rem;
  background: #fff;
  padding: 0.2rem 0.15rem;
  box-sizing: border-box;
}
.slot::before {
  content: "";
  position: absolute;
  left: 0.55rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 999px;
  background: var(--bracket-fg);
  opacity: 0.35;
}
.slot:last-child { border-bottom: none; }
.slot + .slot { background: #f7fafc; font-weight: 500; }
.slot-bye { font-style: italic; font-weight: 500; color: var(--bracket-muted); }
.bracket-body-row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0.35rem;
  width: 100%;
  min-width: 0;
}
.bracket-main-pane { flex: 1 1 0; min-width: 0; }
.flat-champion-gutter {
  flex: 0 0 minmax(1.25rem, 0.28fr);
  max-width: 3.5rem;
  min-width: 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.flat-champion-gutter .bracket-html-connector {
  flex: 1 1 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.champion-round-grid-cell {
  position: relative;
  align-self: stretch;
  min-width: 0;
  min-height: 100%;
  height: 100%;
  width: 100%;
}
.champion-round-column {
  position: relative;
  align-self: stretch;
  min-height: 100%;
  min-width: 0;
  width: 100%;
}
.flat-champion-column .champion-round-column {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}
.champion-plaque-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 3px;
  z-index: 1;
  pointer-events: none;
}
.champion-plaque-wrap .champion-plaque { pointer-events: auto; }
.champion-plaque {
  border: 1px solid var(--bracket-border);
  border-radius: 8px;
  border-left: 4px solid var(--bracket-fg);
  background: linear-gradient(165deg, #fff 0%, #f4f7fb 100%);
  box-shadow: var(--bracket-card-shadow);
  padding: 0.55rem 0.65rem 0.65rem;
  text-align: center;
  width: 100%;
  max-width: 100%;
}
.champion-plaque-title {
  font-size: 0.625rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--bracket-muted);
  margin: 0 0 0.35rem;
}
.champion-plaque-name {
  font-size: clamp(0.85rem, 2vw, 1.05rem);
  font-weight: 800;
  line-height: 1.2;
  color: var(--bracket-navy-deep);
  margin: 0;
}
.champion-plaque-undecided {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 3.75rem;
  padding-top: 0.1rem;
  padding-bottom: 0.1rem;
}
.champion-plaque-title-centered {
  margin: 0;
  font-size: clamp(0.8125rem, 2.1vw, 1.05rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.055em;
  color: var(--bracket-navy-deep);
  text-align: center;
  line-height: 1.28;
  text-wrap: balance;
  max-width: 12rem;
}
.third-place-plaque-bottom-row,
.third-place-game-bottom-row {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: var(--bracket-podium-third-band-sync-height, var(--bracket-podium-third-band-min-height));
  box-sizing: border-box;
  padding-top: 0.25rem;
  background: linear-gradient(to top, var(--bracket-bg) 70%, transparent);
}
.third-place-plaque-bottom-row {
  justify-content: center;
  padding-left: 0.2rem;
  padding-right: 0.2rem;
}
.third-place-game-bottom-row .third-place-match { width: 100%; flex: 0 1 auto; align-self: center; }
.third-place-plaque-bottom-row .third-place-plaque-slot {
  width: 100%;
  max-width: 100%;
  align-self: center;
  box-sizing: border-box;
}
.third-place-match { flex: 1 1 0; min-width: 0; border-left-color: var(--bracket-fg); }
.third-place-match-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bracket-fg);
  padding: 0.35rem 0.55rem 0.25rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to bottom, #fff, #fafbfd);
  text-align: center;
}
.third-place-plaque-slot {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.55rem 0.5rem;
}
.third-place-plaque-slot.champion-plaque-undecided { min-height: 3.75rem; }
.third-place-plaque-slot .champion-plaque-title {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.07em;
}
.third-place-plaque-slot .champion-plaque-name {
  font-size: clamp(0.75rem, 1.6vw, 0.875rem);
  font-weight: 700;
  color: var(--bracket-muted);
}
.third-place-plaque-slot .champion-plaque-title-centered {
  font-size: clamp(0.6875rem, 1.5vw, 0.8125rem);
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--bracket-muted);
}
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.75rem; }
.game-card {
  border: 1px solid var(--bracket-border);
  border-radius: 6px;
  border-left: 4px solid var(--bracket-fg);
  background: var(--bracket-surface);
  padding: 0.65rem 0.85rem;
  font-size: 0.8125rem;
  box-shadow: var(--bracket-card-shadow);
}
.game-meta {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bracket-accent);
  margin-bottom: 0.45rem;
}
.game-card > div:last-child { font-weight: 600; line-height: 1.45; color: var(--bracket-navy-deep); }
.vs {
  color: var(--bracket-muted);
  font-weight: 600;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0.15rem 0;
}
.empty { color: var(--bracket-muted); font-size: 0.875rem; line-height: 1.55; }
.bracket-html-grid {
  align-items: stretch;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.bracket-html-grid-scroll {
  overflow-x: visible;
  overflow-y: visible;
  padding-bottom: 0.35rem;
}
.bracket-html-grid-schedule-hdr {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--bracket-navy-deep);
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--bracket-border);
  border-radius: 6px;
  padding: 0.38rem 0.45rem;
  text-align: center;
  align-self: stretch;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 2.5rem;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgb(0 47 108 / 0.05);
}
.bracket-html-grid-schedule-hdr-placeholder {
  color: var(--bracket-muted);
  font-weight: 500;
  font-style: italic;
}
.bracket-html-grid-schedule-line { margin: 0; overflow-wrap: anywhere; word-break: break-word; }
.bracket-html-grid-hdr-spacer { min-height: 2.5rem; }
.bracket-html-grid-park-cell {
  align-self: stretch;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.bracket-html-grid-park-cell .bracket-park { margin: 0; }
.flat-champion-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  flex: 0 1 minmax(10rem, 1fr);
  align-self: stretch;
}
.flat-champion-park-slot { flex: 0 0 auto; margin-bottom: 0.35rem; }
.flat-champion-park-slot .bracket-park { margin: 0; }
.flat-champion-column .champion-round-column { flex: 1 1 auto; min-height: 0; }
.bracket-html-round-schedule-hdr { margin: 0 0 0.5rem; }
.bracket-html-match-wrap { display: flex; flex-direction: column; justify-content: center; min-height: 100%; }
.bracket-html-final-round-podium-wrap { justify-content: stretch; position: relative; min-width: 9rem; }
.bracket-html-final-round-podium-wrap .bracket-html-final-round-podium-inner {
  flex: 1 1 0;
  min-height: 100%;
  height: 100%;
  width: 100%;
}
.bracket-html-final-round-podium-inner {
  position: relative;
  flex: 1 1 auto;
  min-height: 100%;
  width: 100%;
}
.bracket-html-final-championship-slot {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  box-sizing: border-box;
  pointer-events: none;
}
.bracket-html-final-championship-slot > article.match {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  pointer-events: auto;
}
.bracket-html-match-wrap .match {
  border-radius: 8px;
  border-left-width: 3px;
  border-color: var(--bracket-border);
}
.bracket-html-match-wrap .matchGameBadge {
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  padding: 0.3rem 0.5rem 0.22rem;
}
.bracket-html-match-wrap .slot {
  padding: 0.55rem 0.65rem 0.55rem 1.35rem;
  line-height: 1.4;
  text-align: left;
}
.bracket-html-slot-filler { min-height: 100%; box-sizing: border-box; }
.bracket-html-connector {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  align-self: stretch;
  min-height: 100%;
  height: 100%;
  color: var(--bracket-fg);
  opacity: var(--bracket-connector-opacity);
  min-width: 0;
}
.bracket-html-connector-dynamic {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.bracket-html-connector-dynamic svg {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: visible;
}
.bracket-html-connector > .bracket-html-connector-dynamic svg { min-height: 3.5rem; }
.bracket-html-connector-podium-stack {
  position: relative;
  flex: 1 1 auto;
  align-self: stretch;
  width: 100%;
  min-height: 100%;
  height: 100%;
}
.bracket-html-connector-podium-stack > .bracket-html-connector-dynamic {
  position: absolute;
  inset: 0;
  flex: none;
  min-height: 0;
}
.match-game-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bracket-accent);
  padding: 0.35rem 0.55rem 0.25rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to bottom, #fff, #fafbfd);
  text-align: left;
}
@media print {
  body { padding: 0.35in; }
  h1 { font-size: 1.1rem; margin-bottom: 0.5rem; }
  .bracket-root {
    overflow-x: visible !important;
    max-width: none !important;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bracket-html-grid-scroll {
    overflow: visible !important;
    max-width: none !important;
    padding-bottom: 0;
  }
  .bracket-html-grid { max-width: none !important; }
  .bracket-html-match-wrap,
  .bracket-html-final-round-podium-wrap,
  .bracket-html-connector,
  article.match {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .bracket-body-row { flex-wrap: nowrap; }
  .bracket-podium,
  .champion-plaque,
  .third-place-plaque-slot,
  .third-place-match {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

function connectorBothHtml(): string {
  const { viewBox, d } = bracketConnectorBothForHtmlExport();
  const stroke =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<div data-bracket-connector="both" class="bracket-html-connector-dynamic" aria-hidden="true"><svg viewBox="${viewBox}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="${d}" ${stroke}/></svg></div>`;
}

function connectorSvgHtml(variant: BracketConnectorVariant): string {
  if (variant === "both") {
    return connectorBothHtml();
  }
  if (variant === "center") {
    const { viewBox, d } = bracketConnectorCenterFeederFromSize(
      BRACKET_CONNECTOR_EXPORT_ASSUMED_W,
      BRACKET_CONNECTOR_EXPORT_ASSUMED_H,
    );
    const stroke =
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    return `<div data-bracket-connector="center" class="bracket-html-connector-dynamic" aria-hidden="true"><svg viewBox="${viewBox}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="${d}" ${stroke}/></svg></div>`;
  }
  if (variant === "none") {
    return `<div class="bracket-html-connector-dynamic" aria-hidden="true" style="min-height:2rem"></div>`;
  }
  const { viewBox, d } = bracketConnectorSingleFromSize(
    BRACKET_CONNECTOR_EXPORT_ASSUMED_W,
    BRACKET_CONNECTOR_EXPORT_ASSUMED_H,
    variant,
  );
  const stroke =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<div data-bracket-connector="${variant}" class="bracket-html-connector-dynamic" aria-hidden="true"><svg viewBox="${viewBox}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="${d}" ${stroke}/></svg></div>`;
}

function connectorPodiumThirdHtml(): string {
  const { viewBox, d } = bracketConnectorHorizontalAtPercentFromSize(
    BRACKET_CONNECTOR_EXPORT_ASSUMED_W,
    BRACKET_CONNECTOR_EXPORT_ASSUMED_H,
    85,
  );
  const stroke =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<div data-bracket-connector="podium-third" class="bracket-html-connector-dynamic" aria-hidden="true"><svg viewBox="${viewBox}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="${d}" ${stroke}/></svg></div>`;
}

function finalChampionConnectorHtmlExport(): string {
  return `<div class="bracket-html-connector-podium-stack">${connectorSvgHtml("center")}${connectorPodiumThirdHtml()}</div>`;
}

function rowSpanHtml(N: number, layoutSlotCountInRound: number): number {
  return N / layoutSlotCountInRound;
}

function matchAtCanonicalSlotHtml(round: LayoutRound, slotIndex: number): LayoutMatch | null {
  if (round.layoutSlotCount != null) {
    return round.matches.find((x) => x.canonicalSlotIndex === slotIndex) ?? null;
  }
  return round.matches[slotIndex] ?? null;
}

function matchGameBadgeHtml(m: { officialGameNumber?: string }): string {
  const badge = formatBracketGameBadge(m.officialGameNumber);
  if (!badge) return "";
  return `<div class="match-game-badge">${esc(badge)}</div>`;
}

export type BracketExportViewOptions = {
  logoWatermarkUrl?: string | null;
  parentOrganizationLogo?: {
    src: string;
    name?: string;
  } | null;
  parkInfo?: BracketParkInfo | null;
  /** Optional label for the bracket surface H2 (e.g. project name); else `layout.divisionLabel`. */
  surfaceHeadingLabel?: string | null;
};

function parkInfoAsideHtml(park: BracketParkInfo | null | undefined): string {
  const h = park?.heading?.trim();
  const b = park?.body?.trim();
  const contacts =
    park?.contacts?.filter((c) => Boolean(c.name?.trim() || c.phone?.trim())) ?? [];
  if (!h && !b && contacts.length === 0) return "";
  const aria = esc(h || "Park information");
  const bodyHtml = b
    ? b
        .split(/\n+/)
        .map((line) => `<p class="bracket-park-line">${esc(line)}</p>`)
        .join("")
    : "";
  const contactsHtml =
    contacts.length > 0
      ? `<div class="bracket-park-contacts"><div class="bracket-park-contacts-h">Point of contact</div><ul class="bracket-park-contact-list">${contacts
          .map((c) => {
            const name = c.name?.trim();
            const phone = c.phone?.trim();
            const nameH = name ? `<div class="bracket-park-contact-name">${esc(name)}</div>` : "";
            const phoneH = phone ? `<div class="bracket-park-contact-phone">${esc(phone)}</div>` : "";
            return `<li class="bracket-park-contact-item">${nameH}${phoneH}</li>`;
          })
          .join("")}</ul></div>`
      : "";
  return `<aside class="bracket-park" aria-label="${aria}">${h ? `<h3 class="bracket-park-heading">${esc(h)}</h3>` : ""}${b ? `<div class="bracket-park-body">${bodyHtml}</div>` : ""}${contactsHtml}</aside>`;
}


function hasBracketParkInfo(park: BracketParkInfo | null | undefined): boolean {
  const h = park?.heading?.trim();
  const b = park?.body?.trim();
  const contacts = park?.contacts?.filter((c) => Boolean(c.name?.trim() || c.phone?.trim())) ?? [];
  return Boolean(h || b || contacts.length > 0);
}

function matchGameInfoBetweenTeamsHtml(m: LayoutMatch): string {
  const meta = { dateLabel: m.dateLabel, time: m.time, venue: m.venue, field: m.field };
  const { when, where, isPlaceholder } = matchCardGameInfoLines(meta);
  const cls = isPlaceholder
    ? "match-schedule-meta match-game-info-between match-schedule-meta-placeholder"
    : "match-schedule-meta match-game-info-between";
  const aria = esc(isPlaceholder ? "Game information (placeholder)" : "Game information");
  return `<div class="${cls}" aria-label="${aria}"><div class="match-schedule-line">${esc(when)}</div><div class="match-schedule-line">${esc(where)}</div></div>`;
}

function slotExportClass(label: string): string {
  return label.trim() === BYE_SLOT_LABEL ? "slot slot-bye" : "slot";
}

function slotLabelHtml(label: string, slotClass: string, score?: number): string {
  const isBye = label.trim() === BYE_SLOT_LABEL;
  const scoreHtml =
    !isBye && score != null
      ? `<span class="slot-score-read" aria-label="${esc(label)} score">${score}</span>`
      : "";
  const cls = scoreHtml ? `${slotClass} slot-with-score` : slotClass;
  return `<div class="${cls}"><span class="slot-fit-label">${esc(label)}</span>${scoreHtml}</div>`;
}

function matchArticleBodyHtml(m: LayoutMatch): string {
  const ch = slotExportClass(m.slotHome);
  const ca = slotExportClass(m.slotAway);
  return `${slotLabelHtml(m.slotHome, ch, m.homeScore)}${matchGameInfoBetweenTeamsHtml(m)}${slotLabelHtml(m.slotAway, ca, m.awayScore)}`;
}

function matchArticleHtml(m: LayoutMatch, opts?: { podiumChampionSource?: boolean }): string {
  const aria = esc(`${m.slotHome} versus ${m.slotAway}`);
  const champAttr = opts?.podiumChampionSource ? ` ${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}` : "";
  return `<article class="match"${champAttr} aria-label="${aria}">${matchGameBadgeHtml(m)}${matchArticleBodyHtml(m)}</article>`;
}

function thirdPlaceMatchArticleHtml(podium: BracketLayoutPodium): string {
  const aria3 = esc(`Third place: ${podium.thirdPlaceSlotHome} versus ${podium.thirdPlaceSlotAway}`);
  const ch = slotExportClass(podium.thirdPlaceSlotHome);
  const ca = slotExportClass(podium.thirdPlaceSlotAway);
  const gameInfo = matchGameInfoBetweenTeamsHtml({
    id: "third-place",
    home: podium.thirdPlaceSlotHome,
    away: podium.thirdPlaceSlotAway,
    slotHome: podium.thirdPlaceSlotHome,
    slotAway: podium.thirdPlaceSlotAway,
    officialGameNumber: podium.thirdPlaceGameInfo?.officialGameNumber,
    dateLabel: podium.thirdPlaceGameInfo?.dateLabel,
    time: podium.thirdPlaceGameInfo?.time,
    venue: podium.thirdPlaceGameInfo?.venue,
    field: podium.thirdPlaceGameInfo?.field,
  });
  const hs = podium.thirdPlaceScores?.homeScore;
  const as = podium.thirdPlaceScores?.awayScore;
  const badgeLabel = ["3rd place", formatBracketGameBadge(podium.thirdPlaceGameInfo?.officialGameNumber)]
    .filter(Boolean)
    .join(" · ");
  return `<article class="match third-place-match" ${BRACKET_PODIUM_THIRD_SOURCE_ATTR} aria-label="${aria3}"><div class="third-place-match-badge">${esc(badgeLabel)}</div>${slotLabelHtml(podium.thirdPlaceSlotHome, ch, hs)}${gameInfo}${slotLabelHtml(podium.thirdPlaceSlotAway, ca, as)}</article>`;
}
function championRoundColumnHtmlExport(
  podium: BracketLayoutPodium,
  opts?: { gridStyle?: string },
): string {
  const champ = declaredChampionFromFinalSlots(
    podium.finalMatch.slotHome,
    podium.finalMatch.slotAway,
    podium.finalMatch,
  );
  const third = declaredThirdPlaceFromSlots(podium.thirdPlaceSlotHome, podium.thirdPlaceSlotAway);
  const isChampionTbd = champ.trim() === "TBD";
  const isThirdTbd = third.trim() === "TBD";
  const championInner = isChampionTbd
    ? `<div class="champion-plaque-title-centered">${esc(podium.championHeading)}</div>`
    : `<div class="champion-plaque-title">${esc(podium.championHeading)}</div><div class="champion-plaque-name">${esc(champ)}</div>`;
  const championPlaqueCls = isChampionTbd ? "champion-plaque champion-plaque-undecided" : "champion-plaque";
  const championAria = isChampionTbd
    ? ` aria-label="${esc(`${podium.championHeading}. Champion not yet decided.`)}"`
    : "";
  const thirdInner = isThirdTbd
    ? `<div class="champion-plaque-title-centered">3rd Place</div>`
    : `<div class="champion-plaque-title">3rd Place</div><div class="champion-plaque-name">${esc(third)}</div>`;
  const thirdPlaqueCls = isThirdTbd
    ? "third-place-plaque-slot champion-plaque champion-plaque-undecided"
    : "third-place-plaque-slot champion-plaque";
  const thirdAria = isThirdTbd ? ` aria-label="${esc("Third place not yet decided.")}"` : "";
  const rootCls = opts?.gridStyle ? "champion-round-column champion-round-grid-cell" : "champion-round-column";
  const rootStyle = opts?.gridStyle ? ` style="${opts.gridStyle}"` : "";
  return `<div class="${rootCls}"${rootStyle} aria-label="Champion round">
  <div class="champion-plaque-wrap">
    <div class="${championPlaqueCls}" ${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}${championAria}>${championInner}</div>
  </div>
  <div class="third-place-plaque-bottom-row" data-bracket-podium-third-band="plaque">
    <div class="${thirdPlaqueCls}" ${BRACKET_PODIUM_THIRD_TARGET_ATTR}${thirdAria}>${thirdInner}</div>
  </div>
</div>`;
}

function wrapTreeBodyWithPodium(
  mainInner: string,
  podium: BracketLayoutPodium,
  options?: BracketExportViewOptions,
): string {
  const park = hasBracketParkInfo(options?.parkInfo)
    ? `<div class="flat-champion-park-slot">${parkInfoAsideHtml(options?.parkInfo)}</div>`
    : "";
  return `<div class="bracket-body-row"><div class="bracket-main-pane">${mainInner}</div><div class="flat-champion-gutter" aria-hidden="true"><div class="bracket-html-connector">${finalChampionConnectorHtmlExport()}</div></div><div class="flat-champion-column">${park}${championRoundColumnHtmlExport(podium)}</div></div>`;
}

function bracketRootDocumentInner(
  bracketTitle: string,
  bodyInner: string,
  options: BracketExportViewOptions | undefined,
  themeStyle: string,
  parkBelowTitle = true,
): string {
  const watermark = options?.logoWatermarkUrl?.trim();
  const wm = watermark
    ? `<img src="${esc(watermark)}" alt="" class="bracket-watermark-img" draggable="false" decoding="async" />`
    : "";
  const parentLogo = options?.parentOrganizationLogo?.src.trim();
  const parentLogoAlt = options?.parentOrganizationLogo?.name?.trim()
    ? `${options.parentOrganizationLogo.name.trim()} logo`
    : "Parent organization logo";
  const poweredBy = parentLogo
    ? `<div class="bracket-powered-by" aria-label="Powered by parent organization"><span class="bracket-powered-by-text">powered by:</span><img src="${esc(parentLogo)}" alt="${esc(parentLogoAlt)}" class="bracket-powered-by-logo" draggable="false" decoding="async" /></div>`
    : "";
  const park = parkBelowTitle ? parkInfoAsideHtml(options?.parkInfo) : "";
  const titleBlock = bracketTitle.trim()
    ? `<h2 class="bracket-title">${esc(bracketTitle)}</h2>`
    : "";
  return `<section class="bracket-root" style="${themeStyle}" aria-label="Tournament bracket">
${wm}
<div class="bracket-root-foreground">
${titleBlock}
${park}
${bodyInner}
</div>
${poweredBy}
</section>`;
}

function buildConnectedBracketHtml(
  layout: Extract<BracketLayout, { mode: "tree" }>,
  bracketTitle: string,
  options: BracketExportViewOptions | undefined,
  themeStyle: string,
): string {
  const rounds = layout.rounds;
  const R = rounds.length;
  const N =
    layout.connectedLaneRowCount ??
    rounds[0]?.layoutSlotCount ??
    rounds[0]?.matches.length ??
    0;
  const podium = layout.podium ?? null;
  const hasPodium = Boolean(podium);
  const baseCols = 2 * R - 1;
  const gridTemplateColumns = [
    ...Array.from({ length: baseCols }, (_, i) =>
      i % 2 === 0 ? "minmax(11rem, 1fr)" : "minmax(1.25rem, 0.28fr)",
    ),
    ...(hasPodium ? (["minmax(1.25rem, 0.28fr)", "minmax(11rem, 1fr)"] as const) : []),
  ].join(" ");
  const parts: string[] = [];
  const gridStyle = `display:grid;grid-template-columns:${gridTemplateColumns};grid-template-rows:auto repeat(${N}, minmax(2.5rem, auto));column-gap:0.35rem;row-gap:0.45rem;align-items:stretch;width:100%;min-width:0;max-width:100%`;

  const parkInPodiumHeader = hasPodium && hasBracketParkInfo(options?.parkInfo);
  for (let ri = 0; ri < R; ri++) {
    const col = 2 * ri + 1;
    if (!(parkInPodiumHeader && ri === R - 1)) {
      parts.push(
        `<div class="bracket-html-grid-hdr-spacer" style="grid-column:${col};grid-row:1" aria-hidden="true"></div>`,
      );
    }
    if (ri < R - 1) {
      parts.push(
        `<div class="bracket-html-grid-hdr-spacer" style="grid-column:${col + 1};grid-row:1" aria-hidden="true"></div>`,
      );
    }
  }
  if (hasPodium) {
    if (parkInPodiumHeader) {
      parts.push(
        `<div class="bracket-html-grid-park-cell" style="grid-column:${2 * R - 1} / span 3;grid-row:1">${parkInfoAsideHtml(options?.parkInfo)}</div>`,
      );
    } else {
      parts.push(
        `<div class="bracket-html-grid-hdr-spacer" style="grid-column:${2 * R};grid-row:1" aria-hidden="true"></div>`,
      );
      parts.push(
        `<div class="bracket-html-grid-hdr-spacer" style="grid-column:${2 * R + 1};grid-row:1" aria-hidden="true"></div>`,
      );
    }
  }

  for (let ri = 0; ri < R; ri++) {
    const round = rounds[ri]!;
    const slotCount = round.layoutSlotCount ?? round.matches.length;
    const span = rowSpanHtml(N, slotCount);
    const col = 2 * ri + 1;
    const isFinalPodium = hasPodium && podium != null && ri === R - 1 && slotCount === 1;
    for (let j = 0; j < slotCount; j++) {
      const m = matchAtCanonicalSlotHtml(round, j);
      const rowStart = 2 + j * span;
      if (m) {
        if (isFinalPodium) {
          const p = podium!;
          parts.push(
            `<div class="bracket-html-match-wrap bracket-html-final-round-podium-wrap" style="grid-column:${col};grid-row:${rowStart} / span ${span}"><div class="bracket-html-final-round-podium-inner"><div class="bracket-html-final-championship-slot">${matchArticleHtml(m)}</div><div class="third-place-game-bottom-row" data-bracket-podium-third-band="game">${thirdPlaceMatchArticleHtml(p)}</div></div></div>`,
          );
        } else {
          parts.push(
            `<div class="bracket-html-match-wrap" style="grid-column:${col};grid-row:${rowStart} / span ${span}">${matchArticleHtml(m)}</div>`,
          );
        }
      } else {
        parts.push(
          `<div class="bracket-html-slot-filler" style="grid-column:${col};grid-row:${rowStart} / span ${span}" aria-hidden="true"></div>`,
        );
      }
    }
  }

  for (let ri = 0; ri < R - 1; ri++) {
    const prevRound = rounds[ri]!;
    const nextRound = rounds[ri + 1]!;
    const nextSlotCount = nextRound.layoutSlotCount ?? nextRound.matches.length;
    const span = rowSpanHtml(N, nextSlotCount);
    const col = 2 * (ri + 1);
    for (let j = 0; j < nextSlotCount; j++) {
      const topHas = matchAtCanonicalSlotHtml(prevRound, 2 * j) != null;
      const bottomHas = matchAtCanonicalSlotHtml(prevRound, 2 * j + 1) != null;
      const variant = getBracketConnectorVariant(topHas, bottomHas);
      const feedsFinalPodium = hasPodium && ri + 1 === R - 1;
      const feedAttr = feedsFinalPodium ? ' data-feeds-final-podium="true"' : "";
      const rowStart = 2 + j * span;
      parts.push(
        `<div class="bracket-html-connector"${feedAttr} style="grid-column:${col};grid-row:${rowStart} / span ${span}">${connectorSvgHtml(variant)}</div>`,
      );
    }
  }

  if (hasPodium && podium) {
    const lastRi = R - 1;
    const finalRound = rounds[lastRi]!;
    const finalSlots = finalRound.layoutSlotCount ?? finalRound.matches.length;
    const spanFinal = rowSpanHtml(N, finalSlots);
    const rowStartFinal = 2;
    parts.push(
      `<div class="bracket-html-connector" style="grid-column:${2 * R};grid-row:${rowStartFinal} / span ${spanFinal}">${finalChampionConnectorHtmlExport()}</div>`,
    );
    parts.push(
      championRoundColumnHtmlExport(podium, {
        gridStyle: `grid-column:${2 * R + 1};grid-row:${rowStartFinal} / span ${spanFinal}`,
      }),
    );
  }

  const gridHtml = `<div class="bracket-html-grid bracket-html-grid-scroll" style="${gridStyle}">${parts.join("")}</div>`;
  return bracketRootDocumentInner(bracketTitle, gridHtml, options, themeStyle, !parkInPodiumHeader);
}

function layoutToInnerHtml(
  layout: BracketLayout,
  theme: BracketThemeColors,
  options?: BracketExportViewOptions,
): string {
  const themeStyle = bracketThemeCssVarsString(theme);
  const exportHeadingLabel =
    options?.surfaceHeadingLabel?.trim() ||
    (layout.mode === "empty" ? undefined : layout.divisionLabel);
  if (layout.mode === "empty") {
    const t = layout.title ? `<h2 class="bracket-title">${esc(layout.title)}</h2>` : "";
    return `<section class="bracket-root" style="${themeStyle}" aria-label="Bracket preview">${t}<p class="empty">${esc(layout.message)}</p></section>`;
  }
  if (layout.mode === "match_grid") {
    const title = esc(bracketSurfaceTitle(exportHeadingLabel, `Games (${layout.games.length})`));
    const items = layout.games
      .map((g, i) => {
        const meta = [g.dateLabel, g.time, g.venue, g.field].filter(Boolean).join(" · ") || `Game ${i + 1}`;
        return `<li class="game-card"><div class="game-meta">${esc(meta)}</div><div>${esc(g.homeTeam)}<div class="vs">vs</div>${esc(g.awayTeam)}</div></li>`;
      })
      .join("");
    return bracketRootDocumentInner(title, `<ul class="grid">${items}</ul>`, options, themeStyle);
  }

  const bracketTitle = esc(bracketSurfaceTitle(exportHeadingLabel));
  if (layout.treeLayout === "connected") {
    return buildConnectedBracketHtml(layout, bracketTitle, options, themeStyle);
  }

  const roundsHtml = layout.rounds
    .map(
      (round) => `
  <section class="round">
    <ol class="match-list">
      ${round.matches.map((m) => `<li>${matchArticleHtml(m)}</li>`).join("")}
    </ol>
  </section>`,
    )
    .join("");
  const treeInner = `<div class="tree">${roundsHtml}</div>`;
  const body = layout.podium ? wrapTreeBodyWithPodium(treeInner, layout.podium, options) : treeInner;
  const parkBelowTitle = !(layout.podium && hasBracketParkInfo(options?.parkInfo));
  return bracketRootDocumentInner(bracketTitle, body, options, themeStyle, parkBelowTitle);
}

/** Self-contained HTML document for download or hosting elsewhere. */
export function buildBracketExportHtmlDocument(
  title: string,
  layout: BracketLayout,
  theme?: BracketThemeColors | null,
  options?: BracketExportViewOptions,
): string {
  const colors = theme ?? EXPORT_THEME_FALLBACK;
  const inner = layoutToInnerHtml(layout, colors, options);
  const paintScript = bracketConnectorPaintScriptSource();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${EMBEDDED_CSS}</style>
</head>
<body>
<h1>${esc(title)}</h1>
${inner}
<script>${paintScript}</script>
</body>
</html>`;
}
