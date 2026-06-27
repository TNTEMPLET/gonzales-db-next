import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { loadGameChangerCredentials } from "./credentials.js";
import { createGameChangerGame } from "./createGame.js";
import type { CreateGameRequest } from "./types.js";

const PORT = Number(process.env.GC_WRITER_PORT ?? "8105");
const WRITER_SECRET = process.env.GAMECHANGER_SCHEDULE_WRITER_SECRET?.trim();

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function serverError(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

function isAuthorized(request: Request): boolean {
  if (!WRITER_SECRET) return true;
  const header = request.headers.get("authorization")?.trim();
  return header === `Bearer ${WRITER_SECRET}`;
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "GET" && new URL(request.url).pathname === "/health") {
    return ok({ status: "ok" });
  }

  if (!isAuthorized(request)) return unauthorized();

  if (request.method !== "POST") {
    return badRequest("Only POST is supported.");
  }

  const payload = (await request.json().catch(() => null)) as
    | { action?: string; game?: CreateGameRequest }
    | null;
  if (!payload || payload.action !== "createGame" || !payload.game) {
    return badRequest("Expected { action: 'createGame', game: ... }.");
  }

  try {
    const credentials = await loadGameChangerCredentials();
    const eventId = await createGameChangerGame(credentials, payload.game);
    return ok({ eventId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return serverError(message);
  }
}

const server = createServer(async (incoming: IncomingMessage, outgoing) => {
  const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
    method: incoming.method,
    headers: incoming.headers as HeadersInit,
    body:
      incoming.method === "POST" || incoming.method === "PUT"
        ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
        : undefined,
  });
  const response = await handleRequest(request);
  outgoing.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    outgoing.setHeader(key, value);
  }
  outgoing.end(await response.text());
});

server.listen(PORT, () => {
  console.log(`gamechanger-schedule-writer listening on :${PORT}`);
});
