import { createServer, type IncomingMessage } from "node:http";

import { loadGameChangerCredentials } from "./credentials.js";
import { createGameChangerGame } from "./createGame.js";
import { fetchGameChangerLiveDetails } from "./liveDetail.js";
import type { CreateGameRequest } from "./types.js";

const PORT = Number(process.env.GC_WRITER_PORT ?? "8105");
const WRITER_SECRET = process.env.GAMECHANGER_SCHEDULE_WRITER_SECRET?.trim();

type LiveDetailBody = {
  eventId?: string;
  orgId?: string;
};

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

function parseLiveDetailRequests(events: LiveDetailBody[] | undefined): Array<{ eventId: string; orgId: string }> {
  if (!events?.length) return [];
  const out: Array<{ eventId: string; orgId: string }> = [];
  for (const entry of events) {
    const eventId = entry.eventId?.trim();
    const orgId = entry.orgId?.trim();
    if (eventId && orgId) out.push({ eventId, orgId });
  }
  return out;
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
    | { action?: string; game?: CreateGameRequest; events?: LiveDetailBody[] }
    | null;
  if (!payload?.action) {
    return badRequest("Expected action in JSON body.");
  }

  try {
    const credentials = await loadGameChangerCredentials();

    if (payload.action === "createGame") {
      if (!payload.game) {
        return badRequest("Expected { action: 'createGame', game: ... }.");
      }
      const eventId = await createGameChangerGame(credentials, payload.game);
      return ok({ eventId });
    }

    if (payload.action === "liveDetails") {
      const requests = parseLiveDetailRequests(payload.events);
      if (requests.length === 0) {
        return badRequest("Expected { action: 'liveDetails', events: [{ eventId, orgId }] }.");
      }
      const details = await fetchGameChangerLiveDetails(credentials, requests);
      return ok({ details });
    }

    return badRequest(`Unsupported action: ${payload.action}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return serverError(message);
  }
}

async function readRequestBody(incoming: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (incoming: IncomingMessage, outgoing) => {
  const method = incoming.method ?? "GET";
  const hasBody = method === "POST" || method === "PUT";
  const bodyText = hasBody ? await readRequestBody(incoming) : undefined;
  const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
    method,
    headers: incoming.headers as HeadersInit,
    body: bodyText,
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
