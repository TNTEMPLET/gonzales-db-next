import prisma from "@/lib/prisma";
import { DYB_DISTRICT6_BRAND } from "@/lib/siteConfig";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  classicDoubleElimLayoutLockPatch,
  doubleEliminationClassicLayoutSpecDefaults,
  resolveDoubleElimClassicLayoutGenerationOptions,
} from "@/lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";
import {
  applyScheduleByGameNumber,
  withStableMatchIds,
} from "@/lib/tournament-brackets/applyBracketSchedule";
import { generateDoubleEliminationRoundsForFormat } from "@/lib/tournament-brackets/generateDoubleElimFromTeams";

/**
 * Seeds District 6 tournament brackets into the same BracketProject records the
 * admin Tournament Bracket Creator uses (`/admin/tournament-brackets?org=ladistrict6`).
 */

const ORG_ID = "ladistrict6";
const SEASON_YEAR = 2026;
const VENUE = "Tee-Joe Gonzales Park";

const DYB_PRIMARY_HEX = DYB_DISTRICT6_BRAND.primaryHex;
const DYB_ACCENT_HEX = DYB_DISTRICT6_BRAND.accentHex;

const TEN_U_TEAMS = ["Ponchatoula", "Loranger", "Kentwood", "Franklinton", "Gonzales"] as const;

const parkInfo: NonNullable<BracketSpec["parkInfo"]> = {
  heading: "Tee-Joe Gonzales Park",
  body: "524 West Orice Roth Rd\nGonzales, LA 70737",
  contacts: [{ phone: "(225) 647-2841" }],
};

function scheduleMeta(dateLabel: string, time: string, field: string) {
  return { dateLabel, time, field, venue: VENUE };
}

function baseFlyer() {
  return {
    includeSponsors: false,
    sponsorLayout: "none" as const,
    sponsorStrip: [],
    logoUrl: "/images/dyb-district6-logo.png",
    primaryHex: DYB_PRIMARY_HEX,
    accentHex: DYB_ACCENT_HEX,
  };
}

function bracketThemeFields() {
  return {
    bracketThemePrimaryHex: DYB_PRIMARY_HEX,
    bracketThemeAccentHex: DYB_ACCENT_HEX,
  };
}

const TEN_U_BRACKET_NAME = "2026 Louisiana DYB District 6 Tournament — 10U";

function build10USpec(): BracketSpec {
  const teams = [...TEN_U_TEAMS];
  const deDefaults = doubleEliminationClassicLayoutSpecDefaults();
  const genOptions = resolveDoubleElimClassicLayoutGenerationOptions(
    teams,
    deDefaults.bracketFormat,
  );
  let rounds = generateDoubleEliminationRoundsForFormat(
    teams,
    deDefaults.bracketFormat,
    genOptions,
  );
  rounds = withStableMatchIds(rounds, "10u");
  rounds = applyScheduleByGameNumber(
    rounds,
    {
      "1": scheduleMeta("Wed 6/18", "6:00 PM", "Berthelot"),
      "2": scheduleMeta("Wed 6/18", "6:00 PM", "Patterson"),
      "3": scheduleMeta("Thu 6/19", "6:00 PM", "Berthelot"),
      "4": scheduleMeta("Thu 6/19", "8:00 PM", "Patterson"),
      "5": scheduleMeta("Thu 6/19", "6:00 PM", "Patterson"),
      "6": scheduleMeta("Fri 6/20", "9:00 AM", "Patterson"),
      "7": scheduleMeta("Fri 6/20", "11:30 AM", "Patterson"),
      "8": scheduleMeta("Fri 6/20", "2:00 PM", "Patterson"),
      "9": scheduleMeta("Sat 6/21", "1:00 PM", "Patterson"),
    },
    VENUE,
  );

  return {
    version: 1,
    layoutPreference: "official",
    ...deDefaults,
    divisionLabel: "10U",
    championAgeGroupLabel: "10U",
    governingBody: "Louisiana DYB District 6",
    teams,
    setupWizardCompleted: true,
    parkInfo,
    flyer: baseFlyer(),
    ...bracketThemeFields(),
    ...classicDoubleElimLayoutLockPatch(teams, deDefaults.bracketFormat),
    ingestionWarnings: [],
    rounds,
    games: [],
  };
}

