/**
 * One-time 12th-spot tiebreaker workflow (two candidates, one rating per coach).
 *
 * Run from repo root with DATABASE_URL (load .env.local first), e.g.:
 *   set -a && source .env.local && set +a && npx tsx scripts/all-star-12th-tiebreaker.ts <command> [options]
 *
 * Commands:
 *   resolve-pipe-label --label "League | Year | Age | Status | Navy"
 *     Print cycle id and DB title for the vault pipe list line (see formatAllStarCyclePipeListLabel).
 *
 *   standings (--title "<exact ballot title>" | --cycle-id <cuid>)
 *     Print vote standings with 1-based ranks; for runoff cycles, mark first-team / second-team boundary.
 *
 *   create (--source-title "<exact>" | --source-cycle-id <cuid>) --tiebreaker-title "<unique>" (--boundary | --ranks 12,13 | --candidate-ids id1,id2) [--dry-run]
 *     Create a draft tiebreaker cycle: 2 candidates (cloned from source), invites copied, requiredRatingsPerCoach=1.
 *     --boundary: use ranks firstTeamSize and firstTeamSize+1 (runoff cycles only).
 *
 *   publish --cycle-id <id> --published-at <ISO> --closed-at <ISO> [--dry-run]
 *     Set PUBLISHED window and ensure a shared ballot link token exists; print voting URL (canonical org origin).
 */
import { Prisma } from "@prisma/client";

import { computeVoteSummaryRows, splitVoteSummaryRowsForRunoff } from "@/lib/allStar/voteSummary";
import { createBallotLinkToken, hashToken } from "@/lib/allStar/server";
import { getCanonicalBallotOriginForOrganizationId } from "@/lib/siteConfig";
import { formatAllStarCyclePipeListLabel } from "@/lib/allStar/cycleUiLabels";
import prisma from "@/lib/prisma";

function printUsage() {
  console.log(`
Usage (after: set -a && source .env.local && set +a):
  npx tsx scripts/all-star-12th-tiebreaker.ts resolve-pipe-label --label "League | Year | ..."

  npx tsx scripts/all-star-12th-tiebreaker.ts standings --title "<exact ballot title>"
  npx tsx scripts/all-star-12th-tiebreaker.ts standings --cycle-id <cuid>

  npx tsx scripts/all-star-12th-tiebreaker.ts create \\
    (--source-title "<exact ballot title>" | --source-cycle-id <cuid>) \\
    --tiebreaker-title "<unique title>" \\
    (--boundary | --ranks 12,13 | --candidate-ids id1,id2) \\
    [--dry-run]

  npx tsx scripts/all-star-12th-tiebreaker.ts publish \\
    --cycle-id <cuid> \\
    --published-at <ISO datetime> \\
    --closed-at <ISO datetime> \\
    [--dry-run]
`);
}

function argvFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function resolveCycleByExactTitle(title: string) {
  const trimmed = title.trim();
  const matches = await prisma.allStarBallotCycle.findMany({
    where: { title: trimmed },
    orderBy: { createdAt: "desc" },
    include: { candidates: { where: { isActive: true } } },
  });
  if (matches.length === 0) {
    console.error(`No ballot cycle found with exact title: ${JSON.stringify(trimmed)}`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `Multiple cycles share this title (${matches.length}). Use --cycle-id or narrow the title.\n`,
    );
    for (const c of matches) {
      console.error(`  id=${c.id} createdAt=${c.createdAt.toISOString()} status=${c.status}`);
    }
    process.exit(1);
  }
  return matches[0]!;
}

async function resolveCycleById(cycleId: string) {
  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId.trim() },
    include: { candidates: { where: { isActive: true } } },
  });
  if (!cycle) {
    console.error(`No ballot cycle found with id: ${JSON.stringify(cycleId.trim())}`);
    process.exit(1);
  }
  return cycle;
}

