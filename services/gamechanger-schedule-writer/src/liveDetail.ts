import type { GameChangerCredentials } from "./credentials.js";
import {
  GC_API_BASE,
  openBrowserSession,
  persistBrowserSession,
} from "./browserSession.js";
import { captureGcToken } from "./gcToken.js";
import { parseViewerPayloadLite, type ParsedLiveDetail } from "./parseViewerPayloadLite.js";

export type LiveDetailRequest = {
  eventId: string;
  orgId: string;
};

async function fetchViewerPayloadLite(gcToken: string, eventId: string): Promise<unknown> {
  const url = `${GC_API_BASE}/game-streams/gamestream-viewer-payload-lite/${eventId}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "gc-token": gcToken,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GameChanger viewer payload failed for ${eventId} (${response.status}): ${body.slice(0, 200)}`,
    );
  }

  return response.json();
}

export async function fetchGameChangerLiveDetails(
  credentials: GameChangerCredentials,
  requests: LiveDetailRequest[],
): Promise<Record<string, ParsedLiveDetail>> {
  if (requests.length === 0) return {};

  const orgId = requests[0]!.orgId.trim();
  if (!orgId) {
    throw new Error("orgId is required for live detail requests.");
  }

  const { browser, context, page } = await openBrowserSession(credentials);
  const details: Record<string, ParsedLiveDetail> = {};

  try {
    const gcToken = await captureGcToken(page, orgId);

    for (const request of requests) {
      const eventId = request.eventId.trim();
      if (!eventId) continue;
      try {
        const payload = await fetchViewerPayloadLite(gcToken, eventId);
        details[eventId] = parseViewerPayloadLite(payload);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`liveDetail: skipped ${eventId}: ${message}`);
      }
    }

    await persistBrowserSession(context);
    return details;
  } finally {
    await context.close();
    await browser.close();
  }
}
