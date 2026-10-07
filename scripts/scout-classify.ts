/**
 * Read-only Scout classifier. No database.
 *
 *   pnpm scout:classify < messages.ndjson
 *
 * Each input line is JSON: {"subject","snippet","from","headers"}
 * Each output line is JSON: {"action":"keep"|"skip","kind","reason","detail"}
 *
 * Stage 1 skips calendar invites and the existing sender / list / automated rules.
 * Stage 2 calls the model when SCOUT_AI_API_KEY is set (SCOUT_AI_MODEL defaults to
 * gpt-4o-mini, SCOUT_AI_API_URL defaults to OpenAI chat completions).
 * Without a key, or when the call fails, keyword rules decide and reason is
 * ai_unavailable_fallback. The CLI allows 200 model calls per run; mailbox
 * sync allows 50.
 */
import { createInterface } from "readline";

import { classifyScoutCliLine, createScoutCliRuntime } from "../lib/scout/classifyCli";

function usage(): string {
  return `Usage: pnpm scout:classify < messages.ndjson

Each line: {"subject","snippet","from","headers"}
Prints: {"action":"keep"|"skip","kind","reason","detail"}

Set SCOUT_AI_API_KEY to classify with the model (200 calls per run).
Optional: SCOUT_AI_MODEL (default gpt-4o-mini), SCOUT_AI_API_URL.
Without that key, keyword rules decide. Read-only. No database.`;
}

async function main() {
  if (process.stdin.isTTY) {
    console.error(usage());
    process.exit(1);
  }
  const runtime = createScoutCliRuntime(process.env);
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const result = await classifyScoutCliLine(line, runtime);
    console.log(JSON.stringify(result));
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.name : "scout classify failed");
  process.exit(1);
});
