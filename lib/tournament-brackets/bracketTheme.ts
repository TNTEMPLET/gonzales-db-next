import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

/** LLBWS-style printable shell: light paper + org primary / accent as structure ink. */
export type BracketThemeColors = {
  primaryHex: string;
  accentHex: string;
};

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

/** Canonical #rrggbb or null. */
export function normalizeHex6(input: string | undefined | null): string | null {
  const rgb = parseHexColor(input);
  return rgb ? formatHex(rgb) : null;
}

/**
 * Resolves bracket chrome colors: optional spec overrides, otherwise target-site defaults.
 * LLBWS-style neutrals (paper, borders) stay fixed; primary/accent drive headings, connectors, and accents.
 */
export function resolveBracketThemeColors(
  spec: BracketSpec | null | undefined,
  siteDefaults: BracketThemeColors,
): BracketThemeColors {
  const p = normalizeHex6(spec?.bracketThemePrimaryHex) ?? normalizeHex6(siteDefaults.primaryHex) ?? "#002f6c";
  const a = normalizeHex6(spec?.bracketThemeAccentHex) ?? normalizeHex6(siteDefaults.accentHex) ?? "#c8102e";
  return { primaryHex: p, accentHex: a };
}

/** CSS custom properties for `.root` / `.bracket-root` (matches TournamentBracketView.module.css tokens). */
export function bracketThemeCssVars(colors: BracketThemeColors): Record<string, string> {
  const pr = parseHexColor(colors.primaryHex);
  const ac = parseHexColor(colors.accentHex);
  if (!pr || !ac) {
    return {};
  }
  const navyDeep = formatHex(darkenRgb(pr, 0.42));
  const muted = formatHex(mixRgb(pr, [100, 116, 139], 0.52));
  const roundDivider = formatHex(mixRgb(pr, [226, 232, 240], 0.55));
  const shadowA = `0 1px 2px rgb(${pr[0]} ${pr[1]} ${pr[2]} / 0.07)`;
  const deepRgb = darkenRgb(pr, 0.35);
  const shadowB = `0 2px 8px rgb(${deepRgb[0]} ${deepRgb[1]} ${deepRgb[2]} / 0.08)`;

  return {
    "--bracket-bg": "#eef2f7",
    "--bracket-surface": "#ffffff",
    "--bracket-border": "#c5d0e0",
    "--bracket-fg": colors.primaryHex,
    "--bracket-muted": muted,
    "--bracket-accent": colors.accentHex,
    "--bracket-navy-deep": navyDeep,
    "--bracket-round-divider": roundDivider,
    "--bracket-card-shadow": `${shadowA}, ${shadowB}`,
  };
}

/** Same variable set as inline `style` for HTML export `<div class="bracket-root" style="...">`. */
export function bracketThemeCssVarsString(colors: BracketThemeColors): string {
  const o = bracketThemeCssVars(colors);
  return Object.entries(o)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
