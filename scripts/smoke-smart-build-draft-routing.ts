/**
 * End-to-end smoke test for the Smart Auto-Build "Roster build method"
 * routing logic (DIRECT_IMPORT -> TeamPlayer vs DRAFT -> DraftPlayerPool)
 * merged in lib/draft/draftPoolImport.ts and
 * app/api/admin/teams/smart-build/confirm/route.ts, plus its undo coverage
 * in app/api/admin/teams/import/route.ts's undoBatch.
 *
 * This calls the exact same exported functions the confirm route calls
 * (applyDraftPoolRows, applyImportRows, undoBatch), reproducing that route's
 * partition-rows-by-age-group -> apply -> batch orchestration directly,
 * since the route handler itself requires an authenticated admin session
 * (NextRequest + ensureAdminModule) that isn't practical to fake here. It is
 * a logic-level e2e test against the real dev database, not an HTTP test.
 *
 * Run on dev-box (DEV database):
 *   pnpm exec tsx --conditions=react-server --env-file=.env.local --env-file=.env.development.local \
 *     scripts/smoke-smart-build-draft-routing.ts
 * (--conditions=react-server: lib/prisma.ts imports "server-only", whose package.json only
 * no-ops under that export condition — otherwise it throws when required from plain Node/tsx
 * instead of a bundler. Omit --env-file=.env.local if this box has no .env.local.)
 */
import prisma from "@/lib/prisma";
import {
  applyImportRows,
  emptyUndoPayload,
  getRowValue,
  undoBatch,
  PLAYER_IMPORT_DIVISION_KEYS,
  type Row,
  type UndoSnapshot,
} from "@/app/api/admin/teams/import/route";
import { applyDraftPoolRows } from "@/lib/draft/draftPoolImport";

const ORG = "gonzales";
const SEASON_YEAR = 2099; // far-future, isolates this run from any real season's data

type StepResult = {
  id: string;
  label: string;
  ok: boolean;
  ms: number;
  detail: string;
  issues: string[];
};

const results: StepResult[] = [];
const batchIds: string[] = [];

function msSince(start: number) {
  return Math.round(performance.now() - start);
}

function record(step: Omit<StepResult, "ms"> & { start: number }) {
  results.push({
    id: step.id,
    label: step.label,
    ok: step.ok,
    ms: msSince(step.start),
    detail: step.detail,
    issues: step.issues,
  });
}

function playerRow(ageGroup: string, teamName: string | null, fullName: string, email: string): Row {
  const row: Row = {
    "Division Name": ageGroup,
    "Player Full Name": fullName,
    "User Email": email,
    "Player Birth Date": "2015-04-01",
  };
  if (teamName) row["Team Name"] = teamName;
  return row;
}

/**
 * Reproduces app/api/admin/teams/smart-build/confirm/route.ts's Player
 * Registration step 2 exactly: split rows by age group into DIRECT_IMPORT
 * vs DRAFT, route DRAFT rows through applyDraftPoolRows, route the rest
 * through applyImportRows sharing one TeamPlayerImportBatch/undo unit.
 */
