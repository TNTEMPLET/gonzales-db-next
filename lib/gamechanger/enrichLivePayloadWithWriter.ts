import { fetchLiveDetailsFromWriter } from "@/lib/gamechanger/fetchLiveDetailFromWriter";
import { liveBaseballSituationFromEvent } from "@/lib/gamechanger/liveBaseballSituation";
import { isLiveGcEvent } from "@/lib/gamechanger/matchEventsToBracket";
import { mergeWriterLiveDetail } from "@/lib/gamechanger/mergeWriterLiveDetail";
import type { GcBracketMatchRef, GcLiveMatchPayload, GcLiveSituation } from "@/lib/gamechanger/types";

export async function enrichLivePayloadWithWriterDetails(
  payload: GcLiveMatchPayload,
  bracketMatches: GcBracketMatchRef[],
  organizationId: string,
): Promise<GcLiveMatchPayload> {
  if (!payload.hasLiveGames) return payload;

  const liveWriterRequests = bracketMatches
    .map((ref) => {
      const event = payload.eventsByMatchId[ref.id];
      if (!event || !isLiveGcEvent(event)) return null;
      return { eventId: event.id, orgId: organizationId, ref };
    })
    .filter(
      (entry): entry is { eventId: string; orgId: string; ref: GcBracketMatchRef } => entry != null,
    );

  if (liveWriterRequests.length === 0) return payload;

  try {
    const writerDetails = await fetchLiveDetailsFromWriter(
      liveWriterRequests.map(({ eventId, orgId }) => ({ eventId, orgId })),
    );
    const liveSituationsByMatchId: Record<string, GcLiveSituation> = {};
    for (const { eventId, ref } of liveWriterRequests) {
      const event = payload.eventsByMatchId[ref.id];
      if (!event) continue;
      const base = liveBaseballSituationFromEvent(event, ref);
      liveSituationsByMatchId[ref.id] = mergeWriterLiveDetail(base, writerDetails[eventId], ref, event);
    }
    return { ...payload, organizationId, liveSituationsByMatchId };
  } catch (writerError: unknown) {
    console.warn(
      "GameChanger live detail writer failed:",
      writerError instanceof Error ? writerError.message : String(writerError),
    );
    return { ...payload, organizationId };
  }
}
