export type WriterLiveDetail = {
  balls?: number;
  strikes?: number;
  outsInHalf?: number;
  inning?: number;
  half?: "top" | "bottom";
};

const DEFAULT_GAMECHANGER_WRITER_ENDPOINT = "https://gc-writer.duckroostdigital.com";

export function resolveGameChangerWriterEndpoint(): string {
  return process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim() || DEFAULT_GAMECHANGER_WRITER_ENDPOINT;
}

export async function fetchLiveDetailsFromWriter(
  events: Array<{ eventId: string; orgId: string }>,
): Promise<Record<string, WriterLiveDetail>> {
  const endpoint = resolveGameChangerWriterEndpoint();
  if (events.length === 0) {
    return {};
  }

  const writerSecret = process.env.GAMECHANGER_SCHEDULE_WRITER_SECRET?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (writerSecret) {
    headers.Authorization = `Bearer ${writerSecret}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "liveDetails", events }),
    signal: AbortSignal.timeout(55_000),
    cache: "no-store",
  });

  const responseText = await response.text();
  let body: { details?: Record<string, WriterLiveDetail>; error?: string } = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText) as { details?: Record<string, WriterLiveDetail>; error?: string };
    } catch {
      throw new Error(
        `GameChanger live detail writer returned non-JSON (${response.status}): ${responseText.slice(0, 240)}`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      body.error ??
        `GameChanger live detail writer failed (${response.status}): ${responseText.slice(0, 240)}`,
    );
  }

  const details = body.details ?? {};
  if (events.length > 0 && Object.keys(details).length === 0) {
    throw new Error(
      `GameChanger live detail writer returned no details (${response.status}): ${responseText.slice(0, 240)}`,
    );
  }

  return details;
}
