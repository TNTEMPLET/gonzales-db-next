/**
 * Read-only audit: coach Jason Fernandez (`RegisteredUser`) submitted ballot(s) on runoff cycles.
 * Prefers 11U-style `ageGroup`; if none exist, falls back to all runoff cycles (see console NOTE).
 * Set `AUDIT_STRICT_11U=1` to exit when no 11U runoff is found (no fallback).
 *
 * Run from repo root (loads env like other local scripts):
 *   set -a && source .env.local && set +a && npx tsx scripts/audit-coach-fernandez-11u-runoff.ts
 */
import { Prisma } from "@prisma/client";

import prisma from "../lib/prisma";

async function main() {
  const allRunoffCycles = await prisma.$queryRaw<
    Array<{
      id: string;
      organizationId: string;
      seasonYear: number;
      ageGroup: string;
      title: string | null;
      status: string;
      accessMode: string;
      publishedAt: Date | null;
      closedAt: Date | null;
      parentBallotCycleId: string | null;
    }>
  >(Prisma.sql`
    SELECT id, "organizationId", "seasonYear", "ageGroup", title, status, "accessMode",
           "publishedAt", "closedAt", "parentBallotCycleId"
    FROM "AllStarBallotCycle"
    WHERE "parentBallotCycleId" IS NOT NULL
    ORDER BY "seasonYear" DESC, "organizationId", id
  `);

  console.log("\n=== All runoff ballot cycles (any ageGroup) ===\n");
  console.log(JSON.stringify(allRunoffCycles, null, 2));

  /** 11U: exact trim, or common variants like "11U All-Star", "11u ", etc. */
  const runoffCycles = allRunoffCycles.filter((c) => {
    const g = c.ageGroup.trim().toLowerCase();
    return g === "11u" || g.startsWith("11u ") || g.includes("11u");
  });

  console.log("\n=== Filtered to 11U-style ageGroup (heuristic) ===\n");
  console.log(JSON.stringify(runoffCycles, null, 2));

  const strict11uOnly = process.env.AUDIT_STRICT_11U === "1";
  let cycleIds: string[];
  let usedFallbackToAllRunoffs = false;
  if (runoffCycles.length === 0) {
    if (strict11uOnly || allRunoffCycles.length === 0) {
      console.log(
        "\nNo 11U-style runoff cycles (and strict mode or no runoffs at all). Stopping.\n",
      );
      await prisma.$disconnect();
      return;
    }
    console.log(
      "\n*** NOTE: No 11U runoff in DB. Falling back to ALL runoff cycles for coach ballot lookup. ***\n",
    );
    usedFallbackToAllRunoffs = true;
    cycleIds = allRunoffCycles.map((c) => c.id);
  } else {
    cycleIds = runoffCycles.map((c) => c.id);
  }

  const coachRows = await prisma.$queryRaw<
    Array<{
      id: string;
      email: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      organizationId: string;
      ageGroup: string | null;
      isCoach: boolean;
    }>
  >(Prisma.sql`
    SELECT id, email, name, "firstName", "lastName", "organizationId", "ageGroup", "isCoach"
    FROM "RegisteredUser"
    WHERE (
      (LOWER(TRIM(COALESCE("firstName", ''))) = 'jason'
        AND LOWER(COALESCE("lastName", '')) LIKE '%fernandez%')
      OR LOWER(COALESCE(name, '')) LIKE '%jason%fernandez%'
      OR LOWER(COALESCE(name, '')) LIKE '%fernandez%jason%'
      OR LOWER(email) LIKE '%jason%fernandez%'
      OR (LOWER(email) LIKE '%fernandez%' AND LOWER(email) LIKE '%jason%')
    )
    ORDER BY "organizationId", email
  `);

  console.log("\n=== RegisteredUser rows matching Jason Fernandez (name/email heuristics) ===\n");
  console.log(JSON.stringify(coachRows, null, 2));

  if (coachRows.length === 0) {
    console.log("\nNo coach users matched name/email patterns.\n");
    return;
  }

  const coachIds = coachRows.map((r) => r.id);

  const submissions = await prisma.allStarVoteSubmission.findMany({
    where: {
      ballotCycleId: { in: cycleIds },
      coachUserId: { in: coachIds },
    },
    include: {
      ballotCycle: {
        select: {
          id: true,
          organizationId: true,
          seasonYear: true,
          ageGroup: true,
          title: true,
          accessMode: true,
          parentBallotCycleId: true,
        },
      },
      coachUser: {
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          organizationId: true,
          ageGroup: true,
          isCoach: true,
        },
      },
      voteItems: {
        include: {
          candidate: {
            select: {
              playerFullName: true,
              team: true,
              jerseyNumber: true,
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  console.log(
    `\n=== Vote submissions (Jason Fernandez coach on ${usedFallbackToAllRunoffs ? "all runoff cycles in DB (11U fallback)" : "11U-style runoff cycles"}) ===\n`,
  );
  console.log(JSON.stringify(submissions, null, 2));

  for (const sub of submissions) {
    const email = sub.coachUser.email;
    const cycle = sub.ballotCycle;

    const admin = await prisma.adminUser.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, role: true, isMaster: true },
    });

    const invite = await prisma.allStarInvite.findFirst({
      where: {
        ballotCycleId: cycle.id,
        invitedEmail: { equals: email, mode: "insensitive" },
        revokedAt: null,
      },
      select: { id: true, invitedEmail: true, createdAt: true, openedAt: true },
    });

    const headAssignment = await prisma.allStarHeadCoachAssignment.findFirst({
      where: { ballotCycleId: cycle.id, registeredUserId: sub.coachUserId },
      select: { id: true, coachEmail: true, coachName: true },
    });

    console.log("\n--- Legitimacy flags for submission", sub.id, "---");
    console.log(
      JSON.stringify(
        {
          submittedAt: sub.submittedAt,
          ballotCycleId: cycle.id,
          cycleTitle: cycle.title,
          accessMode: cycle.accessMode,
          coachEmail: email,
          isAdminUser: admin != null,
          admin,
          onActiveInviteRoster: invite != null,
          invite,
          headCoachAssignment: headAssignment,
        },
        null,
        2,
      ),
    );
  }

  if (submissions.length === 0) {
    console.log(
      "\nNo submissions found for matched coach user(s) on 11U runoff cycles.\n",
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
