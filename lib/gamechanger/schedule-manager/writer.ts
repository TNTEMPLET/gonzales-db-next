import type {
  GameChangerCreateGameInput,
  GameChangerCreateGameResult,
  ScheduleManagerRunMode,
} from "@/lib/gamechanger/schedule-manager/types";

export type GameChangerScheduleWriter = {
  createGame(input: GameChangerCreateGameInput): Promise<GameChangerCreateGameResult>;
};

function summarizeCreateGameRequest(input: GameChangerCreateGameInput): Record<string, unknown> {
  return {
    bracketProjectId: input.bracketProjectId,
    matchId: input.matchId,
    gameNumber: input.gameNumber,
    division: input.division,
    date: input.date,
    time: input.time,
    scheduledFor: input.scheduledFor?.toISOString(),
    venue: input.venue,
    field: input.field,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    widgetId: input.widgetId,
    gcOrganizationId: input.gcOrganizationId,
    gcFormDate: input.gcFormDate,
    gcFormTime: input.gcFormTime,
    durationLabel: input.durationLabel,
  };
}

export function createDryRunGameChangerWriter(): GameChangerScheduleWriter {
  return {
    async createGame(input) {
      const requestSummary = summarizeCreateGameRequest(input);
      return {
        dryRun: true,
        requestSummary,
        responseSummary: {
          status: "dry_run",
          message: "No GameChanger game was created.",
        },
      };
    },
  };
}

export function createVaultBackedGameChangerWriter(): GameChangerScheduleWriter {
  const enabled = process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED === "true";
  const endpoint = process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim();

  return {
    async createGame(input) {
      const requestSummary = summarizeCreateGameRequest(input);
      if (!enabled || !endpoint) {
        throw new Error(
          "Live GameChanger creation is not enabled. Configure the vault-backed writer endpoint through the approved Griphook workflow before using live mode.",
        );
      }

      const writerSecret = process.env.GAMECHANGER_SCHEDULE_WRITER_SECRET?.trim();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (writerSecret) {
        headers.Authorization = `Bearer ${writerSecret}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "createGame", game: requestSummary }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        eventId?: unknown;
        error?: unknown;
        [key: string]: unknown;
      };
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `GameChanger writer failed (${response.status})`);
      }
      const eventId = typeof body.eventId === "string" ? body.eventId : undefined;
      if (!eventId) {
        throw new Error("GameChanger writer did not return an eventId.");
      }
      return {
        eventId,
        dryRun: false,
        requestSummary,
        responseSummary: {
          status: response.status,
          eventId,
        },
      };
    },
  };
}

export function createGameChangerScheduleWriter(mode: ScheduleManagerRunMode): GameChangerScheduleWriter {
  if (mode === "LIVE") return createVaultBackedGameChangerWriter();
  return createDryRunGameChangerWriter();
}
