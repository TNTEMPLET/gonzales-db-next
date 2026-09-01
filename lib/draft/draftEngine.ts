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
 * Inverse of calculateTeamOnClock: given a specific team (by its position in
 * draftOrder) and round, returns the overallPick (1-based) for that exact
 * slot. Needed once picks can be made out of strict sequence (skip, drag to
 * an arbitrary slot, pre-claiming protections in future rounds) -- the slot
 * a pick belongs to is a pure function of (team, round), independent of
 * when/in-what-order it was actually made.
 */
export function computeOverallPickForSlot(
  numTeams: number,
  round: number,
  teamIndex: number,
  draftType: DraftType,
): number {
  let pickInRound0Index = teamIndex;
  if (draftType === DraftType.SNAKE && round % 2 === 0) {
    pickInRound0Index = numTeams - 1 - teamIndex;
  }
  const pickIndex = (round - 1) * numTeams + pickInRound0Index;
  return pickIndex + 1;
}

/**
 * Fetches current state of a draft session including who is on the clock.
 *
 * `session.currentPickIndex` is a cursor that only ever moves forward via an
 * explicit action (a pick made at the cursor, or a skip) -- filling a
 * *different* slot (a backfilled skip, a drag onto a future round, a
 * pre-claimed protection) never touches it. So "who's actually on the
 * clock" is derived here, not read directly off the cursor: scan forward
 * from the stored cursor past any slot that already has a pick, stopping at
 * the first genuinely open one. This one rule covers plain sequential
 * drafting (the very next slot is open, same as before), a pre-claimed
 * protection sitting exactly on the cursor, and a run of several
 * pre-claimed future rounds all at once -- without special-casing any of
 * them.
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

  const numTeams = session.teams.length;
  const totalPossiblePicks = numTeams * session.totalRounds;
  const filledIndices = new Set(session.picks.map((p) => p.overallPick - 1));

  let displayPickIndex = session.currentPickIndex;
  while (displayPickIndex < totalPossiblePicks && filledIndices.has(displayPickIndex)) {
    displayPickIndex++;
  }

  const { teamIndex, round, pickInRound } = calculateTeamOnClock(
    session.teams,
    displayPickIndex,
    session.draftType
  );

  const activeTeam = displayPickIndex < totalPossiblePicks ? session.teams[teamIndex] : undefined;

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
          overallPick: displayPickIndex + 1,
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
 * Executes a pick for a specific (team, round) slot -- the one real
 * pick-creation path. Used directly for drag-and-drop (an arbitrary open
 * cell) and pre-claiming protections (future rounds, before the live
 * sequence reaches them), and indirectly by makeDraftPick (today's "pick
 * for whoever's on the clock" behavior, unchanged for existing callers).
 * Only advances the session's cursor when the filled slot IS the current
 * cursor position -- filling any other open slot never moves it.
 */
