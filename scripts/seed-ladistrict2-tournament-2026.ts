import prisma from "@/lib/prisma";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  applyScheduleByGameNumber,
  withStableMatchIds,
} from "@/lib/tournament-brackets/applyBracketSchedule";
import {
  classicDoubleElimLayoutLockPatch,
} from "@/lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";
import type { ChampionshipSeriesStyle } from "@/lib/tournament-brackets/bracketFormat";
import {
  buildRoundsFromOfficialTemplate,
  specDefaultsFromOfficialTemplate,
  type OfficialTemplateId,
} from "@/lib/tournament-brackets/officialTemplates";

/**
 * Seeds District 2 LL tournament brackets for the admin Bracket Creator
 * (`/admin/tournament-brackets?org=ladistrict2`) and public `/tournaments`.
 *
 * Majors (12U): 6-team official LL DE — Standard (if-necessary championship)
 * Minors (10U): 6-team official LL DE — Modified (winner-take-all final)
 */

const ORG_ID = "ladistrict2";
const SEASON_YEAR = 2026;
const TEMPLATE_ID: OfficialTemplateId = "little_league_6_team_de";

const LL_PRIMARY_HEX = "#002D6D";
const LL_ACCENT_HEX = "#CC0000";

/** Replace with seeded league names before posting. */
const SIX_LEAGUE_TEAMS = [
  "Gonzales LL",
  "Ascension LL",
  "Central LL",
  "Denham Springs LL",
  "Walker LL",
  "Livingston LL",
] as const;

const MAJORS_NAME = "2026 District 2 Tournament — Majors (12U)";
const MINORS_NAME = "2026 District 2 Tournament — Minor/AAA (10U)";

function baseFlyer() {
  return {
    includeSponsors: false,
    sponsorLayout: "none" as const,
    sponsorStrip: [],
    logoUrl: "/images/ll-logo.png",
    primaryHex: LL_PRIMARY_HEX,
    accentHex: LL_ACCENT_HEX,
  };
}

function bracketThemeFields() {
  return {
    bracketThemePrimaryHex: LL_PRIMARY_HEX,
    bracketThemeAccentHex: LL_ACCENT_HEX,
  };
}

function buildSixTeamSpec(opts: {
  divisionLabel: string;
  championAgeGroupLabel: string;
  championshipSeriesStyle: ChampionshipSeriesStyle;
  idPrefix: string;
}): BracketSpec {
  const teams = [...SIX_LEAGUE_TEAMS];
  const defaults = specDefaultsFromOfficialTemplate(TEMPLATE_ID, opts.championshipSeriesStyle);
  const bracketFormat = defaults.bracketFormat ?? "modified_double_elimination";

  let rounds = buildRoundsFromOfficialTemplate(TEMPLATE_ID, teams, {
    championshipSeriesStyle: opts.championshipSeriesStyle,
  });
  rounds = withStableMatchIds(rounds, opts.idPrefix);
  rounds = applyScheduleByGameNumber(
    rounds,
    {
      "1": { dateLabel: "6/26", time: "7:30pm", field: "F4" },
      "2": { dateLabel: "6/26", time: "7:30pm", field: "F3" },
    },
    "",
  );

  return {
    version: 1,
    ...defaults,
    divisionLabel: opts.divisionLabel,
    championAgeGroupLabel: opts.championAgeGroupLabel,
    governingBody: "little_league",
    teams,
    setupWizardCompleted: true,
    flyer: baseFlyer(),
    ...bracketThemeFields(),
    ...classicDoubleElimLayoutLockPatch(teams, bracketFormat),
    classicDoubleElimLayoutLocked: true,
    ingestionWarnings: [],
    rounds,
    games: [],
  };
}

async function recreateBracket(
  name: string,
  spec: BracketSpec,
  priority: number,
): Promise<{ id: string }> {
  await prisma.bracketProject.deleteMany({
    where: { organizationId: ORG_ID, name, seasonYear: SEASON_YEAR },
  });

  const created = await prisma.bracketProject.create({
    data: {
      organizationId: ORG_ID,
      name,
      seasonYear: SEASON_YEAR,
      status: "READY",
      priority,
      spec: spec as object,
    },
  });
  return { id: created.id };
}

async function main() {
  await prisma.bracketProject.deleteMany({
    where: {
      organizationId: ORG_ID,
      seasonYear: SEASON_YEAR,
      name: { notIn: [MAJORS_NAME, MINORS_NAME] },
    },
  });

  const majors = await recreateBracket(
    MAJORS_NAME,
    buildSixTeamSpec({
      divisionLabel: "Majors (11-12)",
      championAgeGroupLabel: "12U",
      championshipSeriesStyle: "always_scheduled_reset",
      idPrefix: "12u",
    }),
    10,
  );

  const minors = await recreateBracket(
    MINORS_NAME,
    buildSixTeamSpec({
      divisionLabel: "Minor/AAA (9-10)",
      championAgeGroupLabel: "10U",
      championshipSeriesStyle: "winner_take_all",
      idPrefix: "10u",
    }),
    9,
  );

  console.log(`✓ Majors (12U) bracket created (id=${majors.id})`);
  console.log(`  6 teams · Standard DE (if-necessary championship)`);
  console.log(`✓ Minor/AAA (10U) bracket created (id=${minors.id})`);
  console.log(`  6 teams · Modified DE (winner-take-all final)`);
  console.log("\nPublic: https://district2.apbaseball.com/tournaments");
  console.log("Admin:  /admin/tournament-brackets?org=ladistrict2");
  console.log("Dev:    http://192.168.100.156:3003/tournaments");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
