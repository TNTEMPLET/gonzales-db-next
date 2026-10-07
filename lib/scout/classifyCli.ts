import { createScoutAiBudget } from "@/lib/scout/aiClassify";
import { classifyScoutMessage, createScoutClassifyRuntime, type ScoutClassifyRuntime } from "@/lib/scout/classify";
import { parseMailboxAddress } from "@/lib/scout/parseGmail";
import type { ScoutHeader } from "@/lib/scout/senderRule";

export type ScoutClassifyCliOutput = {
  action: "keep" | "skip";
  kind: string;
  reason: string;
  detail: string;
};

function headersFrom(value: unknown): ScoutHeader[] {
  if (Array.isArray(value)) {
    const headers: ScoutHeader[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { name?: unknown; value?: unknown };
      if (typeof record.name !== "string" || typeof record.value !== "string") continue;
      headers.push({ name: record.name, value: record.value });
    }
    return headers;
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([name, headerValue]) => {
      if (typeof headerValue !== "string") return [];
      return [{ name, value: headerValue }];
    });
  }
  return [];
}

/**
 * One stdin record: { subject, snippet, from, headers }.
 * Same two-stage pipeline as mailbox sync. No database.
 */
export async function classifyScoutCliRecord(
  record: unknown,
  runtime?: ScoutClassifyRuntime,
): Promise<ScoutClassifyCliOutput> {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { action: "skip", kind: "other", reason: "invalid input", detail: "expected an object" };
  }
  const row = record as {
    subject?: unknown;
    snippet?: unknown;
    from?: unknown;
    headers?: unknown;
    id?: unknown;
    hasCalendarPart?: unknown;
  };
  const fromRaw = typeof row.from === "string" ? row.from : "";
  const parsedFrom = parseMailboxAddress(fromRaw);
  const decision = await classifyScoutMessage(
    {
      gmailMessageId: typeof row.id === "string" ? row.id : undefined,
      fromEmail: parsedFrom.email,
      subject: typeof row.subject === "string" ? row.subject : "",
      snippet: typeof row.snippet === "string" ? row.snippet : "",
      headers: headersFrom(row.headers),
      hasCalendarPart: row.hasCalendarPart === true,
    },
    runtime,
  );
  return {
    action: decision.action,
    kind: decision.kind,
    reason: decision.reason,
    detail: decision.detail,
  };
}

/** Manual preview cap. Mailbox sync stays at the smaller per-run cap. */
export const SCOUT_CLI_AI_CALL_CAP = 200;

export function createScoutCliRuntime(env: NodeJS.ProcessEnv = process.env): ScoutClassifyRuntime {
  return createScoutClassifyRuntime({
    env,
    cache: new Map(),
    budget: createScoutAiBudget(SCOUT_CLI_AI_CALL_CAP),
  });
}

export async function classifyScoutCliLine(
  line: string,
  runtime?: ScoutClassifyRuntime,
): Promise<ScoutClassifyCliOutput> {
  const trimmed = line.trim();
  if (!trimmed) {
    return { action: "skip", kind: "other", reason: "invalid input", detail: "empty" };
  }
  try {
    return await classifyScoutCliRecord(JSON.parse(trimmed) as unknown, runtime);
  } catch {
    return { action: "skip", kind: "other", reason: "invalid input", detail: "json" };
  }
}