async function cmdResolvePipeLabel() {
  const label = argvFlag("--label");
  if (!label) {
    console.error("Missing --label");
    printUsage();
    process.exit(1);
  }
  const target = label.trim();
  const cycles = await prisma.allStarBallotCycle.findMany({
    where: { seasonYear: { gte: 2024 } },
    orderBy: { updatedAt: "desc" },
    take: 2500,
  });
  const hits = cycles.filter((c) => {
    const orgId = c.organizationId === "ascension" ? "ascension" : "gonzales";
    return (
      formatAllStarCyclePipeListLabel({
        organizationId: orgId,
        seasonYear: c.seasonYear,
        ageGroup: c.ageGroup,
        title: c.title,
        allStarAgeGroupLabel: c.allStarAgeGroupLabel,
        status: c.status,
        publishedAt: c.publishedAt?.toISOString() ?? null,
        closedAt: c.closedAt?.toISOString() ?? null,
      }) === target
    );
  });
  if (hits.length === 0) {
    console.error("No cycle matched that pipe label.");
    process.exit(1);
  }
  if (hits.length > 1) {
    console.error(`Multiple cycles matched (${hits.length}). Refine the label or use admin.\n`);
    for (const c of hits) {
      console.error(`  id=${c.id} title=${JSON.stringify(c.title)}`);
    }
    process.exit(1);
  }
  const c = hits[0]!;
  const standingsCmd = `npx tsx scripts/all-star-12th-tiebreaker.ts standings --cycle-id ${c.id}`;
  console.log(
    JSON.stringify(
      {
        cycleId: c.id,
        dbTitle: c.title,
        pipeLabel: target,
        nextStandings: standingsCmd,
      },
      null,
      2,
    ),
  );
}

async function cmdStandings() {
  const title = argvFlag("--title");
  const cycleId = argvFlag("--cycle-id");
  if ((!title && !cycleId) || (title && cycleId)) {
    console.error("Provide exactly one of: --title | --cycle-id");
    printUsage();
    process.exit(1);
  }
  const cycle = cycleId ? await resolveCycleById(cycleId) : await resolveCycleByExactTitle(title!);
  const summary = await computeVoteSummaryRows(prisma, cycle.id);
  if (!summary) {
    console.error("Could not load standings.");
    process.exit(1);
  }
  const { rows, cycle: meta, submissionCount } = summary;
  const isRunoff = meta.runoffFirstTeamSize != null && meta.runoffPoolSize != null;
  console.log("\n=== Cycle ===\n");
  console.log(
    JSON.stringify(
      {
        id: cycle.id,
        title: cycle.title,
        status: cycle.status,
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        allStarAgeGroupId: cycle.allStarAgeGroupId,
        allStarAgeGroupLabel: cycle.allStarAgeGroupLabel,
        accessMode: cycle.accessMode,
        runoffFirstTeamSize: cycle.runoffFirstTeamSize,
        runoffPoolSize: cycle.runoffPoolSize,
        submissionCount,
      },
      null,
      2,
    ),
  );

  console.log("\n=== Standings (1-based rank) ===\n");
  for (let i = 0; i < rows.length; i++) {
    const rank = i + 1;
    const row = rows[i]!;
    let tag = "";
    if (isRunoff && cycle.runoffFirstTeamSize) {
      if (rank <= cycle.runoffFirstTeamSize) tag = " [first team]";
      else tag = " [second team]";
    }
    console.log(
      `#${rank}${tag}\t${row.voteCount} votes\tavg ${row.averageRating}\t${row.playerFullName}\t(${row.team} #${row.jerseyNumber})\tid=${row.candidateId}`,
    );
  }

  if (isRunoff && cycle.runoffFirstTeamSize) {
    const split = splitVoteSummaryRowsForRunoff(rows, cycle.runoffFirstTeamSize);
    const lastFirst = split.firstTeam[split.firstTeam.length - 1];
    const firstSecond = split.secondTeam[0];
    console.log("\n=== Boundary (12 vs 13 when first team size is 12) ===\n");
    if (lastFirst && firstSecond) {
      console.log(
        `Rank ${cycle.runoffFirstTeamSize}: ${lastFirst.playerFullName}  id=${lastFirst.candidateId}\nRank ${cycle.runoffFirstTeamSize + 1}: ${firstSecond.playerFullName}  id=${firstSecond.candidateId}`,
      );
    }
  }
  console.log("");
}

function parseRankPair(s: string): [number, number] {
  const parts = s.split(",").map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length !== 2 || parts.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error("--ranks must be two 1-based integers, e.g. 12,13");
  }
  return [parts[0]!, parts[1]!];
}

