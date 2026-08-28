import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { runScheduleManager, type RunScheduleManagerResult } from "@/lib/gamechanger/schedule-manager/runScheduleManager";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import prisma from "@/lib/prisma";

export type RunLiveAfterFinalsResult = {
  ran: boolean;
  reason?: string;
  result?: RunScheduleManagerResult;
};

function writerLiveEnabled(): boolean {
  return (
    process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED === "true" &&
    Boolean(process.env.GAMECHANGER_SCHEDULE_WRITER_ENDPOINT?.trim())
  );
}

/**
 * After GC games go final, create all unlocked next-round games (known teams only) via LIVE writer.
 */
export async function runScheduleManagerLiveAfterFinals(
  bracketProjectId: string,
): Promise<RunLiveAfterFinalsResult> {
  if (!writerLiveEnabled()) {
    return { ran: false, reason: "writer_not_configured" };
  }

  const row = await prisma.bracketProject.findUnique({
    where: { id: bracketProjectId },
    select: { spec: true, status: true },
  });
  if (!row || row.status !== "READY") {
    return { ran: false, reason: "bracket_not_ready" };
  }

  const parsed = safeParseBracketSpec(row.spec);
  if (!parsed.ok) {
    return { ran: false, reason: "invalid_spec" };
  }

  const gc = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
  if (!gc.success || !gc.data.scheduleManagerEnabled) {
    return { ran: false, reason: "schedule_manager_disabled" };
  }

  const result = await runScheduleManager({
    mode: "LIVE",
    bracketProjectId,
  });

  return { ran: true, result };
}
