import { NextRequest, NextResponse } from "next/server";

import { loadPublicTripByToken, submitTripByToken } from "@/lib/trip/service";
import type { TripAnswers } from "@/lib/trip/types";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const loaded = await loadPublicTripByToken(token.trim());
  if (!loaded) {
    return NextResponse.json({ error: "Trip link not found" }, { status: 404 });
  }

  const { participant, event, fields, answers } = loaded;

  return NextResponse.json({
    event: {
      name: event.name,
      teamLabel: event.teamLabel,
      status: event.status,
      introMarkdown: event.introMarkdown,
      organizationId: event.organizationId,
    },
    participant: {
      playerFullName: participant.playerFullName,
      ageGroup: participant.ageGroup,
      team: participant.team,
      jerseyNumber: participant.jerseyNumber,
      status: participant.status,
    },
    fields,
    answers,
    submittedAt: participant.response?.submittedAt?.toISOString() ?? null,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let body: {
    answers?: TripAnswers;
    asDraft?: boolean;
    submitterName?: string | null;
    submitterEmail?: string | null;
    submitterPhone?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.answers || typeof body.answers !== "object") {
    return NextResponse.json({ error: "answers is required" }, { status: 400 });
  }

  try {
    const result = await submitTripByToken({
      token: token.trim(),
      answers: body.answers,
      asDraft: Boolean(body.asDraft),
      submitterName: body.submitterName,
      submitterEmail: body.submitterEmail,
      submitterPhone: body.submitterPhone,
    });
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { status?: number; errors?: string[] };
    const status = err.status ?? (err.message.includes("not found") ? 404 : 400);
    return NextResponse.json(
      {
        error: err.message,
        errors: err.errors,
      },
      { status },
    );
  }
}
