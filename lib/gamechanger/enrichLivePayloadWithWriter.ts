import { fetchLiveDetailsFromWriter, resolveGameChangerWriterEndpoint } from "@/lib/gamechanger/fetchLiveDetailFromWriter";
import { liveBaseballSituationFromEvent } from "@/lib/gamechanger/liveBaseballSituation";
import { isLiveGcEvent } from "@/lib/gamechanger/matchEventsToBracket";
import { mergeWriterLiveDetail } from "@/lib/gamechanger/mergeWriterLiveDetail";
import type { GcBracketMatchRef, GcLiveMatchPayload, GcLiveSituation } from "@/lib/gamechanger/types";

export type WriterEnrichmentDiagnostics = {
  secretConfigured: boolean;
  endpointConfigured: boolean;
  writerEndpoint?: string;
  writerMergedCounts: boolean;
  writerDetailKeys?: string[];
  writerError?: string;
};

export async function enrichLivePayloadWithWriterDetails(
  payload: GcLiveMatchPayload,
  bracketMatches: GcBracketMatchRef[],
  organizationId: string,
): Promise<GcLiveMatchPayload & { writerDiagnostics?: WriterEnrichmentDiagnostics }> {
  if (!payload.hasLiveGames) return { ...payload, organizationId };

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

  const liveSituationsByMatchId: Record<string, GcLiveSituation> = {};
  for (const { ref } of liveWriterRequests) {
    const event = payload.eventsByMatchId[ref.id];
    if (!event) continue;
    liveSituationsByMatchId[ref.id] = liveBaseballSituationFromEvent(event, ref);
  }

  const writerDiagnostics: WriterEnrichmentDiagnostics = {
    secretConfigured: Boolean(process.env.GAMECHANGER_SCHEDULE_WRITER_SECRET?.trim()),
    endpointConfigured: Boolean(process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim()),
    writerEndpoint: resolveGameChangerWriterEndpoint(),
    writerMergedCounts: false,
  };

  try {
    const writerDetails = await fetchLiveDetailsFromWriter(
      liveWriterRequests.map(({ eventId, orgId }) => ({ eventId, orgId })),
    );
    writerDiagnostics.writerDetailKeys = Object.keys(writerDetails);

    for (const { eventId, ref } of liveWriterRequests) {
      const event = payload.eventsByMatchId[ref.id];
      if (!event) continue;
      const writer = writerDetails[eventId];
      if (!writer) continue;
      liveSituationsByMatchId[ref.id] = mergeWriterLiveDetail(
        liveSituationsByMatchId[ref.id],
        writer,
        ref,
        event,
      );
      if (writer.balls != null || writer.strikes != null) {
        writerDiagnostics.writerMergedCounts = true;
      }
    }
  } catch (writerError: unknown) {
    writerDiagnostics.writerError =
      writerError instanceof Error ? writerError.message : String(writerError);
    console.warn("GameChanger live detail writer failed:", writerDiagnostics.writerError);
  }

  return { ...payload, organizationId, liveSituationsByMatchId, writerDiagnostics };
}
