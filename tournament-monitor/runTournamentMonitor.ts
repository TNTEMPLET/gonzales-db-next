import type { Prisma } from "@prisma/client";

import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { syncGameChangerToProject } from "@/lib/gamechanger/syncGameChangerToProject";
import prisma from "@/lib/prisma";
import { getSiteConfigForOrg, isBracketOrgId, type OrgId } from "@/lib/siteConfig";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { hashMonitorStatus, monitorHourBucket, publishTournamentMonitorEvent } from "@/lib/tournament-monitor/events";

export type RunTournamentMonitorResult = {
  runId: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  checkedCount: number;
  eventCount: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
};

type BracketProjectRow = {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  spec: unknown;
};

type HealthTarget = "site" | "live-api";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isLiveStatus(value: string | undefined) {
  const status = value?.toLowerCase() ?? "";
  return status === "in_progress" || status === "live" || status === "underway";
}

function scoreLabel(event: { home_team: { score?: number; name: string }; away_team: { score?: number; name: string } }) {
  return `${event.away_team.name} ${event.away_team.score ?? 0} at ${event.home_team.name} ${event.home_team.score ?? 0}`;
}

function projectUrl(row: BracketProjectRow, path = "") {
  const config = isBracketOrgId(row.organizationId) ? getSiteConfigForOrg(row.organizationId as OrgId) : getSiteConfigForOrg("master");
  return `${config.siteUrl}${path}`;
}

