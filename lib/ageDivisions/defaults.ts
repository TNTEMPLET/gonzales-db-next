/**
 * Initial division-age configs per content org. These are starting data, not
 * hard-coded rules — cutoff month/day/offset live on `LeagueAgeRule`.
 */

import type { ContentOrgId } from "@/lib/siteConfig";
import { STANDARD_DIVISIONS } from "@/lib/sportsConnect/fallballDivisions";

import type { DivisionAgeConfig, LeagueDivisionConfig } from "./types";

type AgeSpan = { minAge: number; maxAge: number };

function division(
  code: string,
  label: string,
  span: AgeSpan,
  sortOrder: number,
): DivisionAgeConfig {
  return { code, label, minAge: span.minAge, maxAge: span.maxAge, sortOrder };
}

/**
 * Index-aligned with `STANDARD_DIVISIONS`. Codes are taken from that constant
 * so a rename there cannot drift from these ages without a length mismatch.
 */
const FALLBALL_AGE_BOUNDS: readonly AgeSpan[] = [
  { minAge: 3, maxAge: 4 },
  { minAge: 5, maxAge: 5 },
  { minAge: 6, maxAge: 6 },
  { minAge: 7, maxAge: 7 },
  { minAge: 8, maxAge: 8 },
  { minAge: 9, maxAge: 9 },
  { minAge: 10, maxAge: 10 },
  { minAge: 11, maxAge: 12 },
  { minAge: 13, maxAge: 15 },
  { minAge: 15, maxAge: 17 },
];

function fallballDivisions(): DivisionAgeConfig[] {
  if (FALLBALL_AGE_BOUNDS.length !== STANDARD_DIVISIONS.length) {
    throw new Error(
      `Fall Ball age bounds (${FALLBALL_AGE_BOUNDS.length}) are out of sync with STANDARD_DIVISIONS (${STANDARD_DIVISIONS.length}).`,
    );
  }
  return STANDARD_DIVISIONS.map((code, index) => {
    const span = FALLBALL_AGE_BOUNDS[index]!;
    return division(code, code, span, index + 1);
  });
}

const DEFAULTS = {
  gonzales: {
    rule: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
    divisions: [
      division("3-4U TB", "3-4U Tee Ball", { minAge: 3, maxAge: 4 }, 1),
      division("5U TB", "5U Tee Ball", { minAge: 5, maxAge: 5 }, 2),
      division("6U MINOR", "6U Minor Coach Pitch", { minAge: 6, maxAge: 6 }, 3),
      division("6U MAJOR", "6U Major Coach Pitch", { minAge: 6, maxAge: 6 }, 4),
      division("7U MINOR", "7U Minor Coach Pitch", { minAge: 7, maxAge: 7 }, 5),
      division("8U MINOR", "8U Minor Coach Pitch", { minAge: 8, maxAge: 8 }, 6),
      division("9U KP", "9U Kid Pitch", { minAge: 9, maxAge: 9 }, 7),
      division("10U KP", "10U Kid Pitch", { minAge: 10, maxAge: 10 }, 8),
      division("11-12U", "11/12U", { minAge: 11, maxAge: 12 }, 9),
      division("13-14U", "13/14U", { minAge: 13, maxAge: 14 }, 10),
      division("15-17U", "15/17U", { minAge: 15, maxAge: 17 }, 11),
    ],
  },
  ascension: {
    rule: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 },
    divisions: [
      division("3-4U TB", "Tee Ball 3-4", { minAge: 3, maxAge: 4 }, 1),
      division("5U TB", "Tee Ball 5", { minAge: 5, maxAge: 5 }, 2),
      division("6U MOD", "Modified Tee Ball/CP", { minAge: 6, maxAge: 6 }, 3),
      division("6U CP", "Coach Pitch", { minAge: 6, maxAge: 6 }, 4),
      division("7U MINOR", "Coach Pitch 7 Minor", { minAge: 7, maxAge: 7 }, 5),
      division("8U MINOR", "Coach Pitch 8 Minor", { minAge: 8, maxAge: 8 }, 6),
      division("7-8U MAJOR", "Coach Pitch 7-8 Major", { minAge: 7, maxAge: 8 }, 7),
      division("9-10U MAJOR", "9-10 Major", { minAge: 9, maxAge: 10 }, 8),
      division("11-12U MAJOR", "11-12 Major", { minAge: 11, maxAge: 12 }, 9),
    ],
  },
  fallball: {
    rule: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 1 },
    divisions: fallballDivisions(),
  },
} satisfies Record<ContentOrgId, LeagueDivisionConfig>;

function cloneConfig(config: LeagueDivisionConfig): LeagueDivisionConfig {
  return {
    rule: { ...config.rule },
    divisions: config.divisions.map((item) => ({ ...item })),
  };
}

/** A fresh copy of the built-in config. Mutating the result does not change the defaults. */
export function leagueDivisionDefaults(orgId: ContentOrgId): LeagueDivisionConfig {
  const source = DEFAULTS[orgId];
  if (!source) {
    throw new Error(`No division-age defaults for org "${String(orgId)}".`);
  }
  return cloneConfig(source);
}
