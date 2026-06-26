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

function warningsFromBody(body: { warnings?: unknown; warning?: unknown; error?: unknown }) {
  const warnings: string[] = [];
  if (Array.isArray(body.warnings)) warnings.push(...body.warnings.filter((item): item is string => typeof item === "string"));
  if (typeof body.warning === "string") warnings.push(body.warning);
  return warnings;
}

function isLocationFieldError(message: string) {
  return /location|field|venue/i.test(message);
}

async function postCreateGame(endpoint: string, requestSummary: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "createGame", game: requestSummary }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    eventId?: unknown;
    error?: unknown;
    warning?: unknown;
    warnings?: unknown;
    [key: string]: unknown;
  };
  return { response, body };
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

      let { response, body } = await postCreateGame(endpoint, requestSummary);
      const warnings = warningsFromBody(body);
      if (!response.ok) {
        const message = typeof body.error === "string" ? body.error : `GameChanger writer failed (${response.status})`;
        const eventIdFromError = typeof body.eventId === "string" ? body.eventId : undefined;
        if (eventIdFromError && isLocationFieldError(message)) {
          warnings.push(`Game was created, but GameChanger rejected location/field details: ${message}`);
          return {
            eventId: eventIdFromError,
            dryRun: false,
            requestSummary,
            responseSummary: { status: response.status, eventId: eventIdFromError, warning: message },
            warnings,
          };
        }

        if (isLocationFieldError(message) && (requestSummary.field || requestSummary.venue)) {
          const retrySummary = { ...requestSummary, field: undefined, venue: requestSummary.venue ?? undefined };
          const retry = await postCreateGame(endpoint, retrySummary);
          response = retry.response;
          body = retry.body;
          warnings.push(`Retried without field/location details after GameChanger rejected them: ${message}`);
          if (!response.ok) {
            throw new Error(typeof body.error === "string" ? body.error : `GameChanger writer failed (${response.status})`);
          }
        } else {
          throw new Error(message);
        }
      }
      const eventId = typeof body.eventId === "string" ? body.eventId : undefined;
      if (!eventId) {
        throw new Error("GameChanger writer did not return an eventId.");
      }
      warnings.push(...warningsFromBody(body));
      return {
        eventId,
        dryRun: false,
        requestSummary,
        responseSummary: {
          status: response.status,
          eventId,
          ...(warnings.length > 0 ? { warnings } : {}),
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    },
  };
}

export function createGameChangerScheduleWriter(mode: ScheduleManagerRunMode): GameChangerScheduleWriter {
  if (mode === "LIVE") return createVaultBackedGameChangerWriter();
  return createDryRunGameChangerWriter();
}
