import prisma from "@/lib/prisma";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

const TEAMS_MAJORS = [
  "Gonzales LL",
  "Ascension LL",
  "Central LL",
  "Denham Springs LL",
  "Walker LL",
  "Livingston LL",
  "Watson LL",
  "Springfield LL",
  "Prairieville LL",
  "St. Amant LL",
];

const TEAMS_MINORS = [
  "Gonzales LL",
  "Ascension LL",
  "Central LL",
  "Denham Springs LL",
  "Walker LL",
  "Livingston LL",
  "Watson LL",
  "Springfield LL",
  "Prairieville LL",
  "St. Amant LL",
];

async function makeSpec(teams: string[], division: string) {
  const rounds = generateSingleEliminationRoundsFromTeams(teams);
  return {
    version: 1,
    bracketFormat: "single_elimination",
    divisionLabel: division,
    teams,
    rounds,
    games: [],
    flyer: { includeSponsors: false, sponsorLayout: "none", sponsorStrip: [] },
    ingestionWarnings: [],
  };
}

async function main() {
  // Clean up any existing test brackets for ladistrict2 in dev
  const deleted = await prisma.bracketProject.deleteMany({
    where: { organizationId: "ladistrict2" },
  });
  if (deleted.count) console.log(`Cleared ${deleted.count} existing ladistrict2 bracket(s).`);

  const majorsSpec = await makeSpec(TEAMS_MAJORS, "Majors (11-12)");
  const minorsSpec = await makeSpec(TEAMS_MINORS, "Minor/AAA (9-10)");

  const majors = await prisma.bracketProject.create({
    data: {
      organizationId: "ladistrict2",
      name: "2026 District 2 Tournament — Majors",
      seasonYear: 2026,
      status: "READY",
      priority: 10,
      spec: majorsSpec as object,
    },
  });

  const minors = await prisma.bracketProject.create({
    data: {
      organizationId: "ladistrict2",
      name: "2026 District 2 Tournament — Minor/AAA",
      seasonYear: 2026,
      status: "READY",
      priority: 9,
      spec: minorsSpec as object,
    },
  });

  console.log(`✓ Majors bracket created  (id=${majors.id})`);
  console.log(`  ${TEAMS_MAJORS.length} teams → ${majorsSpec.rounds.length} rounds`);
  console.log(`✓ Minor/AAA bracket created (id=${minors.id})`);
  console.log(`  ${TEAMS_MINORS.length} teams → ${minorsSpec.rounds.length} rounds`);
  console.log("\nBrowse: http://192.168.100.156:3003/tournaments");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