async function cmdCreate() {
  const sourceTitle = argvFlag("--source-title");
  const sourceCycleId = argvFlag("--source-cycle-id");
  const tiebreakerTitle = argvFlag("--tiebreaker-title");
  const dryRun = hasFlag("--dry-run");
  if ((!sourceTitle && !sourceCycleId) || (sourceTitle && sourceCycleId) || !tiebreakerTitle) {
    console.error("Provide exactly one of: --source-title | --source-cycle-id, and --tiebreaker-title");
    printUsage();
    process.exit(1);
  }
  const source = sourceCycleId
    ? await resolveCycleById(sourceCycleId)
    : await resolveCycleByExactTitle(sourceTitle!);
  const summary = await computeVoteSummaryRows(prisma, source.id);
  if (!summary) {
    console.error("Could not load standings for source cycle.");
    process.exit(1);
  }
  const { rows } = summary;

  let idA: string;
  let idB: string;

  if (hasFlag("--boundary")) {
    const fts = source.runoffFirstTeamSize;
    if (fts == null || fts < 1) {
      console.error("--boundary requires a runoff cycle with runoffFirstTeamSize set.");
      process.exit(1);
    }
    const split = splitVoteSummaryRowsForRunoff(rows, fts);
    const lastFirst = split.firstTeam[split.firstTeam.length - 1];
    const firstSecond = split.secondTeam[0];
    if (!lastFirst || !firstSecond) {
      console.error("Not enough standings rows for boundary pair.");
      process.exit(1);
    }
    idA = lastFirst.candidateId;
    idB = firstSecond.candidateId;
    console.log(
      `\nBoundary pair: rank ${fts} ${lastFirst.playerFullName} / rank ${fts + 1} ${firstSecond.playerFullName}\n`,
    );
  } else if (argvFlag("--ranks")) {
    const [r1, r2] = parseRankPair(argvFlag("--ranks")!);
    const row1 = rows[r1 - 1];
    const row2 = rows[r2 - 1];
    if (!row1 || !row2) {
      console.error("Invalid --ranks: not enough rows in standings.");
      process.exit(1);
    }
    idA = row1.candidateId;
    idB = row2.candidateId;
    console.log(`\nRanks ${r1} & ${r2}: ${row1.playerFullName} / ${row2.playerFullName}\n`);
  } else if (argvFlag("--candidate-ids")) {
    const raw = argvFlag("--candidate-ids")!;
    const parts = raw.split(",").map((s) => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      console.error("--candidate-ids must be two comma-separated candidate ids from the source cycle.");
      process.exit(1);
    }
    idA = parts[0]!;
    idB = parts[1]!;
  } else {
    console.error("Specify one of: --boundary | --ranks 12,13 | --candidate-ids id1,id2");
    process.exit(1);
  }

  if (idA === idB) {
    console.error("The two candidate ids must differ.");
    process.exit(1);
  }

  const sourceCandidates = source.candidates.filter((c) => c.id === idA || c.id === idB);
  if (sourceCandidates.length !== 2) {
    console.error(
      "Could not resolve both candidate ids on the source cycle (wrong ids or inactive missing).",
    );
    process.exit(1);
  }

  const dup = await prisma.allStarBallotCycle.findFirst({
    where: {
      organizationId: source.organizationId,
      seasonYear: source.seasonYear,
      ageGroup: source.ageGroup,
      allStarAgeGroupId: source.allStarAgeGroupId,
      title: tiebreakerTitle.trim(),
    },
  });
  if (dup) {
    console.error(`A cycle with this tiebreaker title already exists: id=${dup.id}`);
    process.exit(1);
  }

  const invites = await prisma.allStarInvite.findMany({
    where: { ballotCycleId: source.id },
    orderBy: { createdAt: "desc" },
  });

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          wouldCreate: {
            organizationId: source.organizationId,
            seasonYear: source.seasonYear,
            ageGroup: source.ageGroup,
            allStarAgeGroupId: source.allStarAgeGroupId,
            allStarAgeGroupLabel: source.allStarAgeGroupLabel,
            title: tiebreakerTitle.trim(),
            accessMode: source.accessMode,
            hasShowcase: source.hasShowcase,
            requiredRatingsPerCoach: 1,
            candidateIds: [idA, idB],
            inviteCount: invites.length,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const createdId = await prisma.$transaction(async (tx) => {
    const cycle = await tx.allStarBallotCycle.create({
      data: {
        organizationId: source.organizationId,
        seasonYear: source.seasonYear,
        ageGroup: source.ageGroup,
        allStarAgeGroupId: source.allStarAgeGroupId,
        allStarAgeGroupLabel: source.allStarAgeGroupLabel,
        title: tiebreakerTitle.trim(),
        hasShowcase: source.hasShowcase,
        requiredRatingsPerCoach: 1,
        status: "DRAFT",
        accessMode: source.accessMode,
        createdByAdminId: null,
        parentBallotCycleId: null,
        runoffPoolSize: null,
        runoffFirstTeamSize: null,
      },
    });

    for (const c of sourceCandidates) {
      await tx.allStarCandidate.create({
        data: {
          ballotCycleId: cycle.id,
          organizationId: c.organizationId,
          ageGroup: c.ageGroup,
          playerFullName: c.playerFullName,
          team: c.team,
          jerseyNumber: c.jerseyNumber,
          showcaseBibNumber: c.showcaseBibNumber,
          isActive: c.isActive,
        },
      });
    }

    for (const inv of invites) {
      await tx.allStarInvite.create({
        data: {
          ballotCycleId: cycle.id,
          tokenHash: null,
          inviteToken: null,
          organizationId: inv.organizationId,
          ageGroup: inv.ageGroup,
          invitedEmail: inv.invitedEmail,
          invitedUserId: inv.invitedUserId,
          createdByAdminId: inv.createdByAdminId,
          revokedAt: inv.revokedAt,
          expiresAt: inv.expiresAt,
        },
      });
    }

    return cycle.id;
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        tiebreakerCycleId: createdId,
        next: `Publish with:\n  set -a && source .env.local && set +a && npx tsx scripts/all-star-12th-tiebreaker.ts publish --cycle-id ${createdId} --published-at <ISO> --closed-at <ISO>`,
      },
      null,
      2,
    ),
  );
}

