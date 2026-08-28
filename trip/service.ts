import "server-only";

import { generateTripInviteToken } from "@/lib/trip/tokens";
import { fieldDefToPublic } from "@/lib/trip/templates";
import type { TripAnswers, TripFieldDefPublic } from "@/lib/trip/types";
import {
  buildPrefillAnswers,
  parseAnswersJson,
  validateTripAnswers,
} from "@/lib/trip/validate";
import prisma from "@/lib/prisma";

export async function listTripEventsForOrg(organizationId: string) {
  return prisma.tripEvent.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      template: { select: { id: true, key: true, name: true } },
      _count: { select: { participants: true } },
      participants: {
        select: { status: true },
      },
    },
  });
}

export function summarizeParticipantStatuses(
  participants: { status: string }[],
): { total: number; not_started: number; draft: number; submitted: number } {
  const out = { total: participants.length, not_started: 0, draft: 0, submitted: 0 };
  for (const p of participants) {
    if (p.status === "submitted") out.submitted++;
    else if (p.status === "draft") out.draft++;
    else out.not_started++;
  }
  return out;
}

export async function getTripEventDetail(eventId: string, organizationId: string) {
  return prisma.tripEvent.findFirst({
    where: { id: eventId, organizationId },
    include: {
      template: {
        include: { fields: { orderBy: { sortOrder: "asc" } } },
      },
      participants: {
        orderBy: [{ playerFullName: "asc" }],
        include: { response: true },
      },
    },
  });
}

export async function createTripEvent(input: {
  organizationId: string;
  templateId: string;
  name: string;
  teamLabel?: string | null;
  status?: string;
  googleSheetId?: string | null;
  googleSheetUrl?: string | null;
  ballotCycleId?: string | null;
  introMarkdown?: string | null;
}) {
  return prisma.tripEvent.create({
    data: {
      organizationId: input.organizationId,
      templateId: input.templateId,
      name: input.name.trim(),
      teamLabel: input.teamLabel?.trim() || null,
      status: input.status ?? "draft",
      googleSheetId: input.googleSheetId ?? null,
      googleSheetUrl: input.googleSheetUrl ?? null,
      ballotCycleId: input.ballotCycleId ?? null,
      introMarkdown: input.introMarkdown ?? null,
    },
  });
}

export async function updateTripEvent(
  eventId: string,
  organizationId: string,
  patch: {
    name?: string;
    teamLabel?: string | null;
    status?: string;
    googleSheetId?: string | null;
    googleSheetUrl?: string | null;
    introMarkdown?: string | null;
    opensAt?: Date | null;
    closesAt?: Date | null;
  },
) {
  const event = await prisma.tripEvent.findFirst({
    where: { id: eventId, organizationId },
  });
  if (!event) return null;

  return prisma.tripEvent.update({
    where: { id: eventId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.teamLabel !== undefined
        ? { teamLabel: patch.teamLabel?.trim() || null }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.googleSheetId !== undefined
        ? { googleSheetId: patch.googleSheetId }
        : {}),
      ...(patch.googleSheetUrl !== undefined
        ? { googleSheetUrl: patch.googleSheetUrl }
        : {}),
      ...(patch.introMarkdown !== undefined
        ? { introMarkdown: patch.introMarkdown }
        : {}),
      ...(patch.opensAt !== undefined ? { opensAt: patch.opensAt } : {}),
      ...(patch.closesAt !== undefined ? { closesAt: patch.closesAt } : {}),
    },
  });
}

export async function addParticipants(
  eventId: string,
  organizationId: string,
  rows: Array<{
    playerFullName: string;
    ageGroup?: string | null;
    team?: string | null;
    jerseyNumber?: string | null;
    candidateId?: string | null;
    paymentId?: string | null;
    /** Optional draft answers (e.g. guardian prefill from TeamPlayer) */
    initialAnswers?: TripAnswers | null;
  }>,
) {
  const event = await prisma.tripEvent.findFirst({
    where: { id: eventId, organizationId },
  });
  if (!event) throw new Error("Event not found");

  const created = [];
  let skipped = 0;
  for (const row of rows) {
    const name = row.playerFullName.trim();
    if (!name) continue;

    const existingByName = await prisma.tripParticipant.findFirst({
      where: {
        eventId,
        playerFullName: { equals: name, mode: "insensitive" },
      },
    });
    if (existingByName) {
      skipped++;
      continue;
    }

    if (row.candidateId) {
      const existingByCandidate = await prisma.tripParticipant.findFirst({
        where: { eventId, candidateId: row.candidateId },
      });
      if (existingByCandidate) {
        skipped++;
        continue;
      }
    }

    let token = generateTripInviteToken();
    for (let i = 0; i < 5; i++) {
      try {
        const p = await prisma.tripParticipant.create({
          data: {
            eventId,
            organizationId,
            playerFullName: name,
            ageGroup: row.ageGroup?.trim() || null,
            team: row.team?.trim() || null,
            jerseyNumber: row.jerseyNumber?.trim() || null,
            candidateId: row.candidateId ?? null,
            paymentId: row.paymentId ?? null,
            inviteToken: token,
            status: row.initialAnswers ? "draft" : "not_started",
          },
        });

        if (row.initialAnswers && Object.keys(row.initialAnswers).length > 0) {
          await prisma.tripResponse.create({
            data: {
              participantId: p.id,
              answersJson: JSON.stringify(row.initialAnswers),
              submitterName: null,
              submitterEmail:
                typeof row.initialAnswers.guardian1_email === "string"
                  ? row.initialAnswers.guardian1_email || null
                  : null,
            },
          });
        }

        created.push(p);
        break;
      } catch {
        token = generateTripInviteToken();
      }
    }
  }
  return { created, skipped };
}

