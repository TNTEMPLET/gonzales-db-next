import { prisma } from "@/lib/prisma";
import { DraftType } from "@prisma/client";
import type { ActiveTeamOnClock } from "@/lib/draft/types";

export type { ActiveTeamOnClock };

/**
 * Calculates which team is on the clock for a given pick index in a draft session.
 */
export function calculateTeamOnClock(
  teams: { id: string; teamName: string; draftOrder: number; headCoach?: { name: string | null } | null }[],
  pickIndex: number,
  draftType: DraftType
): { teamIndex: number; round: number; pickInRound: number } {
  const numTeams = teams.length;
  if (numTeams === 0) {
    return { teamIndex: 0, round: 1, pickInRound: 1 };
  }

  const round = Math.floor(pickIndex / numTeams) + 1;
  const pickInRound0Index = pickIndex % numTeams;
  const pickInRound = pickInRound0Index + 1;

  let teamIndex0Index = pickInRound0Index;
  if (draftType === DraftType.SNAKE && round % 2 === 0) {
    teamIndex0Index = numTeams - 1 - pickInRound0Index;
  }

  return { teamIndex: teamIndex0Index, round, pickInRound };
}

/**
 * Fetches current state of a draft session including who is on the clock.
 */
export async function getDraftSessionState(sessionId: string) {
  const session = await prisma.draftSession.findUnique({
    where: { id: sessionId },
    include: {
      draftLeader: {
        select: { id: true, name: true, email: true },
      },
      teams: {
        orderBy: { draftOrder: "asc" },
        include: {
          headCoach: { select: { id: true, name: true, email: true } },
          assistantCoach: { select: { id: true, name: true, email: true } },
          picks: {
            include: {
              draftSession: false,
            },
            orderBy: { overallPick: "asc" },
          },
          protections: true,
        },
      },
      playerPool: {
        orderBy: [{ evaluationScore: "desc" }, { fullName: "asc" }],
      },
      picks: {
        orderBy: { overallPick: "asc" },
      },
      protections: true,
    },
  });

  if (!session) {
    throw new Error(`DraftSession not found: ${sessionId}`);
  }

  const { teamIndex, round, pickInRound } = calculateTeamOnClock(
    session.teams,
    session.currentPickIndex,
    session.draftType
  );

  const activeTeam = session.teams[teamIndex];

  // Check if active team has a protected pick for this round. Overridden
  // protections (e.g. an admin undid an auto-placed pick) are treated as if
  // they don't exist -- the round is open for a normal manual pick.
  const protection = activeTeam
    ? session.protections.find(
        (p) => p.draftTeamId === activeTeam.id && p.protectedRound === round && !p.isClaimed && !p.isOverridden
      )
    : undefined;

  const matchingPoolPlayer = protection
    ? session.playerPool.find(
        (p) =>
          !p.isDrafted &&
          p.fullName.trim().toLowerCase() === protection.playerName.trim().toLowerCase()
      )
    : undefined;

  const onClock: ActiveTeamOnClock | null =
    activeTeam && session.status !== "COMPLETED" && session.status !== "MATERIALIZED"
      ? {
          teamId: activeTeam.id,
          teamName: activeTeam.teamName,
          headCoachName: activeTeam.headCoach?.name || null,
          round,
          overallPick: session.currentPickIndex + 1,
          pickInRound,
          isProtectedPick: !!protection,
          protectedPlayerName: protection?.playerName,
          protectedPlayerPoolId: matchingPoolPlayer?.id,
          protectedPlayerProtectionType: protection?.protectionType,
        }
      : null;

  return {
    session,
    onClock,
  };
}

/**
 * Executes a pick in the draft session.
 */
export async function makeDraftPick(
  sessionId: string,
  playerPoolId: string,
  adminUserId?: string
) {
  const { session, onClock } = await getDraftSessionState(sessionId);

  if (!onClock) {
    throw new Error("No team currently on the clock");
  }

  const player = session.playerPool.find((p) => p.id === playerPoolId);
  if (!player) {
    throw new Error("Player not found in draft pool");
  }

  if (player.isDrafted) {
    throw new Error("Player has already been drafted");
  }

  await prisma.$transaction(async (tx) => {
    // 1. Record the pick
    const pick = await tx.draftPick.create({
      data: {
        draftSessionId: sessionId,
        round: onClock.round,
        overallPick: onClock.overallPick,
        draftTeamId: onClock.teamId,
        playerPoolId: player.id,
        isProtectedPick: onClock.isProtectedPick,
        pickedByAdminId: adminUserId,
      },
    });

    // 2. Mark player as drafted
    await tx.draftPlayerPool.update({
      where: { id: player.id },
      data: {
        isDrafted: true,
        draftedTeamId: onClock.teamId,
        draftedPickId: pick.id,
      },
    });

    // 3. Mark protection as claimed if applicable
    if (onClock.isProtectedPick) {
      await tx.coachPlayerProtection.updateMany({
        where: {
          draftSessionId: sessionId,
          draftTeamId: onClock.teamId,
          protectedRound: onClock.round,
        },
        data: { isClaimed: true },
      });
    }

    // 4. Increment session pick index
    const nextPickIndex = session.currentPickIndex + 1;
    const totalPossiblePicks = session.teams.length * session.totalRounds;
    const remainingPlayers = session.playerPool.filter((p) => !p.isDrafted && p.id !== player.id);

    const isFinished = nextPickIndex >= totalPossiblePicks || remainingPlayers.length === 0;

    const nextRound = Math.floor(nextPickIndex / session.teams.length) + 1;

    await tx.draftSession.update({
      where: { id: sessionId },
      data: {
        currentPickIndex: nextPickIndex,
        currentRound: nextRound,
        status: isFinished ? "COMPLETED" : "LIVE",
      },
    });
  });

  return await getDraftSessionState(sessionId);
}