async function allocateBallotToken(cycleId: string) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const token = createBallotLinkToken();
    const tokenHash = hashToken(token);
    try {
      await prisma.allStarBallotCycle.update({
        where: { id: cycleId },
        data: { ballotLinkToken: token, ballotLinkTokenHash: tokenHash },
      });
      return token;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique ballot link token.");
}

async function cmdPublish() {
  const cycleId = argvFlag("--cycle-id");
  const publishedAtRaw = argvFlag("--published-at");
  const closedAtRaw = argvFlag("--closed-at");
  const dryRun = hasFlag("--dry-run");
  if (!cycleId || !publishedAtRaw || !closedAtRaw) {
    console.error("Missing --cycle-id, --published-at, or --closed-at");
    printUsage();
    process.exit(1);
  }
  const publishedAt = new Date(publishedAtRaw);
  const closedAt = new Date(closedAtRaw);
  if (Number.isNaN(publishedAt.getTime()) || Number.isNaN(closedAt.getTime())) {
    console.error("Invalid ISO datetimes.");
    process.exit(1);
  }
  if (closedAt <= publishedAt) {
    console.error("closed-at must be after published-at.");
    process.exit(1);
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) {
    console.error("Cycle not found.");
    process.exit(1);
  }

  let token = cycle.ballotLinkToken;
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          wouldSet: { status: "PUBLISHED", publishedAt, closedAt },
          ballotLinkToken: token ?? "(would allocate)",
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!token) {
    token = await allocateBallotToken(cycleId);
  } else if (!cycle.ballotLinkTokenHash) {
    await prisma.allStarBallotCycle.update({
      where: { id: cycleId },
      data: { ballotLinkTokenHash: hashToken(token) },
    });
  }

  await prisma.allStarBallotCycle.update({
    where: { id: cycleId },
    data: {
      status: "PUBLISHED",
      publishedAt,
      closedAt,
    },
  });

  const origin = getCanonicalBallotOriginForOrganizationId(cycle.organizationId);
  const link = `${origin}/all-star/vote?t=${encodeURIComponent(token!)}`;

  console.log(
    JSON.stringify(
      {
        success: true,
        cycleId,
        status: "PUBLISHED",
        publishedAt: publishedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        ballotVotingLink: link,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    printUsage();
    process.exit(0);
  }
  if (cmd === "standings") await cmdStandings();
  else if (cmd === "resolve-pipe-label") await cmdResolvePipeLabel();
  else if (cmd === "create") await cmdCreate();
  else if (cmd === "publish") await cmdPublish();
  else {
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