export async function makeDraftPickForSlot(
  sessionId: string,
  target: { draftTeamId: string; round: number; playerPoolId: string },
  adminUserId?: string
) {
  const session = await prisma.draftSession.findUnique({
    where: { id: sessionId },
    include: {
      teams: { orderBy: { draftOrder: "asc" } },
      picks: true,
      playerPool: true,
      protections: true,
    },
  });
  if (!session) {
    throw new Error(`DraftSession not found: ${sessionId}`);
  }
  if (session.status !== "LIVE") {
    throw new Error("Draft is not live");
  }

  const { draftTeamId, round, playerPoolId } = target;
  if (round < 1 || round > session.totalRounds) {
    throw new Error(`Round ${round} is out of range (1-${session.totalRounds})`);
  }

  const teamIndex = session.teams.findIndex((t) => t.id === draftTeamId);
  if (teamIndex === -1) {
    throw new Error("Team not found in this draft session");
  }

  const numTeams = session.teams.length;
  const overallPick = computeOverallPickForSlot(numTeams, round, teamIndex, session.draftType);

  const existingPickAtSlot = session.picks.find((p) => p.overallPick === overallPick);
  if (existingPickAtSlot) {
    throw new Error("That pick slot is already filled");
  }

  const player = session.playerPool.find((p) => p.id === playerPoolId);
  if (!player) {
    throw new Error("Player not found in draft pool");
  }
  if (player.isDrafted) {
    throw new Error("Player has already been drafted");
  }

  const protection = session.protections.find(
    (p) => p.draftTeamId === draftTeamId && p.protectedRound === round && !p.isClaimed && !p.isOverridden
  );

  const filledPickIndex = overallPick - 1;
  const isAtCursor = filledPickIndex === session.currentPickIndex;

  await prisma.$transaction(async (tx) => {
    const pick = await tx.draftPick.create({
      data: {
        draftSessionId: sessionId,
        round,
        overallPick,
        draftTeamId,
        playerPoolId: player.id,
        isProtectedPick: !!protection,
        pickedByAdminId: adminUserId,
        advancedCursor: isAtCursor,
      },
    });

    await tx.draftPlayerPool.update({
      where: { id: player.id },
      data: {
        isDrafted: true,
        draftedTeamId: draftTeamId,
        draftedPickId: pick.id,
      },
    });

    if (protection) {
      await tx.coachPlayerProtection.updateMany({
        where: { draftSessionId: sessionId, draftTeamId, protectedRound: round },
        data: { isClaimed: true },
      });
    }

    // The pool can run out before every slot is filled (fewer registered
    // players than teams*rounds) -- end the draft the moment that happens,
    // regardless of whether unfilled slots remain, same as before this
    // rewrite. This is checked independent of cursor movement below, since
    // a backfilled/pre-claimed pick (not at the cursor) can just as easily
    // be the one that empties the pool.
    const remainingPlayers = session.playerPool.filter((p) => !p.isDrafted && p.id !== player.id);
    const poolExhausted = remainingPlayers.length === 0;

    if (isAtCursor || poolExhausted) {
      const totalPossiblePicks = numTeams * session.totalRounds;
      const filledIndices = new Set([...session.picks.map((p) => p.overallPick - 1), filledPickIndex]);
      let next = session.currentPickIndex;
      if (isAtCursor) {
        next = filledPickIndex + 1;
        while (next < totalPossiblePicks && filledIndices.has(next)) next++;
      }
      const isFinished = poolExhausted || next >= totalPossiblePicks;
      const nextRound = Math.floor(Math.min(next, totalPossiblePicks - 1) / numTeams) + 1;

      await tx.draftSession.update({
        where: { id: sessionId },
        data: {
          ...(isAtCursor ? { currentPickIndex: next, currentRound: nextRound } : {}),
          status: isFinished ? "COMPLETED" : "LIVE",
        },
      });
    }
  });

  return await getDraftSessionState(sessionId);
}

/**
 * Executes a pick in the draft session for whoever is currently on the
 * clock. Kept as a thin wrapper over makeDraftPickForSlot so every existing
 * caller (this admin route, Coach Corner's pick route) keeps its exact
 * signature and behavior -- neither ever targets an arbitrary slot.
 */
export async function makeDraftPick(
  sessionId: string,
  playerPoolId: string,
  adminUserId?: string
) {
  const { onClock } = await getDraftSessionState(sessionId);
  if (!onClock) {
    throw new Error("No team currently on the clock");
  }
  return makeDraftPickForSlot(
    sessionId,
    { draftTeamId: onClock.teamId, round: onClock.round, playerPoolId },
    adminUserId
  );
}

/**
 * Skips the current on-the-clock pick without recording anything -- the
 * clock advances immediately, and the skipped slot stays open (identical to
 * any other open cell) to be filled later, out of order, via
 * makeDraftPickForSlot (drag-and-drop). There is deliberately no "undo a
 * skip": nothing was recorded, so there's nothing to reverse -- filling the
 * still-open slot whenever ready achieves the same result.
 */
export async function skipCurrentPick(sessionId: string) {
  const { session, onClock } = await getDraftSessionState(sessionId);
  if (session.status !== "LIVE") {
    throw new Error("Draft is not live");
  }
  if (!onClock) {
    throw new Error("No team currently on the clock");
  }

  const numTeams = session.teams.length;
  const totalPossiblePicks = numTeams * session.totalRounds;
  const filledIndices = new Set(session.picks.map((p) => p.overallPick - 1));

  let next = onClock.overallPick; // one past the skipped slot (overallPick is 1-based)
  while (next < totalPossiblePicks && filledIndices.has(next)) next++;
  const isFinished = next >= totalPossiblePicks;
  const nextRound = isFinished ? session.totalRounds : Math.floor(next / numTeams) + 1;

  await prisma.draftSession.update({
    where: { id: sessionId },
    data: {
      currentPickIndex: next,
      currentRound: nextRound,
      status: isFinished ? "COMPLETED" : "LIVE",
    },
  });

  return await getDraftSessionState(sessionId);
}

/**
 * Converts every unclaimed, non-overridden coach-child/returning-player
 * protection directly into a real pick in its own round, immediately --
 * rather than waiting for the live sequence to reach each round one at a
 * time. Meant to run once, right when a session transitions into LIVE
 * (see the status PATCH route). Naturally idempotent (already-claimed
 * protections are skipped), so it's safe to call on every PAIRED->LIVE and
 * PAUSED->LIVE ("Resume") transition without double-processing.
 */
