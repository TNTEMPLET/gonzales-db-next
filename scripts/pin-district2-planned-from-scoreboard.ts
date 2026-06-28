/**
 * Match planned (or FAILED LIVE) bracket games to GameChanger scoreboard events and pin them.
 * Avoids duplicate LIVE runs when writer saved games but eventId lookup failed.
 */
import prisma from "../lib/prisma";
import { fetchGameChangerScoreboard, scoreboardDayStartIso } from "../lib/gamechanger/fetchScoreboard";
import { findUnlockedScheduleManagerGames } from "../lib/gamechanger/schedule-manager/decisionEngine";
import { normalizeTeamNameForMatch } from "../lib/gamechanger/matchEventsToBracket";
import { bracketGameChangerSchema } from "../lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "../lib/tournament-brackets/bracketSpec";

const BRACKET_IDS = (process.env.BRACKET_IDS?.trim() ||
  "cmqiazafz000004lef08ell73,cmqij4xh0000004l2wp2nvto9,cmqh68wqv000004l7f0c0p3rc")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const DRY_RUN = process.env.DRY_RUN !== "0";

function teamsMatch(home: string, away: string, eventHome: string, eventAway: string): boolean {
  const bh = normalizeTeamNameForMatch(home);
  const ba = normalizeTeamNameForMatch(away);
  const eh = normalizeTeamNameForMatch(eventHome);
  const ea = normalizeTeamNameForMatch(eventAway);
  const direct = bh === eh && ba === ea;
  const flipped = bh === ea && ba === eh;
  if (direct || flipped) return true;
  // GC team names often include division prefix (e.g. "11U Eastbank").
  const contains = (needle: string, hay: string) =>
    needle.length > 0 && (hay.includes(needle) || needle.includes(hay));
  return (
    (contains(bh, eh) && contains(ba, ea)) || (contains(bh, ea) && contains(ba, eh))
  );
}

function startWithinWindow(targetIso: string | undefined, eventIso: string, windowMs = 24 * 60 * 60 * 1000): boolean {
  if (!targetIso) return true;
  const delta = Math.abs(new Date(targetIso).getTime() - new Date(eventIso).getTime());
  return delta <= windowMs;
}

async function main(): Promise<void> {
  console.log(`=== Pin planned games from scoreboard (dryRun=${DRY_RUN}) ===`);

  for (const bracketProjectId of BRACKET_IDS) {
    const row = await prisma.bracketProject.findUnique({
      where: { id: bracketProjectId },
      select: { id: true, name: true, seasonYear: true, spec: true },
    });
    if (!row) continue;

    const parsed = safeParseBracketSpec(row.spec);
    if (!parsed.ok || !parsed.spec.gameChanger?.widgetId) continue;

    const gc = bracketGameChangerSchema.parse(parsed.spec.gameChanger);
    const pins = { ...(gc.matchEventPins ?? {}) };

    const failedActions = await prisma.scheduleManagerAction.findMany({
      where: { bracketProjectId, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
    });

    const decision = findUnlockedScheduleManagerGames({
      bracketProjectId: row.id,
      seasonYear: row.seasonYear,
      spec: parsed.spec,
    });

    const targets = decision.planned.length > 0
      ? decision.planned.map((game) => ({
          matchId: game.matchId,
          gameNumber: game.gameNumber,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          scheduledFor: game.scheduledFor?.toISOString(),
        }))
      : failedActions.map((action) => ({
          matchId: action.matchId,
          gameNumber: action.gameNumber ?? "?",
          homeTeam: action.homeTeam ?? "",
          awayTeam: action.awayTeam ?? "",
          scheduledFor: action.scheduledFor?.toISOString(),
        }));

    if (targets.length === 0) {
      console.log(`\n${row.name}: nothing to pin`);
      continue;
    }

    const scoreboard = await fetchGameChangerScoreboard(gc.widgetId, scoreboardDayStartIso());
    const events = scoreboard.data.events ?? [];

    console.log(`\n--- ${row.name} (${targets.length} targets, ${events.length} scoreboard events) ---`);

    let spec = parsed.spec;
    for (const target of targets) {
      if (pins[target.matchId]) {
        console.log(`  G${target.gameNumber}: already pinned`);
        continue;
      }

      const candidates = events.filter(
        (event) =>
          teamsMatch(target.homeTeam, target.awayTeam, event.home_team.name, event.away_team.name) &&
          startWithinWindow(target.scheduledFor, event.start_ts),
      );

      if (candidates.length === 0) {
        console.log(
          `  G${target.gameNumber}: NO MATCH ${target.homeTeam} vs ${target.awayTeam} @ ${target.scheduledFor ?? "?"}`,
        );
        continue;
      }

      if (candidates.length > 1) {
        console.log(
          `  G${target.gameNumber}: ${candidates.length} candidates — using latest (${candidates.map((c) => c.id.slice(0, 8)).join(", ")})`,
        );
      }

      const event = candidates[candidates.length - 1]!;
      console.log(
        `  G${target.gameNumber}: PIN ${event.id} ${event.home_team.name} vs ${event.away_team.name} @ ${event.start_ts}`,
      );

      if (!DRY_RUN) {
        pins[target.matchId] = event.id;
        spec = mergeBracketSpec(spec, {
          gameChanger: {
            ...gc,
            matchEventPins: pins,
          },
        });
        await prisma.scheduleManagerAction.updateMany({
          where: { bracketProjectId, matchId: target.matchId },
          data: {
            status: "CREATED",
            gameChangerEventId: event.id,
            errorMessage: null,
          },
        });
      }
    }

    if (!DRY_RUN) {
      await prisma.bracketProject.update({
        where: { id: bracketProjectId },
        data: { spec: JSON.parse(JSON.stringify(spec)) },
      });
      console.log(`  saved pins: ${Object.keys(pins).length}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
