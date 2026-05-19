import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

/** LLBWS-style printable shell: light paper + org primary / accent as structure ink. */
export type BracketThemeColors = {
  primaryHex: string;
  accentHex: string;
};

export type BracketColorScheme = "light" | "dark";

const HEX6 = /^#?[0-9a-f]{6}$/i;
const HEX3 = /^#?[0-9a-f]{3}$/i;

/** Parse #RGB or #RRGGBB (with or without #). Returns null if invalid. */
export function parseHexColor(input: string | undefined | null): [number, number, number] | null {
  if (input == null) return null;
  let s = input.trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (HEX3.test(s)) {
    const h = s.slice(1);
    const r = Number.parseInt(h[0]! + h[0]!, 16);
    const g = Number.parseInt(h[1]! + h[1]!, 16);
    const b = Number.parseInt(h[2]! + h[2]!, 16);
    return [r, g, b];
  }
  if (!HEX6.test(s)) return null;
  const h = s.slice(1);
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function formatHex(rgb: [number, number, number]): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function darkenRgb(rgb: [number, number, number], factor: number): [number, number, number] {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

function lightenRgb(rgb: [number, number, number], factor: number): [number, number, number] {
  return mixRgb(rgb, [255, 255, 255], factor);
}

const SLATE50: [number, number, number] = [248, 250, 252];
const SLATE200: [number, number, number] = [226, 232, 240];
const SLATE400: [number, number, number] = [148, 163, 184];
const SLATE500: [number, number, number] = [100, 116, 139];
const SLATE800: [number, number, number] = [30, 41, 59];
const SLATE900: [number, number, number] = [15, 23, 42];

/** Readable body + chrome ink on dark surfaces (org primary tints bars, not body copy). */
function darkReadableInk(pr: [number, number, number]) {
  return {
    bodyFg: formatHex(mixRgb(pr, SLATE200, 0.88)),
    bodyEmphasis: formatHex(mixRgb(pr, SLATE50, 0.92)),
    bodyMuted: "#94a3b8",
    chrome: formatHex(mixRgb(pr, SLATE800, 0.5)),
    chromeDeep: formatHex(mixRgb(pr, SLATE900, 0.62)),
    connector: formatHex(mixRgb(pr, SLATE500, 0.35)),
  };
}

/** Canonical #rrggbb or null. */
export function normalizeHex6(input: string | undefined | null): string | null {
  const rgb = parseHexColor(input);
  return rgb ? formatHex(rgb) : null;
}

/**
 * Resolves bracket chrome colors: optional spec overrides, otherwise target-site defaults.
 */
export function resolveBracketThemeColors(
  spec: BracketSpec | null | undefined,
  siteDefaults: BracketThemeColors,
): BracketThemeColors {
  const p = normalizeHex6(spec?.bracketThemePrimaryHex) ?? normalizeHex6(siteDefaults.primaryHex) ?? "#002f6c";
  const a = normalizeHex6(spec?.bracketThemeAccentHex) ?? normalizeHex6(siteDefaults.accentHex) ?? "#c8102e";
  return { primaryHex: p, accentHex: a };
}

function lightSchemeVars(pr: [number, number, number], colors: BracketThemeColors): Record<string, string> {
  const navyDeep = formatHex(darkenRgb(pr, 0.42));
  const muted = formatHex(mixRgb(pr, [100, 116, 139], 0.52));
  const roundDivider = formatHex(mixRgb(pr, [226, 232, 240], 0.55));
  const shadowA = `0 1px 2px rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.07)`;
  const deepRgb = darkenRgb(pr, 0.35);
  const shadowB = `0 2px 8px rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.08)`;
  const shadowHoverA = `0 2px 4px rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.08)`;
  const shadowHoverB = `0 6px 16px rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.08)`;

  return {
    "--bracket-bg": "#eef2f7",
    "--bracket-surface": "#ffffff",
    "--bracket-border": "#c5d0e0",
    "--bracket-fg": colors.primaryHex,
    "--bracket-body-fg": colors.primaryHex,
    "--bracket-body-emphasis": navyDeep,
    "--bracket-chrome": colors.primaryHex,
    "--bracket-chrome-deep": navyDeep,
    "--bracket-connector-fg": colors.primaryHex,
    "--bracket-muted": muted,
    "--bracket-accent": colors.accentHex,
    "--bracket-navy-deep": navyDeep,
    "--bracket-round-divider": roundDivider,
    "--bracket-card-shadow": `${shadowA}, ${shadowB}`,
    "--bracket-card-shadow-hover": `${shadowHoverA}, ${shadowHoverB}`,
    "--bracket-connector-opacity": "0.48",
    "--bracket-badge-bg": "rgb(255 255 255 / 0.64)",
    "--bracket-badge-border": `rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.1)`,
    "--bracket-badge-shadow": `0 1px 3px rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.08)`,
    "--bracket-wash-bg": "rgb(255 255 255 / 0.64)",
    "--bracket-wash-border": `rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.13)`,
    "--bracket-wash-shadow": `0 2px 8px rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.06)`,
    "--bracket-surface-muted": "#fafbfd",
    "--bracket-surface-gradient": "linear-gradient(to bottom, #fff, #fafbfd)",
    "--bracket-surface-gradient-alt": "linear-gradient(165deg, #fff 0%, #f4f7fb 100%)",
    "--bracket-on-accent-fg": "#ffffff",
    "--bracket-on-accent-border": "rgb(255 255 255 / 0.18)",
    "--bracket-title-shadow": `0 0.55rem 1.1rem rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.16)`,
    "--bracket-title-inset": "inset 0 1px 0 rgb(255 255 255 / 0.22)",
    "--bracket-title-gradient": "linear-gradient(135deg, rgb(255 255 255 / 0.12), transparent 34%)",
    "--bracket-plaque-border": "rgb(255 255 255 / 0.85)",
    "--bracket-plaque-gradient": "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    "--bracket-subtle-border": `rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.1)`,
    "--bracket-subtle-shadow": `0 1px 2px rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.05)`,
    "--bracket-live-ring": `rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.14)`,
    "--bracket-mobile-header-bg": "rgb(255 255 255 / 0.82)",
    "--bracket-mobile-card-shadow": `0 1px 5px rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.08)`,
    "--bracket-accent-glow": `0 0.45rem 1rem rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.14)`,
    "--bracket-accent-gradient": "linear-gradient(135deg, rgb(255 255 255 / 0.16), transparent 42%)",
    "--bracket-accent-subtitle": "rgb(255 255 255 / 0.72)",
    "--bracket-score-input-bg": "rgb(255 255 255 / 0.14)",
    "--bracket-inner-border": "#e2e8f0",
    "--bracket-slot-away-bg": "#f7fafc",
    "--bracket-tie-picker-bg": "#f8fafc",
    "--bracket-tie-picker-hover-bg": "#f4f7fb",
    "--bracket-schedule-meta-bg": "rgb(248 250 252 / 0.95)",
    "--bracket-park-aside-bg": "rgb(255 255 255 / 0.72)",
    "--bracket-grid-schedule-bg": "rgb(255 255 255 / 0.88)",
    "--bracket-mobile-frame-bg": "rgb(248 250 252 / 0.9)",
    "--bracket-title-ornament-bg": "#ffffff",
    "--bracket-title-ornament-shadow": "inset 0 0 0 2px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.22)",
    "--bracket-title-text-shadow": "0 2px 0 rgb(0 0 0 / 0.32), 0 0 1rem rgb(0 0 0 / 0.22)",
    "--bracket-title-inset-bottom": "inset 0 -1px 0 rgb(0 0 0 / 0.28)",
    "--bracket-round-label-inset": "inset 0 -2px 0 rgb(0 0 0 / 0.12)",
    "--bracket-round-label-fg": "#ffffff",
    "--bracket-watermark-opacity": "0.052",
    "--bracket-watermark-filter": "none",
    "--bracket-watermark-scale": "1.18",
  };
}

function darkSchemeVars(pr: [number, number, number], colors: BracketThemeColors): Record<string, string> {
  const ink = darkReadableInk(pr);
  const roundDivider = formatHex(mixRgb(pr, [51, 65, 85], 0.65));
  const surface = "#1e293b";
  const surfaceMuted = "#243447";
  const shadowA = "0 1px 2px rgb(0 0 0 / 0.35)";
  const shadowB = "0 2px 8px rgb(0 0 0 / 0.4)";
  const shadowHoverA = "0 2px 4px rgb(0 0 0 / 0.4)";
  const shadowHoverB = "0 6px 16px rgb(0 0 0 / 0.45)";

  return {
    "--bracket-bg": "#0f172a",
    "--bracket-surface": surface,
    "--bracket-border": "#334155",
    "--bracket-fg": ink.chrome,
    "--bracket-body-fg": ink.bodyFg,
    "--bracket-body-emphasis": ink.bodyEmphasis,
    "--bracket-chrome": ink.chrome,
    "--bracket-chrome-deep": ink.chromeDeep,
    "--bracket-connector-fg": ink.connector,
    "--bracket-muted": ink.bodyMuted,
    "--bracket-accent": colors.accentHex,
    "--bracket-navy-deep": ink.chromeDeep,
    "--bracket-round-divider": roundDivider,
    "--bracket-card-shadow": `${shadowA}, ${shadowB}`,
    "--bracket-card-shadow-hover": `${shadowHoverA}, ${shadowHoverB}`,
    "--bracket-connector-opacity": "0.55",
    "--bracket-badge-bg": "rgb(255 255 255 / 0.08)",
    "--bracket-badge-border": "rgb(255 255 255 / 0.12)",
    "--bracket-badge-shadow": "0 1px 3px rgb(0 0 0 / 0.35)",
    "--bracket-wash-bg": "rgb(255 255 255 / 0.06)",
    "--bracket-wash-border": "rgb(255 255 255 / 0.12)",
    "--bracket-wash-shadow": "0 2px 8px rgb(0 0 0 / 0.35)",
    "--bracket-surface-muted": surfaceMuted,
    "--bracket-surface-gradient": `linear-gradient(to bottom, ${surface}, ${surfaceMuted})`,
    "--bracket-surface-gradient-alt": `linear-gradient(165deg, ${surface} 0%, #0f172a 100%)`,
    "--bracket-on-accent-fg": "#ffffff",
    "--bracket-on-accent-border": "rgb(255 255 255 / 0.2)",
    "--bracket-title-shadow": "0 0.55rem 1.1rem rgb(0 0 0 / 0.45)",
    "--bracket-title-inset": "inset 0 1px 0 rgb(255 255 255 / 0.08)",
    "--bracket-title-gradient": "linear-gradient(135deg, rgb(255 255 255 / 0.08), transparent 34%)",
    "--bracket-plaque-border": "rgb(255 255 255 / 0.2)",
    "--bracket-plaque-gradient": `linear-gradient(180deg, ${formatHex(lightenRgb(parseHexColor(surface)!, 0.08))} 0%, ${surface} 100%)`,
    "--bracket-subtle-border": "rgb(255 255 255 / 0.1)",
    "--bracket-subtle-shadow": "0 1px 2px rgb(0 0 0 / 0.25)",
    "--bracket-live-ring": (() => {
      const lp = lightenRgb(pr, 0.5);
      return `rgb(${Math.round(lp[0])} ${Math.round(lp[1])} ${Math.round(lp[2])} / 0.45)`;
    })(),
    "--bracket-mobile-header-bg": "rgb(30 41 59 / 0.92)",
    "--bracket-mobile-card-shadow": "0 1px 5px rgb(0 0 0 / 0.35)",
    "--bracket-accent-glow": "0 0.45rem 1rem rgb(0 0 0 / 0.4)",
    "--bracket-accent-gradient": "linear-gradient(135deg, rgb(255 255 255 / 0.1), transparent 42%)",
    "--bracket-accent-subtitle": "rgb(255 255 255 / 0.65)",
    "--bracket-score-input-bg": "rgb(255 255 255 / 0.1)",
    "--bracket-inner-border": "#475569",
    "--bracket-slot-away-bg": "#1a2738",
    "--bracket-tie-picker-bg": "#172033",
    "--bracket-tie-picker-hover-bg": "#243447",
    "--bracket-schedule-meta-bg": "rgb(30 41 59 / 0.85)",
    "--bracket-park-aside-bg": "rgb(255 255 255 / 0.06)",
    "--bracket-grid-schedule-bg": "rgb(30 41 59 / 0.92)",
    "--bracket-mobile-frame-bg": "rgb(15 23 42 / 0.92)",
    "--bracket-title-ornament-bg": surface,
    "--bracket-title-ornament-shadow": "inset 0 0 0 2px rgb(0 0 0 / 0.35), 0 1px 3px rgb(0 0 0 / 0.45)",
    "--bracket-title-text-shadow": "0 2px 0 rgb(0 0 0 / 0.45), 0 0 1rem rgb(0 0 0 / 0.35)",
    "--bracket-title-inset-bottom": "inset 0 -1px 0 rgb(0 0 0 / 0.45)",
    "--bracket-round-label-inset": "inset 0 -2px 0 rgb(0 0 0 / 0.35)",
    "--bracket-round-label-fg": "#f1f5f9",
    /* Lower opacity than first dark pass; contrast filter keeps edges sharp, not muddy. */
    "--bracket-watermark-opacity": "0.072",
    "--bracket-watermark-filter": "brightness(2) contrast(1.35)",
    "--bracket-watermark-scale": "1",
  };
}

/** CSS custom properties for `.root` / `.bracket-root` (matches TournamentBracketView.module.css tokens). */
export function bracketThemeCssVars(
  colors: BracketThemeColors,
  scheme: BracketColorScheme = "light",
): Record<string, string> {
  const pr = parseHexColor(colors.primaryHex);
  const ac = parseHexColor(colors.accentHex);
  if (!pr || !ac) {
    return {};
  }
  return scheme === "dark" ? darkSchemeVars(pr, colors) : lightSchemeVars(pr, colors);
}

/** Same variable set as inline `style` for HTML export `<motion.div class="bracket-root" style="...">`. */
export function bracketThemeCssVarsString(
  colors: BracketThemeColors,
  scheme: BracketColorScheme = "light",
): string {
  const o = bracketThemeCssVars(colors, scheme);
  return Object.entries(o)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