async function runSmartBuildPlayerStep(rows: Row[], draftAgeGroups: Set<string>) {
  const directRows: Row[] = [];
  const draftPoolRows: Row[] = [];
  for (const row of rows) {
    const rawAgeGroup = getRowValue(row, PLAYER_IMPORT_DIVISION_KEYS) || "";
    if (draftAgeGroups.has(rawAgeGroup.trim().toLowerCase())) {
      draftPoolRows.push(row);
    } else {
      directRows.push(row);
    }
  }

  const draftPoolApplied =
    draftPoolRows.length > 0
      ? await applyDraftPoolRows({ rows: draftPoolRows, targetOrg: ORG, seasonYear: SEASON_YEAR, adminId: null })
      : null;

  const initialUndoPayload: UndoSnapshot = {
    ...emptyUndoPayload(),
    createdDraftPoolEntryIds: draftPoolApplied?.createdEntryIds ?? [],
    createdDraftSessionIds: draftPoolApplied?.createdSessionIds ?? [],
  };
  const playerBatch = await prisma.teamPlayerImportBatch.create({
    data: {
      organizationId: ORG,
      status: "RUNNING",
      totalRows: rows.length,
      undoPayload: JSON.parse(JSON.stringify(initialUndoPayload)),
    },
  });
  batchIds.push(playerBatch.id);

  const applied = await applyImportRows({
    rows: directRows,
    targetOrg: ORG,
    adminId: null,
    explicitSeasonYear: SEASON_YEAR,
    divisionMappings: new Map(),
    batchId: playerBatch.id,
  });
  await prisma.teamPlayerImportBatch.update({
    where: { id: playerBatch.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return { batchId: playerBatch.id, draftPoolApplied, applied };
}

async function preCleanup() {
  // Scoped to seasonYear 2099 — a hard isolation key no real season data can ever collide with.
  // Deliberately does NOT sweep TeamPlayerImportBatch rows here: there's no equally hard key to
  // scope that model by (no seasonYear column on it), and guessing by heuristic (recency/row
  // count) risks deleting a real admin's legitimate import batch on this shared dev database.
  // A crashed prior run leaves at most a few harmless COMPLETED batch rows behind.
  await prisma.draftPlayerPool.deleteMany({ where: { draftSession: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.draftPick.deleteMany({ where: { draftSession: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.draftTeam.deleteMany({ where: { draftSession: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.draftSession.deleteMany({ where: { organizationId: ORG, seasonYear: SEASON_YEAR } });
  await prisma.teamPlayer.deleteMany({ where: { team: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.team.deleteMany({ where: { organizationId: ORG, seasonYear: SEASON_YEAR } });
}

async function finalCleanup() {
  await prisma.draftPlayerPool.deleteMany({ where: { draftSession: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.draftPick.deleteMany({ where: { draftSession: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.draftTeam.deleteMany({ where: { draftSession: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.draftSession.deleteMany({ where: { organizationId: ORG, seasonYear: SEASON_YEAR } });
  await prisma.teamPlayer.deleteMany({ where: { team: { organizationId: ORG, seasonYear: SEASON_YEAR } } });
  await prisma.team.deleteMany({ where: { organizationId: ORG, seasonYear: SEASON_YEAR } });
  if (batchIds.length > 0) {
    await prisma.teamPlayerImportBatch.deleteMany({ where: { id: { in: batchIds } } });
  }
}

async function main() {
  console.log("=== Smart Auto-Build / Draft Pool routing smoke test ===\n");
  await preCleanup();

  // 1. DIRECT_IMPORT baseline: no age group flagged for draft -> writes TeamPlayer, and a re-run updates rather than duplicates.
  {
    const start = performance.now();
    const issues: string[] = [];
    const ageGroup = "SMOKE-10U-Direct";
    try {
      const rows = [
        playerRow(ageGroup, "[smoke] Wildcats", "Alice Anderson", "alice.parent@example.com"),
        playerRow(ageGroup, "[smoke] Wildcats", "Bob Brown", "bob.parent@example.com"),
      ];
      const first = await runSmartBuildPlayerStep(rows, new Set());
      if (first.applied.batch.createdTeams !== 1) issues.push(`expected 1 created team, got ${first.applied.batch.createdTeams}`);
      if (first.applied.batch.createdPlayers !== 2) issues.push(`expected 2 created players, got ${first.applied.batch.createdPlayers}`);
      if (first.draftPoolApplied !== null) issues.push("expected no draft pool activity for a non-flagged age group");

      const team = await prisma.team.findUnique({
        where: { organizationId_seasonYear_ageGroup_teamName: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup, teamName: "[smoke] Wildcats" } },
        include: { players: true },
      });
      if (!team) issues.push("Team row not found after direct import");
      if (team && team.players.length !== 2) issues.push(`expected 2 TeamPlayer rows, found ${team.players.length}`);

      // Re-run the same rows: should update in place, not duplicate.
      const second = await runSmartBuildPlayerStep(rows, new Set());
      if (second.applied.batch.createdTeams !== 0) issues.push(`re-run should create 0 teams, got ${second.applied.batch.createdTeams}`);
      if (second.applied.batch.createdPlayers !== 0) issues.push(`re-run should create 0 players, got ${second.applied.batch.createdPlayers}`);
      if (second.applied.batch.updatedPlayers !== 2) issues.push(`re-run should update 2 players, got ${second.applied.batch.updatedPlayers}`);
      const teamAfter = await prisma.team.findFirst({ where: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup }, include: { players: true } });
      if (teamAfter && teamAfter.players.length !== 2) issues.push(`re-run should still have 2 players, found ${teamAfter.players.length}`);

      record({ start, id: "direct-baseline", label: "DIRECT_IMPORT baseline + idempotent re-run", ok: issues.length === 0, detail: `team=${team?.id} players=${team?.players.length}`, issues });
    } catch (e) {
      record({ start, id: "direct-baseline", label: "DIRECT_IMPORT baseline + idempotent re-run", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  // 2. DRAFT routing: flagged age group seeds a DraftSession + DraftPlayerPool, no Team/TeamPlayer writes.
  let draftSession12u: string | null = null;
  {
    const start = performance.now();
    const issues: string[] = [];
    const ageGroup = "SMOKE-12U-Draft";
    try {
      const rows = [
        playerRow(ageGroup, null, "Casey Coach-Kid", "casey.parent@example.com"),
        playerRow(ageGroup, null, "Dana Draftee", "dana.parent@example.com"),
        playerRow(ageGroup, null, "Evan Entrant", "evan.parent@example.com"),
      ];
      const { draftPoolApplied, applied } = await runSmartBuildPlayerStep(rows, new Set([ageGroup.toLowerCase()]));
      if (!draftPoolApplied) throw new Error("expected draftPoolApplied to run");
      if (draftPoolApplied.createdSessions !== 1) issues.push(`expected 1 created session, got ${draftPoolApplied.createdSessions}`);
      if (draftPoolApplied.createdEntries !== 3) issues.push(`expected 3 created pool entries, got ${draftPoolApplied.createdEntries}`);
      if (applied.batch.createdPlayers !== 0 || applied.batch.createdTeams !== 0) {
        issues.push(`DRAFT rows must not touch TeamPlayer/Team: createdPlayers=${applied.batch.createdPlayers} createdTeams=${applied.batch.createdTeams}`);
      }

      const session = await prisma.draftSession.findFirst({ where: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup }, include: { playerPool: true } });
      if (!session) throw new Error("DraftSession not found");
      draftSession12u = session.id;
      if (session.status !== "SETUP") issues.push(`expected SETUP status, got ${session.status}`);
      if (session.name !== `${SEASON_YEAR} ${ageGroup} Draft`) issues.push(`unexpected session name "${session.name}"`);
      if (session.playerPool.length !== 3) issues.push(`expected 3 pool entries, found ${session.playerPool.length}`);
      const anyTeamForAgeGroup = await prisma.team.findFirst({ where: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup } });
      if (anyTeamForAgeGroup) issues.push("DRAFT age group should not create a Team row");

      record({ start, id: "draft-routing", label: "DRAFT routing seeds DraftSession + DraftPlayerPool", ok: issues.length === 0, detail: `session=${session.id} entries=${session.playerPool.length}`, issues });
    } catch (e) {
      record({ start, id: "draft-routing", label: "DRAFT routing seeds DraftSession + DraftPlayerPool", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  // 3. Re-run the same DRAFT rows: dedup by fullName within the session (update, not duplicate); session is found, not re-created.
  {
    const start = performance.now();
    const issues: string[] = [];
    const ageGroup = "SMOKE-12U-Draft";
    try {
      const rows = [
        playerRow(ageGroup, null, "Casey Coach-Kid", "casey.parent@example.com"),
        playerRow(ageGroup, null, "Dana Draftee", "dana.parent@example.com"),
        playerRow(ageGroup, null, "Evan Entrant", "evan.parent@example.com"),
      ];
      const { draftPoolApplied } = await runSmartBuildPlayerStep(rows, new Set([ageGroup.toLowerCase()]));
      if (!draftPoolApplied) throw new Error("expected draftPoolApplied to run");
      if (draftPoolApplied.createdSessions !== 0) issues.push(`re-run should find existing session, created ${draftPoolApplied.createdSessions}`);
      if (draftPoolApplied.createdEntries !== 0) issues.push(`re-run should create 0 entries, got ${draftPoolApplied.createdEntries}`);
      if (draftPoolApplied.updatedEntries !== 3) issues.push(`re-run should update 3 entries, got ${draftPoolApplied.updatedEntries}`);
      const sessions = await prisma.draftSession.findMany({ where: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup } });
      if (sessions.length !== 1) issues.push(`expected exactly 1 session to still exist, found ${sessions.length}`);
      const entryCount = await prisma.draftPlayerPool.count({ where: { draftSessionId: draftSession12u ?? "" } });
      if (entryCount !== 3) issues.push(`expected 3 pool entries after re-run (no dupes), found ${entryCount}`);

      record({ start, id: "draft-dedup", label: "DRAFT re-run dedupes by fullName (update, not duplicate)", ok: issues.length === 0, detail: `sessions=${sessions.length} entries=${entryCount}`, issues });
    } catch (e) {
      record({ start, id: "draft-dedup", label: "DRAFT re-run dedupes by fullName", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  // 4. Mixed batch (1 direct + 1 draft row for an age group with a pre-existing session) + undo: undo must delete what this batch created, and must NOT delete the session since this batch didn't create it.
  {
    const start = performance.now();
    const issues: string[] = [];
    const directAgeGroup = "SMOKE-10U-Direct";
    const draftAgeGroup = "SMOKE-12U-Draft";
    try {
      const rows = [
        playerRow(directAgeGroup, "[smoke] Comets", "Frank Fielder", "frank.parent@example.com"),
        playerRow(draftAgeGroup, null, "Grace Grounder", "grace.parent@example.com"),
      ];
      const { batchId, draftPoolApplied, applied } = await runSmartBuildPlayerStep(rows, new Set([draftAgeGroup.toLowerCase()]));
      if (!draftPoolApplied) throw new Error("expected draftPoolApplied to run");
      if (draftPoolApplied.createdSessions !== 0) issues.push(`session already existed; expected 0 created, got ${draftPoolApplied.createdSessions}`);
      if (draftPoolApplied.createdEntries !== 1) issues.push(`expected 1 new pool entry, got ${draftPoolApplied.createdEntries}`);
      if (applied.batch.createdTeams !== 1 || applied.batch.createdPlayers !== 1) {
        issues.push(`expected 1 created team + 1 created player, got teams=${applied.batch.createdTeams} players=${applied.batch.createdPlayers}`);
      }

      const cometsTeamBefore = await prisma.team.findFirst({ where: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup: directAgeGroup, teamName: "[smoke] Comets" } });
      if (!cometsTeamBefore) issues.push("Comets team not found before undo");
      const poolCountBefore = await prisma.draftPlayerPool.count({ where: { draftSessionId: draftSession12u ?? "" } });
      if (poolCountBefore !== 4) issues.push(`expected 4 pool entries before undo, found ${poolCountBefore}`);

      const undone = await undoBatch(ORG, batchId);
      if (undone.deletedPlayers !== 1) issues.push(`expected 1 deleted player, got ${undone.deletedPlayers}`);
      if (undone.deletedTeams !== 1) issues.push(`expected 1 deleted team, got ${undone.deletedTeams}`);
      if (undone.deletedDraftPoolEntries !== 1) issues.push(`expected 1 deleted pool entry, got ${undone.deletedDraftPoolEntries}`);
      if (undone.deletedDraftSessions !== 0) issues.push(`session pre-existed this batch; expected 0 deleted sessions, got ${undone.deletedDraftSessions}`);

      const cometsTeamAfter = await prisma.team.findFirst({ where: { organizationId: ORG, seasonYear: SEASON_YEAR, ageGroup: directAgeGroup, teamName: "[smoke] Comets" } });
      if (cometsTeamAfter) issues.push("Comets team should be gone after undo");
      const sessionAfter = await prisma.draftSession.findUnique({ where: { id: draftSession12u ?? "" } });
      if (!sessionAfter) issues.push("pre-existing DraftSession should survive undo of a later batch");
      const poolCountAfter = await prisma.draftPlayerPool.count({ where: { draftSessionId: draftSession12u ?? "" } });
      if (poolCountAfter !== 3) issues.push(`expected 3 pool entries after undo (back to step 2/3's set), found ${poolCountAfter}`);

      record({ start, id: "undo-preserves-existing-session", label: "Undo deletes batch's writes, preserves pre-existing session", ok: issues.length === 0, detail: `deletedPlayers=${undone.deletedPlayers} deletedTeams=${undone.deletedTeams} deletedDraftPoolEntries=${undone.deletedDraftPoolEntries} deletedDraftSessions=${undone.deletedDraftSessions}`, issues });
    } catch (e) {
      record({ start, id: "undo-preserves-existing-session", label: "Undo deletes batch's writes, preserves pre-existing session", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  // 5. Fresh age group, batch creates the session; undo leaves it empty -> session itself gets deleted.
  {
    const start = performance.now();
    const issues: string[] = [];
    const ageGroup = "SMOKE-14U-Draft-Empty";
    try {
      const rows = [
        playerRow(ageGroup, null, "Harper Hitter", "harper.parent@example.com"),
        playerRow(ageGroup, null, "Ivy Infielder", "ivy.parent@example.com"),
      ];
      const { batchId, draftPoolApplied } = await runSmartBuildPlayerStep(rows, new Set([ageGroup.toLowerCase()]));
      if (!draftPoolApplied) throw new Error("expected draftPoolApplied to run");
      if (draftPoolApplied.createdSessions !== 1) issues.push(`expected 1 created session, got ${draftPoolApplied.createdSessions}`);
      const sessionId = draftPoolApplied.createdSessionIds[0];
      if (!sessionId) throw new Error("no createdSessionIds returned");

      const undone = await undoBatch(ORG, batchId);
      if (undone.deletedDraftPoolEntries !== 2) issues.push(`expected 2 deleted pool entries, got ${undone.deletedDraftPoolEntries}`);
      if (undone.deletedDraftSessions !== 1) issues.push(`expected the now-empty session to be deleted, deletedDraftSessions=${undone.deletedDraftSessions}`);
      const sessionAfter = await prisma.draftSession.findUnique({ where: { id: sessionId } });
      if (sessionAfter) issues.push("empty session created by this batch should be gone after undo");

      record({ start, id: "undo-deletes-empty-session", label: "Undo deletes a session it created, once empty", ok: issues.length === 0, detail: `deletedDraftSessions=${undone.deletedDraftSessions}`, issues });
    } catch (e) {
      record({ start, id: "undo-deletes-empty-session", label: "Undo deletes a session it created, once empty", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  // 6. Fresh age group, batch creates the session, but something else adds another pool entry before undo -> session must survive (not empty).
  {
    const start = performance.now();
    const issues: string[] = [];
    const ageGroup = "SMOKE-16U-Draft-Guarded";
    try {
      const rows = [playerRow(ageGroup, null, "Jamie Justforsmoke", "jamie.parent@example.com")];
      const { batchId, draftPoolApplied } = await runSmartBuildPlayerStep(rows, new Set([ageGroup.toLowerCase()]));
      if (!draftPoolApplied) throw new Error("expected draftPoolApplied to run");
      const sessionId = draftPoolApplied.createdSessionIds[0];
      if (!sessionId) throw new Error("no createdSessionIds returned");

      // Simulate something outside this batch touching the session (e.g. a second import run, or manual pool edit).
      await prisma.draftPlayerPool.create({
        data: { draftSessionId: sessionId, fullName: "Kit Outsider", firstName: "Kit", lastName: "Outsider" },
      });

      const undone = await undoBatch(ORG, batchId);
      if (undone.deletedDraftPoolEntries !== 1) issues.push(`expected 1 deleted pool entry (only this batch's), got ${undone.deletedDraftPoolEntries}`);
      if (undone.deletedDraftSessions !== 0) issues.push(`session has an entry from outside this batch; expected 0 deleted, got ${undone.deletedDraftSessions}`);
      const sessionAfter = await prisma.draftSession.findUnique({ where: { id: sessionId }, include: { playerPool: true } });
      if (!sessionAfter) issues.push("session should survive since it wasn't left empty");
      if (sessionAfter && sessionAfter.playerPool.length !== 1) issues.push(`expected 1 remaining entry (the outsider), found ${sessionAfter.playerPool.length}`);
      if (sessionAfter && sessionAfter.playerPool[0]?.fullName !== "Kit Outsider") issues.push("wrong entry survived undo");

      record({ start, id: "undo-guards-nonempty-session", label: "Undo leaves a session alone if it isn't empty", ok: issues.length === 0, detail: `deletedDraftSessions=${undone.deletedDraftSessions} remaining=${sessionAfter?.playerPool.length}`, issues });
    } catch (e) {
      record({ start, id: "undo-guards-nonempty-session", label: "Undo leaves a session alone if it isn't empty", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  // 7. Fresh age group; the pool entry gets drafted (isDrafted: true) before undo runs -> entry (and therefore session) must survive.
  {
    const start = performance.now();
    const issues: string[] = [];
    const ageGroup = "SMOKE-18U-Draft-Picked";
    try {
      const rows = [playerRow(ageGroup, null, "Logan Lineup", "logan.parent@example.com")];
      const { batchId, draftPoolApplied } = await runSmartBuildPlayerStep(rows, new Set([ageGroup.toLowerCase()]));
      if (!draftPoolApplied) throw new Error("expected draftPoolApplied to run");
      const entryId = draftPoolApplied.createdEntryIds[0];
      const sessionId = draftPoolApplied.createdSessionIds[0];
      if (!entryId || !sessionId) throw new Error("missing created entry/session id");

      // Simulate a pick being made against this pool entry before the batch is undone.
      await prisma.draftPlayerPool.update({ where: { id: entryId }, data: { isDrafted: true } });

      const undone = await undoBatch(ORG, batchId);
      if (undone.deletedDraftPoolEntries !== 0) issues.push(`drafted entry must not be deleted, got deletedDraftPoolEntries=${undone.deletedDraftPoolEntries}`);
      if (undone.deletedDraftSessions !== 0) issues.push(`session still holds the drafted entry; expected 0 deleted, got ${undone.deletedDraftSessions}`);
      const entryAfter = await prisma.draftPlayerPool.findUnique({ where: { id: entryId } });
      if (!entryAfter) issues.push("drafted pool entry should survive undo");
      if (entryAfter && !entryAfter.isDrafted) issues.push("survived entry lost its isDrafted flag");
      const sessionAfter = await prisma.draftSession.findUnique({ where: { id: sessionId } });
      if (!sessionAfter) issues.push("session holding a drafted entry should survive undo");

      record({ start, id: "undo-protects-drafted-entry", label: "Undo never deletes an already-drafted pool entry", ok: issues.length === 0, detail: `deletedDraftPoolEntries=${undone.deletedDraftPoolEntries} deletedDraftSessions=${undone.deletedDraftSessions}`, issues });
    } catch (e) {
      record({ start, id: "undo-protects-drafted-entry", label: "Undo never deletes an already-drafted pool entry", ok: false, detail: e instanceof Error ? e.message : String(e), issues: ["exception"] });
    }
  }

  await finalCleanup();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("| Step | Status | ms | Detail |");
  console.log("|------|--------|-----|--------|");
  for (const r of results) {
    console.log(`| ${r.label} | ${r.ok ? "PASS" : "FAIL"} | ${r.ms} | ${r.detail.replace(/\|/g, "/")} |`);
    if (r.issues.length) console.log(`  issues: ${r.issues.join("; ")}`);
  }
  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length) {
    console.error("\nFailed steps:", failed.map((f) => f.id).join(", "));
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
