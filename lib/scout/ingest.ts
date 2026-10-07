import { classifyScoutMessage, type ScoutClassifyRuntime } from "@/lib/scout/classify";
import { planScoutMessage } from "@/lib/scout/plan";
import type { ParsedScoutMessage } from "@/lib/scout/parseGmail";
import type { ScoutIngestStore } from "@/lib/scout/store";

export type IngestResult =
  | { type: "duplicate" }
  | { type: "skipped"; reason: string }
  | { type: "created"; viaFallback: boolean }
  | { type: "appended"; reopened: boolean; viaFallback: boolean };

export async function ingestParsedMessage(
  store: ScoutIngestStore,
  mailbox: string,
  message: ParsedScoutMessage,
  runtime?: ScoutClassifyRuntime,
): Promise<IngestResult> {
  if (await store.hasMessage(message.gmailMessageId)) return { type: "duplicate" };

  const decision = await classifyScoutMessage(message, runtime);
  if (decision.action === "skip") return { type: "skipped", reason: decision.reason };

  const existing = await store.findTicket(mailbox, message.gmailThreadId);
  const plan = planScoutMessage(existing, mailbox, message);
  if (plan.type === "create") {
    const inserted = await store.insertTicket(plan);
    if (inserted === "created") return { type: "created", viaFallback: decision.viaFallback };
    if (await store.hasMessage(message.gmailMessageId)) return { type: "duplicate" };
    const raced = await store.findTicket(mailbox, message.gmailThreadId);
    if (!raced) return { type: "duplicate" };
    const appendPlan = planScoutMessage(raced, mailbox, message);
    if (appendPlan.type !== "append") return { type: "duplicate" };
    const appended = await store.appendTicket(appendPlan);
    if (appended === "duplicate") return { type: "duplicate" };
    return { type: "appended", reopened: appendPlan.reopened, viaFallback: decision.viaFallback };
  }

  const appended = await store.appendTicket(plan);
  if (appended === "duplicate") return { type: "duplicate" };
  return { type: "appended", reopened: plan.reopened, viaFallback: decision.viaFallback };
}