function build9USpec(): BracketSpec {
  return {
    version: 1,
    layoutPreference: "connected_columns",
    bracketFormat: "custom",
    divisionLabel: "9U",
    championAgeGroupLabel: "9U",
    governingBody: "Louisiana DYB District 6",
    teams: ["Gonzales", "Ponchatoula"],
    setupWizardCompleted: true,
    parkInfo,
    flyer: baseFlyer(),
    ...bracketThemeFields(),
    ingestionWarnings: [],
    rounds: [
      {
        id: "9u-r1",
        label: "Game 1 — Thu 6/19",
        matches: [
          {
            id: "9u-g1",
            home: "Ponchatoula",
            away: "Gonzales",
            officialGameNumber: "1",
            ...scheduleMeta("Thu 6/19", "6:00 PM", "Bourque"),
          },
        ],
      },
      {
        id: "9u-r2",
        label: "Game 2 — Fri 6/20",
        matches: [
          {
            id: "9u-g2",
            home: "Gonzales",
            away: "Ponchatoula",
            officialGameNumber: "2",
            ...scheduleMeta("Fri 6/20", "9:00 AM", "Berthelot"),
          },
        ],
      },
      {
        id: "9u-r3",
        label: "Game 3 (if necessary) — Fri 6/20",
        matches: [
          {
            id: "9u-g3",
            home: "TBD",
            away: "TBD",
            officialGameNumber: "3",
            ...scheduleMeta("Fri 6/20", "11:30 AM", "Berthelot"),
          },
        ],
      },
    ],
    games: [],
  };
}

async function upsertBracket(
  name: string,
  spec: BracketSpec,
  priority: number,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.bracketProject.findFirst({
    where: { organizationId: ORG_ID, name, seasonYear: SEASON_YEAR },
    select: { id: true },
  });

  if (existing) {
    await prisma.bracketProject.update({
      where: { id: existing.id },
      data: {
        status: "READY",
        priority,
        spec: spec as object,
      },
    });
    return { id: existing.id, created: false };
  }

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
  return { id: created.id, created: true };
}

async function upsertGonzalesPromoNewsPost(): Promise<void> {
  const slug = "2026-dyb-district-6-tournament";
  const title = "2026 Louisiana DYB District 6 Tournament";
  const excerpt =
    "District 6 DYB tournament at Tee-Joe Gonzales Park, June 18–21, 2026. View brackets, schedules, and results.";
  const content = `<p>Gonzales Diamond Baseball is hosting the <strong>2026 Louisiana DYB District 6 Tournament</strong> at Tee-Joe Gonzales Park (524 West Orice Roth Rd, Gonzales, LA 70737).</p>
<p><strong>Divisions:</strong> 9U and 10U &nbsp;|&nbsp; <strong>Dates:</strong> June 18–21, 2026</p>
<p><a href="https://district6.apbaseball.com/tournaments" target="_blank" rel="noopener noreferrer"><strong>View live brackets &amp; schedules →</strong></a></p>
<p><em>Upload your tournament flyer image in admin to replace this placeholder and enable the homepage hero rotator.</em></p>`;

  const data = {
    title,
    excerpt,
    content,
    featured: true,
    rotatorEnabled: false,
    status: "PUBLISHED" as const,
    publishedAt: new Date("2026-06-01T12:00:00.000Z"),
    author: "Gonzales DYB",
  };

  const existing = await prisma.newsPost.findUnique({
    where: {
      organizationId_slug: { organizationId: "gonzales", slug },
    },
    select: { id: true, imageUrl: true },
  });

  if (existing) {
    await prisma.newsPost.update({
      where: { id: existing.id },
      data,
    });
    console.log(`✓ Gonzales promo news updated (slug=${slug}, id=${existing.id})`);
    return;
  }

  const created = await prisma.newsPost.create({
    data: {
      organizationId: "gonzales",
      slug,
      ...data,
    },
  });
  console.log(`✓ Gonzales promo news created (slug=${slug}, id=${created.id})`);
}

async function recreate10UBracket(spec: BracketSpec): Promise<{ id: string }> {
  await prisma.bracketProject.deleteMany({
    where: { organizationId: ORG_ID, name: TEN_U_BRACKET_NAME, seasonYear: SEASON_YEAR },
  });

  const created = await prisma.bracketProject.create({
    data: {
      organizationId: ORG_ID,
      name: TEN_U_BRACKET_NAME,
      seasonYear: SEASON_YEAR,
      status: "READY",
      priority: 10,
      spec: spec as object,
    },
  });
  return { id: created.id };
}

async function main() {
  const tenU = await recreate10UBracket(build10USpec());
  const nineU = await upsertBracket(
    "2026 Louisiana DYB District 6 Tournament — 9U",
    build9USpec(),
    9,
  );

  console.log(`✓ 10U bracket recreated (id=${tenU.id})`);
  console.log(`✓ 9U bracket ${nineU.created ? "created" : "updated"} (id=${nineU.id})`);
  await upsertGonzalesPromoNewsPost();
  console.log("\nPublic: https://district6.apbaseball.com/tournaments");
  console.log("Admin:  /admin/tournament-brackets?org=ladistrict6");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
