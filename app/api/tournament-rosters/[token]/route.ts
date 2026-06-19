import { NextRequest, NextResponse } from "next/server";

import { parseRosterCsv, validateRosterPlayers, type RosterPlayerInput } from "@/lib/tournament-rosters/csv";
import { findActiveRosterLinkByToken } from "@/lib/tournament-rosters/tokens";
import prisma from "@/lib/prisma";

type RouteParams = { params: Promise<{ token: string }> };

type SubmitBody = {
  source?: "FORM" | "CSV";
  submitterName?: string;
  submitterEmail?: string;
  submitterPhone?: string;
  notes?: string;
  originalFilename?: string | null;
  rawCsv?: string | null;
  players?: RosterPlayerInput[];
};

function clean(value: unknown) {
  return String(value ?? "").trim() || null;
}

function routeError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : String(err || fallback);
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}

export async function GET(_request: NextRequest, ctx: RouteParams) {
  try {
    const { token } = await ctx.params;
    const link = await findActiveRosterLinkByToken(token);
    if (!link) return NextResponse.json({ error: "Roster link not found" }, { status: 404 });
    return NextResponse.json({
      data: {
        teamName: link.teamName,
        ageGroup: link.ageGroup,
        seasonYear: link.seasonYear,
        latestStatus: link.submissions[0]?.status ?? null,
      },
    });
  } catch (err: unknown) {
    return routeError(err, "Failed to load roster link");
  }
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  try {
    const { token } = await ctx.params;
    const link = await findActiveRosterLinkByToken(token);
    if (!link) return NextResponse.json({ error: "Roster link not found" }, { status: 404 });

    let body: SubmitBody;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("csv");
      const rawCsv = file instanceof File ? await file.text() : null;
      const parsed = rawCsv ? parseRosterCsv(rawCsv) : { players: [], errors: ["CSV file is required."] };
      body = {
        source: "CSV",
        submitterName: clean(form.get("submitterName")) ?? undefined,
        submitterEmail: clean(form.get("submitterEmail")) ?? undefined,
        submitterPhone: clean(form.get("submitterPhone")) ?? undefined,
        notes: clean(form.get("notes")) ?? undefined,
        originalFilename: file instanceof File ? file.name : null,
        rawCsv,
        players: parsed.players,
      };
      if (parsed.errors.length) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    } else {
      try {
        body = (await request.json()) as SubmitBody;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }

    const validation = validateRosterPlayers(Array.isArray(body.players) ? body.players : []);
    if (validation.errors.length) return NextResponse.json({ errors: validation.errors }, { status: 400 });

    const submission = await prisma.tournamentRosterSubmission.create({
      data: {
        linkId: link.id,
        status: "PENDING",
        source: body.source === "CSV" ? "CSV" : "FORM",
        submitterName: clean(body.submitterName),
        submitterEmail: clean(body.submitterEmail),
        submitterPhone: clean(body.submitterPhone),
        notes: clean(body.notes),
        originalFilename: clean(body.originalFilename),
        rawCsv: body.rawCsv?.slice(0, 64_000) ?? null,
        players: {
          create: validation.players.map((player, idx) => ({
            rowNumber: idx + 1,
            firstName: player.firstName,
            lastName: player.lastName,
            jerseyNumber: player.jerseyNumber,
          })),
        },
      },
      include: { players: true },
    });

    return NextResponse.json({ data: { id: submission.id, status: submission.status, playerCount: submission.players.length } });
  } catch (err: unknown) {
    return routeError(err, "Failed to submit roster");
  }
}
