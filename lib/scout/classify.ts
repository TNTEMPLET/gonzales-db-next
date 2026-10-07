import {
  callScoutAi,
  createScoutAiBudget,
  createScoutAiClassifierFromEnv,
  readScoutAiVerdict,
  rememberScoutAiVerdict,
  scoutAiFailureStopsCalls,
  scoutAiRequestFromMessage,
  scoutAiVerdictCache,
  SCOUT_AI_TIMEOUT_MS,
  type ScoutAiBudget,
  type ScoutAiClassifier,
  type ScoutAiRequest,
  type ScoutAiVerdict,
} from "@/lib/scout/aiClassify";
import { evaluateScoutCalendar } from "@/lib/scout/calendarRule";
import { evaluateScoutRequestText, type ScoutRequestKind } from "@/lib/scout/requestRules";
import { evaluateScoutSender, type ScoutHeader } from "@/lib/scout/senderRule";

export const SCOUT_SKIP_CALENDAR = "calendar";
export const SCOUT_SKIP_NOT_A_REQUEST = "not a request";
export const SCOUT_AI_UNAVAILABLE_FALLBACK = "ai_unavailable_fallback";
export const SCOUT_AI_CAP_FALLBACK = "ai_cap_fallback";

export type ScoutClassification = {
  action: "keep" | "skip";
  kind: ScoutRequestKind;
  /** Stable bucket for skip counts, or a short model reason when the message is kept. */
  reason: string;
  /** Rule or model detail. Not used as the skip-count key. */
  detail: string;
  viaFallback: boolean;
};

export type ScoutClassifiable = {
  gmailMessageId?: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  labelIds?: readonly string[];
  headers?: readonly ScoutHeader[];
  hasCalendarPart?: boolean;
};

export type ScoutClassifyRuntime = {
  ai: ScoutAiClassifier | null;
  cache: Map<string, ScoutAiVerdict>;
  budget: ScoutAiBudget;
  timeoutMs: number;
  /** Set after a timeout or HTTP failure so the rest of this sync does not wait on the model. */
  notedAiFailure: boolean;
  loggedAiFailure: boolean;
};

export function createScoutClassifyRuntime(options?: {
  ai?: ScoutAiClassifier | null;
  cache?: Map<string, ScoutAiVerdict>;
  budget?: ScoutAiBudget;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): ScoutClassifyRuntime {
  const ai =
    options && Object.prototype.hasOwnProperty.call(options, "ai")
      ? (options.ai ?? null)
      : createScoutAiClassifierFromEnv(options?.env, options?.fetchImpl);
  return {
    ai,
    cache: options?.cache ?? scoutAiVerdictCache(),
    budget: options?.budget ?? createScoutAiBudget(),
    timeoutMs: options?.timeoutMs ?? SCOUT_AI_TIMEOUT_MS,
    notedAiFailure: false,
    loggedAiFailure: false,
  };
}

function keywordFallback(message: ScoutClassifiable, reason: string): ScoutClassification {
  const window = scoutAiRequestFromMessage(message);
  const keyword = evaluateScoutRequestText(window.subject, window.snippet);
  return {
    action: keyword.keep ? "keep" : "skip",
    kind: keyword.kind,
    reason,
    detail: keyword.detail,
    viaFallback: true,
  };
}

function fromVerdict(verdict: ScoutAiVerdict): ScoutClassification {
  const keep = verdict.kind === "change_request" || verdict.kind === "report_request";
  const detail = verdict.reason || verdict.kind;
  return {
    action: keep ? "keep" : "skip",
    kind: keep ? verdict.kind : "other",
    reason: keep ? detail : SCOUT_SKIP_NOT_A_REQUEST,
    detail,
    viaFallback: false,
  };
}

async function classifyInner(
  message: ScoutClassifiable,
  runtime: ScoutClassifyRuntime,
): Promise<ScoutClassification> {
  const sender = evaluateScoutSender({
    fromEmail: message.fromEmail,
    labelIds: message.labelIds,
    headers: message.headers,
  });
  if (!sender.include) {
    return {
      action: "skip",
      kind: "other",
      reason: sender.reason,
      detail: sender.reason,
      viaFallback: false,
    };
  }

  const calendar = evaluateScoutCalendar({
    subject: message.subject,
    headers: message.headers,
    hasCalendarPart: message.hasCalendarPart,
  });
  if (calendar.skip) {
    return {
      action: "skip",
      kind: "other",
      reason: SCOUT_SKIP_CALENDAR,
      detail: calendar.detail,
      viaFallback: false,
    };
  }

  const cached = message.gmailMessageId ? readScoutAiVerdict(runtime.cache, message.gmailMessageId) : undefined;
  if (cached) return fromVerdict(cached);

  if (!runtime.ai || runtime.notedAiFailure) return keywordFallback(message, SCOUT_AI_UNAVAILABLE_FALLBACK);

  if (runtime.budget.used >= runtime.budget.cap) {
    return keywordFallback(message, SCOUT_AI_CAP_FALLBACK);
  }

  runtime.budget.used += 1;
  try {
    const request: ScoutAiRequest = scoutAiRequestFromMessage(message);
    const verdict = await callScoutAi(runtime.ai, request, runtime.timeoutMs);
    if (message.gmailMessageId) rememberScoutAiVerdict(runtime.cache, message.gmailMessageId, verdict);
    return fromVerdict(verdict);
  } catch (err) {
    noteAiFailure(runtime, err);
    return keywordFallback(message, SCOUT_AI_UNAVAILABLE_FALLBACK);
  }
}

function noteAiFailure(runtime: ScoutClassifyRuntime, err: unknown): void {
  if (scoutAiFailureStopsCalls(err)) runtime.notedAiFailure = true;
  if (runtime.loggedAiFailure) return;
  runtime.loggedAiFailure = true;
  console.error("[scout] ai unavailable; using keyword fallback");
}

/**
 * Stage 1: sender, list, automated, and calendar rules.
 * Stage 2: one model call on subject, snippet, and sender domain.
 * If the model is missing or fails, keyword rules decide and the sync still finishes.
 */
export async function classifyScoutMessage(
  message: ScoutClassifiable,
  runtime?: ScoutClassifyRuntime,
): Promise<ScoutClassification> {
  const active = runtime ?? createScoutClassifyRuntime();
  try {
    return await classifyInner(message, active);
  } catch (err) {
    console.error("[scout] classify failed", err instanceof Error ? err.name : "unknown");
    active.notedAiFailure = true;
    return keywordFallback(message, SCOUT_AI_UNAVAILABLE_FALLBACK);
  }
}
