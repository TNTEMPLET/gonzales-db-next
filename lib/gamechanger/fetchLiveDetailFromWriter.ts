export type WriterLiveDetail = {
  balls?: number;
  strikes?: number;
  outsInHalf?: number;
  inning?: number;
  half?: "top" | "bottom";
};

const DEFAULT_GAMECHANGER_WRITER_ENDPOINT = "https://gc-writer.duckroostdigital.com";

export async function fetchLiveDetailsFromWriter(
  events: Array<{ eventId: string; orgId: string }>,
): Promise<Record<string, WriterLiveDetail>> {
  const endpoint =
    process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim() || DEFAULT_GAMECHANGER_WRITER_ENDPOINT;
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

  const body = (await response.json().catch(() => ({}))) as {
    details?: Record<string, WriterLiveDetail>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? `GameChanger live detail writer failed (${response.status})`);
  }

  return body.details ?? {};
}
