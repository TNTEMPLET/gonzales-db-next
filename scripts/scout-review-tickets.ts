/**
 * Dry-run Scout rules against tickets already stored. Read-only.
 *
 *   pnpm scout:review
 *
 * Prints one JSON line per ticket: id, action, kind, reason, detail, subject.
 * Does not update or delete anything. New mail uses the same rules at ingest;
 * this only lists what the current rules would have done.
 *
 * SCOUT_AI_API_KEY enables the model (up to 500 calls per run). Without it, keyword rules decide.
 */
import { PrismaClient } from "@prisma/client";

import { createDatabaseAdapter } from "../lib/databaseAdapter";
import { createScoutAiBudget } from "../lib/scout/aiClassify";
import { createScoutClassifyRuntime } from "../lib/scout/classify";
import { reviewStoredScoutTicket } from "../lib/scout/reviewTickets";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. This dry-run only reads Scout tickets.");
    process.exit(1);
  }

  console.error("Scout ticket review is read-only. No tickets will be changed.");
  const prisma = new PrismaClient({ adapter: createDatabaseAdapter(databaseUrl) });
  const runtime = createScoutClassifyRuntime({
    env: process.env,
    cache: new Map(),
    budget: createScoutAiBudget(500),
  });
  try {
    const tickets = await prisma.scoutTicket.findMany({
      select: { id: true, subject: true, snippet: true, senderEmail: true },
      orderBy: { lastMessageAt: "desc" },
    });
    let keep = 0;
    let skip = 0;
    for (const ticket of tickets) {
      const decision = await reviewStoredScoutTicket(ticket, runtime);
      if (decision.action === "keep") keep += 1;
      else skip += 1;
      console.log(
        JSON.stringify({
          id: decision.id,
          action: decision.action,
          kind: decision.kind,
          reason: decision.reason,
          detail: decision.detail,
          subject: ticket.subject,
        }),
      );
    }
    console.error(`Reviewed ${tickets.length}. Would keep ${keep}. Would skip ${skip}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Review failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]"));
  process.exit(1);
});