/** Import finalized All-Star roster into a trip event (idempotent by name/candidate). */
export async function importParticipantsFromFinalRoster(input: {
  eventId: string;
  organizationId: string;
  cycleId: string;
  slots?: Array<"SELECTED" | "SECOND_TEAM">;
}) {
  const { buildTripImportRowsFromFinalRoster } = await import(
    "@/lib/trip/importFromRoster"
  );
  const built = await buildTripImportRowsFromFinalRoster({
    organizationId: input.organizationId,
    cycleId: input.cycleId,
    slots: input.slots,
  });

  // Link event to ballot cycle for traceability
  await prisma.tripEvent.updateMany({
    where: { id: input.eventId, organizationId: input.organizationId },
    data: { ballotCycleId: built.cycle.id },
  });

  const result = await addParticipants(
    input.eventId,
    input.organizationId,
    built.rows.map((r) => ({
      playerFullName: r.playerFullName,
      ageGroup: r.ageGroup,
      team: r.team,
      jerseyNumber: r.jerseyNumber,
      candidateId: r.candidateId,
      initialAnswers: r.answers,
    })),
  );

  return {
    cycle: built.cycle,
    sourceCount: built.rows.length,
    contactMatched: built.rows.filter((r) => r.contactMatched).length,
    created: result.created,
    skipped: result.skipped,
  };
}

export async function loadPublicTripByToken(token: string) {
  const participant = await prisma.tripParticipant.findUnique({
    where: { inviteToken: token },
    include: {
      response: true,
      event: {
        include: {
          template: {
            include: { fields: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  if (!participant) return null;

  const fields = participant.event.template.fields.map(fieldDefToPublic);
  const parentFields = fields.filter((f) => !f.adminOnly);
  const stored = parseAnswersJson(participant.response?.answersJson);
  const prefill = buildPrefillAnswers(parentFields, participant);
  const answers: TripAnswers = { ...prefill, ...stored };

  return {
    participant,
    event: participant.event,
    fields: parentFields,
    allFields: fields,
    answers,
  };
}

function submitterFromAnswers(answers: TripAnswers): {
  name: string | null;
  email: string | null;
} {
  const g1First =
    typeof answers.guardian1_first_name === "string"
      ? answers.guardian1_first_name.trim()
      : "";
  const g1Last =
    typeof answers.guardian1_last_name === "string"
      ? answers.guardian1_last_name.trim()
      : "";
  const name = [g1First, g1Last].filter(Boolean).join(" ") || null;
  const email =
    typeof answers.guardian1_email === "string"
      ? answers.guardian1_email.trim() || null
      : null;
  return { name, email };
}

export async function submitTripByToken(input: {
  token: string;
  answers: TripAnswers;
  submitterName?: string | null;
  submitterEmail?: string | null;
  submitterPhone?: string | null;
  asDraft?: boolean;
}) {
  const loaded = await loadPublicTripByToken(input.token);
  if (!loaded) throw new Error("Trip link not found");
  if (loaded.event.status === "closed") {
    throw new Error("This trip form is closed.");
  }
  if (loaded.event.status === "draft") {
    throw new Error("This trip form is not open yet.");
  }

  const validated = validateTripAnswers(loaded.fields, input.answers, {
    parentFacing: true,
  });
  if (!input.asDraft && !validated.ok) {
    const err = new Error(validated.errors.join(" "));
    (err as Error & { status?: number }).status = 400;
    (err as Error & { errors?: string[] }).errors = validated.errors;
    throw err;
  }

  const answers = validated.ok
    ? validated.answers
    : parseAnswersJson(JSON.stringify(input.answers));

  const fromAnswers = submitterFromAnswers(answers);
  const submitterName =
    (input.submitterName ?? "").trim() || fromAnswers.name;
  const submitterEmail =
    (input.submitterEmail ?? "").trim() || fromAnswers.email;
  const submitterPhone = (input.submitterPhone ?? "").trim() || null;

  const status = input.asDraft ? "draft" : "submitted";
  const submittedAt = input.asDraft ? null : new Date();

  await prisma.tripResponse.upsert({
    where: { participantId: loaded.participant.id },
    create: {
      participantId: loaded.participant.id,
      answersJson: JSON.stringify(answers),
      submitterName,
      submitterEmail,
      submitterPhone,
      submittedAt,
    },
    update: {
      answersJson: JSON.stringify(answers),
      submitterName,
      submitterEmail,
      submitterPhone,
      submittedAt: input.asDraft ? undefined : submittedAt,
    },
  });

  // Keep participant roster name in sync with submitted first/last
  const first =
    typeof answers.first_name === "string" ? answers.first_name.trim() : "";
  const last =
    typeof answers.last_name === "string" ? answers.last_name.trim() : "";
  const fullFromAnswers = [first, last].filter(Boolean).join(" ");

  await prisma.tripParticipant.update({
    where: { id: loaded.participant.id },
    data: {
      status,
      ...(fullFromAnswers
        ? {
            playerFullName: fullFromAnswers,
            jerseyNumber:
              typeof answers.uniform_number === "string" &&
              answers.uniform_number.trim()
                ? answers.uniform_number.trim()
                : undefined,
          }
        : {}),
    },
  });

  return { status };
}

export function fieldsFromEventTemplate(
  fields: Parameters<typeof fieldDefToPublic>[0][],
): TripFieldDefPublic[] {
  return fields.map(fieldDefToPublic).sort((a, b) => a.sortOrder - b.sortOrder);
}
