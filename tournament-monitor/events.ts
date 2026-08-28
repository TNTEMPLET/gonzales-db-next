import { createHash } from "crypto";

import type { Prisma, TournamentMonitorEvent, TournamentMonitorEventType } from "@prisma/client";

import prisma from "@/lib/prisma";
import { sendTournamentMonitorEvent, type TournamentAlertSendResult } from "@/lib/tournament-monitor/alertSender";

type PublishMonitorEventInput = {
  runId?: string | null;
  type: TournamentMonitorEventType;
  organizationId: string;
  bracketProjectId?: string | null;
  matchId?: string | null;
  eventKey: string;
  title: string;
  message: string;
  payload?: Prisma.InputJsonValue;
  statusHash?: string;
  send?: boolean;
};

export type PublishedMonitorEvent = {
  created: boolean;
  event: TournamentMonitorEvent | null;
  sendResult?: TournamentAlertSendResult;
};

export function hashMonitorStatus(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export function monitorHourBucket(date = new Date()) {
  const rounded = new Date(date);
  rounded.setUTCMinutes(0, 0, 0);
  return rounded.toISOString();
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export async function publishTournamentMonitorEvent(input: PublishMonitorEventInput): Promise<PublishedMonitorEvent> {
  try {
    const event = await prisma.tournamentMonitorEvent.create({
      data: {
        runId: input.runId ?? null,
        type: input.type,
        organizationId: input.organizationId,
        bracketProjectId: input.bracketProjectId ?? null,
        matchId: input.matchId ?? null,
        eventKey: input.eventKey,
        statusHash: input.statusHash ?? hashMonitorStatus(input.payload ?? input.message),
        title: input.title,
        message: input.message,
        payload: input.payload,
      },
    });

    const sendResult = input.send === false ? undefined : await sendTournamentMonitorEvent(event);
    return { created: true, event, sendResult };
  } catch (error: unknown) {
    if (isUniqueConflict(error)) return { created: false, event: null };
    throw error;
  }
}