export async function preClaimAllProtections(sessionId: string) {
  const { session: initialSession } = await getDraftSessionState(sessionId);
  const eligible = initialSession.protections.filter((p) => !p.isClaimed && !p.isOverridden);

  for (const protection of eligible) {
    // Re-fetch fresh state each iteration -- an earlier iteration in this
    // same loop may have just filled a slot or claimed the matching pool
    // player.
    const { session } = await getDraftSessionState(sessionId);
    const team = session.teams.find((t) => t.id === protection.draftTeamId);
    if (!team) continue;
    if (protection.protectedRound < 1 || protection.protectedRound > session.totalRounds) continue;

    const teamIndex = session.teams.findIndex((t) => t.id === team.id);
    const overallPick = computeOverallPickForSlot(
      session.teams.length,
      protection.protectedRound,
      teamIndex,
      session.draftType
    );
    const alreadyFilled = session.picks.some((p) => p.overallPick === overallPick);
    if (alreadyFilled) continue;

    const matchingPoolPlayer = session.playerPool.find(
      (p) => !p.isDrafted && p.fullName.trim().toLowerCase() === protection.playerName.trim().toLowerCase()
    );
    if (!matchingPoolPlayer) continue; // no matching pool player -- leave open for a human

    await makeDraftPickForSlot(
      sessionId,
      { draftTeamId: protection.draftTeamId, round: protection.protectedRound, playerPoolId: matchingPoolPlayer.id },
      undefined
    );
  }
}

/**
 * Auto-executes every consecutive pick that doesn't need a human, starting
 * from whoever is currently on the clock: a protected pick (coach-linked
 * child or returning player) first, then -- if the on-clock team has opted
 * into auto-draft (DraftTeam.autoDraftEnabled, set via the "Schedule &
 * Invite" flow for a coach who can't attend live) -- the best remaining
 * player by evaluation score. So an admin never has to click "Auto-Lock",
 * and an absent auto-draft coach's team keeps moving instead of stalling
 * the whole draft. Stops at the first pick that genuinely needs a human:
 * draft isn't LIVE, nobody's on the clock, or the on-clock team is neither
 * protected for this round nor auto-draft-enabled.
 */
export async function resolveAutoPicks(sessionId: string) {
  // Bounded to one full pass over every team/round combination so a data bug
  // can't spin this into an infinite loop.
  const { session: initialSession } = await getDraftSessionState(sessionId);
  const maxIterations = Math.max(initialSession.teams.length, 1) * Math.max(initialSession.totalRounds, 1);

  for (let i = 0; i < maxIterations; i++) {
    const { session, onClock } = await getDraftSessionState(sessionId);
    if (session.status !== "LIVE") break;
    if (!onClock) break;

    if (onClock.isProtectedPick && onClock.protectedPlayerPoolId) {
      await makeDraftPick(sessionId, onClock.protectedPlayerPoolId);
      continue;
    }
    if (onClock.isProtectedPick) break; // protected but unresolved -- needs a human

    const onClockTeam = session.teams.find((t) => t.id === onClock.teamId);
    if (!onClockTeam?.autoDraftEnabled) break;

    const bestAvailable = session.playerPool
      .filter((p) => !p.isDrafted)
      .sort((a, b) => (b.evaluationScore ?? 0) - (a.evaluationScore ?? 0))[0];
    if (!bestAvailable) break;

    await makeDraftPick(sessionId, bestAvailable.id);
  }
}

/**
 * Undoes the most recently made pick, by actual creation time (pickedAt) --
 * not by overallPick position, since picks can now exist out of order
 * (pre-claimed protections in future rounds, drag-filled backfills). Only
 * rewinds the session's cursor if the undone pick actually advanced it when
 * it was created (`advancedCursor`) -- comparing the pick's slot to the
 * *current* cursor value isn't reliable on its own, since a cursor-advancing
 * pick can jump the cursor forward past several already-filled slots in one
 * step, making its own slot look identical to an old, unrelated backfill's.
 * Undoing an old backfill leaves the cursor untouched. For the everyday
 * all-sequential case this is identical to before, since every pick is a
 * cursor advance when nothing's ever been skipped or backfilled.
 */
export async function undoLastDraftPick(sessionId: string) {
  const session = await prisma.draftSession.findUnique({
    where: { id: sessionId },
    include: {
      picks: {
        orderBy: { pickedAt: "desc" },
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

    const undonePickIndex = lastPick.overallPick - 1;
    const prevRound = Math.floor(undonePickIndex / (session.teams.length || 1)) + 1;

    await tx.draftSession.update({
      where: { id: sessionId },
      data: {
        status: "LIVE",
        ...(lastPick.advancedCursor
          ? { currentPickIndex: undonePickIndex, currentRound: prevRound }
          : {}),
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