async function healthCheck(url: string) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    return { ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch (error: unknown) {
    return { ok: false, status: 0, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function lastSiteEventForTarget(bracketProjectId: string, target: HealthTarget) {
  const rows = await prisma.tournamentMonitorEvent.findMany({
    where: { bracketProjectId, type: { in: ["SITE_DOWN", "SITE_RECOVERED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.find((row) => {
    const payload = row.payload as { target?: unknown } | null;
    return payload?.target === target;
  });
}

async function publishHealthEvent(options: {
  runId: string;
  row: BracketProjectRow;
  target: HealthTarget;
  url: string;
  check: Awaited<ReturnType<typeof healthCheck>>;
}) {
  const { runId, row, target, url, check } = options;
  const payload = toPrismaJson({ target, url, check });
  const last = await lastSiteEventForTarget(row.id, target);
  if (!check.ok) {
    return publishTournamentMonitorEvent({
      runId,
      type: "SITE_DOWN",
      organizationId: row.organizationId,
      bracketProjectId: row.id,
      eventKey: `SITE_DOWN:${row.id}:${target}:${monitorHourBucket()}`,
      statusHash: hashMonitorStatus({ target, status: check.status, error: check.error ?? null }),
      title: `Tournament site issue: ${row.name}`,
      message: `${row.name} ${target === "site" ? "public site" : "live score feed"} is not responding correctly.
URL: ${url}
Status: ${check.status || "request failed"}${check.error ? `
Error: ${check.error}` : ""}`,
      payload,
    });
  }
  if (last?.type === "SITE_DOWN") {
    return publishTournamentMonitorEvent({
      runId,
      type: "SITE_RECOVERED",
      organizationId: row.organizationId,
      bracketProjectId: row.id,
      eventKey: `SITE_RECOVERED:${row.id}:${target}:${last.id}`,
      statusHash: hashMonitorStatus({ target, status: check.status }),
      title: `Tournament site recovered: ${row.name}`,
      message: `${row.name} ${target === "site" ? "public site" : "live score feed"} is responding again.
URL: ${url}
Status: ${check.status}
Response time: ${check.ms}ms`,
      payload,
    });
  }
  return { created: false, event: null };
}

async function loadMonitorProjects() {
  return prisma.bracketProject.findMany({
    where: { status: "READY" },
    orderBy: [{ organizationId: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
    select: { id: true, organizationId: true, seasonYear: true, name: true, spec: true },
  });
}

function accumulate(result: RunTournamentMonitorResult, published: { created: boolean; sendResult?: { emailSentCount: number; smsSentCount: number; failedCount: number } }) {
  if (!published.created) return;
  result.eventCount += 1;
  result.sentCount += (published.sendResult?.emailSentCount ?? 0) + (published.sendResult?.smsSentCount ?? 0);
  result.failedCount += published.sendResult?.failedCount ?? 0;
}

export async function runTournamentMonitor(): Promise<RunTournamentMonitorResult> {
  const run = await prisma.tournamentMonitorRun.create({ data: { status: "RUNNING" } });
  const result: RunTournamentMonitorResult = { runId: run.id, status: "COMPLETED", checkedCount: 0, eventCount: 0, sentCount: 0, failedCount: 0, errors: [] };

  try {
    const rows = await loadMonitorProjects();
    for (const row of rows) {
      const parsed = safeParseBracketSpec(row.spec);
      if (!parsed.ok) continue;
      const gc = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
      if (!gc.success) continue;
      result.checkedCount += 1;

      const siteUrl = projectUrl(row, "/tournaments");
      const liveUrl = projectUrl(row, `/api/tournaments/${row.id}/gamechanger-live`);
      accumulate(result, await publishHealthEvent({ runId: run.id, row, target: "site", url: siteUrl, check: await healthCheck(siteUrl) }));
      accumulate(result, await publishHealthEvent({ runId: run.id, row, target: "live-api", url: liveUrl, check: await healthCheck(liveUrl) }));

      try {
        const sync = await syncGameChangerToProject(parsed.spec, { autoImport: true });
        if (sync.specUpdated) {
          await prisma.bracketProject.update({ where: { id: row.id }, data: { spec: JSON.parse(JSON.stringify(sync.spec)) } });
        }

        if (sync.live.hasLiveGames) {
          const liveRows = Object.entries(sync.live.eventsByMatchId).filter(([, event]) => isLiveStatus(event.game_status));
          const summary = liveRows.map(([matchId, event]) => `${matchId}: ${scoreLabel(event)}`).join("\n") || "GameChanger reports live games.";
          accumulate(result, await publishTournamentMonitorEvent({
            runId: run.id,
            type: "LIVE_HEARTBEAT",
            organizationId: row.organizationId,
            bracketProjectId: row.id,
            eventKey: `LIVE_HEARTBEAT:${row.id}:${monitorHourBucket()}`,
            title: `Live tournament heartbeat: ${row.name}`,
            message: `${row.name} has ${liveRows.length || "one or more"} live GameChanger game${liveRows.length === 1 ? "" : "s"}.\n${summary}`,
            payload: toPrismaJson({ organizationName: sync.live.organizationName, games: liveRows.map(([matchId, event]) => ({ matchId, eventId: event.id, status: event.game_status, score: scoreLabel(event) })) }),
          }));
          for (const [matchId, event] of liveRows) {
            accumulate(result, await publishTournamentMonitorEvent({
              runId: run.id,
              type: "GAME_LIVE",
              organizationId: row.organizationId,
              bracketProjectId: row.id,
              matchId,
              eventKey: `GAME_LIVE:${row.id}:${matchId}:${event.id}`,
              title: `Game is live: ${row.name}`,
              message: `${row.name} ${matchId} is live in GameChanger.
${scoreLabel(event)}`,
              payload: toPrismaJson({ eventId: event.id, status: event.game_status, score: scoreLabel(event) }),
            }));
          }
        }

        for (const matchId of sync.live.importedMatchIds ?? []) {
          const event = sync.live.eventsByMatchId[matchId];
          if (!event) continue;
          accumulate(result, await publishTournamentMonitorEvent({
            runId: run.id,
            type: "GAME_FINAL",
            organizationId: row.organizationId,
            bracketProjectId: row.id,
            matchId,
            eventKey: `GAME_FINAL:${row.id}:${matchId}:${event.id}`,
            title: `Final score imported: ${row.name}`,
            message: `${row.name} ${matchId} is final and was imported.
${scoreLabel(event)}`,
            payload: toPrismaJson({ eventId: event.id, status: event.game_status, score: scoreLabel(event) }),
          }));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${row.name}: ${message}`);
        result.failedCount += 1;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    result.failedCount += 1;
  }

  result.status = result.errors.length > 0 || result.failedCount > 0 ? (result.eventCount > 0 || result.checkedCount > 0 ? "PARTIAL" : "FAILED") : "COMPLETED";
  await prisma.tournamentMonitorRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      checkedCount: result.checkedCount,
      eventCount: result.eventCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      errorMessage: result.errors[0],
      results: toPrismaJson(result),
      completedAt: new Date(),
    },
  });
  return result;
}