/**
 * Auto-executes every consecutive protected pick (coach-linked child or
 * returning player) starting from whoever is currently on the clock, so an
 * admin never has to click "Auto-Lock" -- the picks just land the moment the
 * draft naturally reaches them. Stops at the first pick that needs a human
 * decision: draft isn't LIVE, nobody's on the clock, the on-clock team has no
 * protection for this round, or the protection's name doesn't resolve to an
 * actual player still in the pool.
 */
export async function resolveAutoProtectedPicks(sessionId: string) {
  // Bounded to one full pass over every team/round combination so a data bug
  // can't spin this into an infinite loop.
  const { session: initialSession } = await getDraftSessionState(sessionId);
  const maxIterations = Math.max(initialSession.teams.length, 1) * Math.max(initialSession.totalRounds, 1);

  for (let i = 0; i < maxIterations; i++) {
    const { session, onClock } = await getDraftSessionState(sessionId);
    if (session.status !== "LIVE") break;
    if (!onClock || !onClock.isProtectedPick || !onClock.protectedPlayerPoolId) break;
    await makeDraftPick(sessionId, onClock.protectedPlayerPoolId);
  }
}

/**
 * Undoes the last overall pick in the draft.
 */
export async function undoLastDraftPick(sessionId: string) {
  const session = await prisma.draftSession.findUnique({
    where: { id: sessionId },
    include: {
      picks: {
        orderBy: { overallPick: "desc" },
        take: 1,
      },
      teams: true,
    },
  });

  if (!session || session.picks.length === 0) {
    throw new Error("No picks to undo");
  }

  const lastPick = session.picks[0];

  await prisma.$transaction(async (tx) => {
    // If the undone pick was a protected pick, unclaim the protection --
    // and mark it overridden so it doesn't just get auto-drafted right back
    // on the next poll. An admin can re-enable it from Manage Teams.
    if (lastPick.isProtectedPick) {
      await tx.coachPlayerProtection.updateMany({
        where: {
          draftSessionId: sessionId,
          draftTeamId: lastPick.draftTeamId,
          protectedRound: lastPick.round,
        },
        data: { isClaimed: false, isOverridden: true },
      });
    }

    // Delete the pick
    await tx.draftPick.delete({ where: { id: lastPick.id } });

    // Restore player pool status
    await tx.draftPlayerPool.update({
      where: { id: lastPick.playerPoolId },
      data: {
        isDrafted: false,
        draftedTeamId: null,
        draftedPickId: null,
      },
    });

    const prevPickIndex = Math.max(0, session.currentPickIndex - 1);
    const prevRound = Math.floor(prevPickIndex / (session.teams.length || 1)) + 1;

    await tx.draftSession.update({
      where: { id: sessionId },
      data: {
        currentPickIndex: prevPickIndex,
        currentRound: prevRound,
        status: "LIVE",
      },
    });
  });

  return await getDraftSessionState(sessionId);
}

/**
 * Resets all picks and drafted statuses for a draft session.
 */
export async function resetDraftSession(sessionId: string) {
  return await prisma.$transaction(async (tx) => {
    // Delete all picks
    await tx.draftPick.deleteMany({
      where: { draftSessionId: sessionId },
    });

    // Reset player pool
    await tx.draftPlayerPool.updateMany({
      where: { draftSessionId: sessionId },
      data: {
        isDrafted: false,
        draftedTeamId: null,
        draftedPickId: null,
      },
    });

    // Reset protections
    await tx.coachPlayerProtection.updateMany({
      where: { draftSessionId: sessionId },
      data: { isClaimed: false },
    });

    // Reset session state
    const updated = await tx.draftSession.update({
      where: { id: sessionId },
      data: {
        currentPickIndex: 0,
        currentRound: 1,
        status: "PAIRED",
      },
    });

    return updated;
  });
}
