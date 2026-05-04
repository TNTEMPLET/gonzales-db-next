/**
 * One-off helpers to create or remove a disposable coach for login / account-setup testing.
 *
 * Requires DATABASE_URL (e.g. from Vercel prod or `source .env.local`).
 *
 * Create (incomplete profile → first-time setup + local password creation):
 *   npx tsx scripts/create-test-coach.ts create --org ascension --age-group "6U LLB" --season 2026
 *
 * Create with your email (use a plus-address you control if you also test Google):
 *   npx tsx scripts/create-test-coach.ts create --org ascension --age-group "6U LLB" --season 2026 --email "you+allstar-test@gmail.com"
 *
 * Remove:
 *   npx tsx scripts/create-test-coach.ts delete --org ascension --email "you+allstar-test@gmail.com"
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const adapter = new PrismaPostgresAdapter({ connectionString });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org" || a === "--age-group" || a === "--season" || a === "--email" || a === "--team") {
      const key = a.slice(2).replace(/-/g, "");
      out[key] = argv[i + 1] ?? "";
      i++;
    }
  }
  return out;
}

async function cmdCreate() {
  const args = parseArgs(process.argv.slice(3));
  const organizationId = (args.org || "ascension").trim().toLowerCase();
  const ageGroupFilter = (args.agegroup || "6U LLB").trim();
  const seasonYear = Number.parseInt(args.season || "2026", 10);
  if (!Number.isFinite(seasonYear)) {
    throw new Error(`Invalid season: ${args.season}`);
  }

  const team = await prisma.team.findFirst({
    where: {
      organizationId,
      seasonYear,
      ageGroup: { equals: ageGroupFilter, mode: "insensitive" },
    },
    orderBy: [{ teamName: "asc" }],
  });

  if (!team) {
    const samples = await prisma.team.findMany({
      where: { organizationId, seasonYear },
      select: { ageGroup: true, teamName: true },
      orderBy: [{ ageGroup: "asc" }, { teamName: "asc" }],
      take: 25,
    });
    console.error(
      `No team found for org=${organizationId} season=${seasonYear} ageGroup matching "${ageGroupFilter}".`,
    );
    console.error("Sample teams in DB:", JSON.stringify(samples, null, 2));
    process.exit(1);
  }

  const email =
    (args.email || `allstar-workflow-test-${Date.now()}@example.com`).trim().toLowerCase();

  const existing = await prisma.registeredUser.findFirst({
    where: { organizationId, email },
  });
  if (existing) {
    console.error(`RegisteredUser already exists: ${email} in ${organizationId}`);
    process.exit(1);
  }

  const user = await prisma.registeredUser.create({
    data: {
      organizationId,
      email,
      isCoach: true,
      isBlocked: false,
      // Incomplete profile → Google sign-in returns canRegister; local login returns canRegister until signup.
      firstName: null,
      lastName: null,
      name: null,
      contactPhone: null,
      googleSub: null,
      passwordHash: null,
      // Tie to real 6U roster context for Dugout / org data; still incomplete for setup gate.
      ageGroup: team.ageGroup,
      assignedTeam: team.teamName,
    },
  });

  await prisma.teamCoachAssignment.upsert({
    where: {
      teamId_registeredUserId: { teamId: team.id, registeredUserId: user.id },
    },
    create: {
      teamId: team.id,
      registeredUserId: user.id,
      role: "ASSISTANT_COACH",
    },
    update: { role: "ASSISTANT_COACH" },
  });

  console.log(
    JSON.stringify(
      {
        created: true,
        organizationId,
        email,
        userId: user.id,
        team: { id: team.id, ageGroup: team.ageGroup, teamName: team.teamName, seasonYear },
        nextSteps: [
          "Open the league site (Ascension LL), use Login → enter this email + any password ≥8 chars → you should be sent to /account/setup.",
          "After testing, run the delete command below (removes coach sessions, team assignment, and user).",
        ],
        deleteCommand: `npx tsx scripts/create-test-coach.ts delete --org ${organizationId} --email ${email}`,
      },
      null,
      2,
    ),
  );
}

async function cmdDelete() {
  const args = parseArgs(process.argv.slice(3));
  const organizationId = (args.org || "ascension").trim().toLowerCase();
  const email = (args.email || "").trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx scripts/create-test-coach.ts delete --org ascension --email "..."');
    process.exit(1);
  }

  const user = await prisma.registeredUser.findFirst({
    where: { organizationId, email },
  });
  if (!user) {
    console.error(`No RegisteredUser found for ${email} in ${organizationId}`);
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.coachSession.deleteMany({ where: { userId: user.id } }),
    prisma.teamCoachAssignment.deleteMany({ where: { registeredUserId: user.id } }),
    prisma.registeredUser.delete({ where: { id: user.id } }),
  ]);

  console.log(JSON.stringify({ deleted: true, organizationId, email, userId: user.id }, null, 2));
}

async function main() {
  const [, , cmd] = process.argv;
  if (cmd === "create") {
    await cmdCreate();
    return;
  }
  if (cmd === "delete") {
    await cmdDelete();
    return;
  }
  console.error(`Usage:
  npx tsx scripts/create-test-coach.ts create --org ascension --age-group "6U LLB" --season 2026 [--email "..."]
  npx tsx scripts/create-test-coach.ts delete --org ascension --email "..."`);
  process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
