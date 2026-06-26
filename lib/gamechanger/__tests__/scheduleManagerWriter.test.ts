import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createVaultBackedGameChangerWriter } from "@/lib/gamechanger/schedule-manager/writer";

describe("GameChanger schedule writer", () => {
  it("retries without field details when GameChanger rejects location input", async () => {
    const previousFetch = globalThis.fetch;
    const previousEnv = { ...process.env };
    const requests: unknown[] = [];
    process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED = "true";
    process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT = "https://writer.example.test/create";
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      requests.push(body);
      if (requests.length === 1) {
        return new Response(JSON.stringify({ error: "Location field is not accepted" }), { status: 422, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ eventId: "event-123" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const writer = createVaultBackedGameChangerWriter();
      const result = await writer.createGame({ bracketProjectId: "bracket-1", matchId: "match-1", homeTeam: "Aces", awayTeam: "Bears", venue: "Park", field: "Field 1" });
      assert.equal(result.eventId, "event-123");
      assert.ok(result.warnings?.[0]?.includes("Retried without field/location details"));
      assert.equal(requests.length, 2);
      assert.equal((requests[0] as { game: { field?: string } }).game.field, "Field 1");
      assert.equal((requests[1] as { game: { field?: string } }).game.field, undefined);
    } finally {
      globalThis.fetch = previousFetch;
      process.env = previousEnv;
    }
  });
});
