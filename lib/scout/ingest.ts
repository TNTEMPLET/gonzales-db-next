import { planScoutMessage } from "@/lib/scout/plan";
import type { ParsedScoutMessage } from "@/lib/scout/parseGmail";
import { evaluateScoutSender } from "@/lib/scout/senderRule";
import type { ScoutIngestStore } from "@/lib/scout/store";

export type IngestResult =
  | { type: "duplicate" }
  | { type: "skipped"; reason: string }
  | { type: "created" }
  | { type: "appended"; reopened: boolean };

export async function ingestParsedMessage(
  store: ScoutIngestStore,
  mailbox: string,
  message: ParsedScoutMessage,
): Promise<IngestResult> {
  if (await store.hasMessage(message.gmailMessageId)) return { type: "duplicate" };

  const decision = evaluateScoutSender({
    fromEmail: message.fromEmail,
    labelIds: message.labelIds,
    headers: message.headers,
  });
  if (!decision.include) return { type: "skipped", reason: decision.reason };

  const existing = await store.findTicket(mailbox, message.gmailThreadId);
  const plan = planScoutMessage(existing, mailbox, message);
  if (plan.type === "create") {
    const inserted = await store.insertTicket(plan);
    if (inserted === "created") return { type: "created" };
    if (await store.hasMessage(message.gmailMessageId)) return { type: "duplicate" };
    const raced = await store.findTicket(mailbox, message.gmailThreadId);
    if (!raced) return { type: "duplicate" };
    const appendPlan = planScoutMessage(raced, mailbox, message);
    if (appendPlan.type !== "append") return { type: "duplicate" };
    const appended = await store.appendTicket(appendPlan);
    if (appended === "duplicate") return { type: "duplicate" };
    return { type: "appended", reopened: appendPlan.reopened };
  }

  const appended = await store.appendTicket(plan);
  if (appended === "duplicate") return { type: "duplicate" };
  return { type: "appended", reopened: plan.reopened };
}
