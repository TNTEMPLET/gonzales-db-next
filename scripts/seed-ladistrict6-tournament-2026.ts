import prisma from "@/lib/prisma";
import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

const ORG_ID = "ladistrict6";
const SEASON_YEAR = 2026;
const VENUE = "Tee-Joe Gonzales Park";

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
  };
}

function build10USpec(): BracketSpec {
  return {
    version: 1,
    bracketFormat: "double_elimination",
    divisionLabel: "10U",
    championAgeGroupLabel: "10U",
    governingBody: "Louisiana DYB District 6",
    teams: ["Ponchatoula", "Loranger", "Kentwood", "Franklinton", "Gonzales"],
    setupWizardCompleted: true,
    parkInfo,
    flyer: baseFlyer(),
    ingestionWarnings: [],
    rounds: [
      {
        id: "winners-r1",
        label: "Winners Bracket",
        bracketSection: "winners",
        matches: [
          {
            id: "10u-g1",
            home: "Ponchatoula",
            away: "Loranger",
            officialGameNumber: "1",
            ...scheduleMeta("Wed 6/18", "6:00 PM", "Berthelot"),
          },
          {
            id: "10u-g2",
            home: "Kentwood",
            away: "Franklinton",
            officialGameNumber: "2",
            ...scheduleMeta("Wed 6/18", "6:00 PM", "Patterson"),
          },
        ],
      },
      {
        id: "winners-r2",
        label: "",
        bracketSection: "winners",
        matches: [
          {
            id: "10u-g3",
            home: "W1",
            away: "Gonzales",
            officialGameNumber: "3",
            ...scheduleMeta("Thu 6/19", "6:00 PM", "Berthelot"),
          },
        ],
      },
      {
        id: "winners-r3",
        label: "",
        bracketSection: "winners",
        matches: [
          {
            id: "10u-g6",
            home: "W3",
            away: "W2",
            officialGameNumber: "6",
            ...scheduleMeta("Thu 6/19", "8:00 PM", "Patterson"),
          },
        ],
      },
      {
        id: "losers-r1",
        label: "Losers Bracket",
        bracketSection: "losers",
        matches: [
          {
            id: "10u-g4",
            home: "L1",
            away: "L2",
            officialGameNumber: "4",
            ...scheduleMeta("Thu 6/19", "6:00 PM", "Patterson"),
          },
        ],
      },
      {
        id: "losers-r2",
        label: "",
        bracketSection: "losers",
        matches: [
          {
            id: "10u-g5",
            home: "W4",
            away: "L3",
            officialGameNumber: "5",
            ...scheduleMeta("Fri 6/20", "9:00 AM", "Patterson"),
          },
        ],
      },
      {
        id: "championship-r1",
        label: "Championship",
        bracketSection: "championship",
        matches: [
          {
            id: "10u-g7",
            home: "TBD",
            away: "TBD",
            officialGameNumber: "7",
            ...scheduleMeta("Fri 6/20", "11:30 AM", "Patterson"),
          },
          {
            id: "10u-g8",
            home: "TBD",
            away: "TBD",
            officialGameNumber: "8",
            ...scheduleMeta("Fri 6/20", "2:00 PM", "Patterson"),
          },
          {
            id: "10u-g9",
            home: "TBD",
            away: "TBD",
            officialGameNumber: "9",
            ...scheduleMeta("Sat 6/21", "1:00 PM", "Patterson"),
          },
        ],
      },
    ],
    games: [],
  };
}

function build9USpec(): BracketSpec {
  return {
    version: 1,
    bracketFormat: "custom",
    divisionLabel: "9U",
    championAgeGroupLabel: "9U",
    governingBody: "Louisiana DYB District 6",
    teams: ["Gonzales", "Ponchatoula"],
    setupWizardCompleted: true,
    parkInfo,
    flyer: baseFlyer(),
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

async function main() {
  const tenU = await upsertBracket(
    "2026 Louisiana DYB District 6 Tournament — 10U",
    build10USpec(),
    10,
  );
  const nineU = await upsertBracket(
    "2026 Louisiana DYB District 6 Tournament — 9U",
    build9USpec(),
    9,
  );

  console.log(`✓ 10U bracket ${tenU.created ? "created" : "updated"} (id=${tenU.id})`);
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
