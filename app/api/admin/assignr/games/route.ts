import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import {
  createAssignrGame,
  listAssignrGames,
  mapImportRowToCreatePayload,
} from "@/lib/assignr/games";
import { revalidateAssignrGamesCache } from "@/lib/assignr/invalidation";
import { recordAssignrAuditLog } from "@/lib/assignr/jobs";
import type { AssignrGameImportRow } from "@/lib/assignr/gamesImportTypes";
import { getAssignrLeagueIdForOrg } from "@/lib/assignr/config";

export async function GET(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 },
    );
  }

  try {
    const games = await listAssignrGames({
      startDate,
      endDate,
      leagueId: getAssignrLeagueIdForOrg(auth.organizationId),
      cache: "no-store",
    });
    return NextResponse.json({ data: games });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as { row?: AssignrGameImportRow };
  if (!body.row) {
    return NextResponse.json({ error: "row is required" }, { status: 400 });
  }

  try {
    const payload = mapImportRowToCreatePayload(body.row, auth.organizationId);
    const created = await createAssignrGame(auth.organizationId, payload);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "game.create",
      assignrResource: "game",
      assignrResourceId: String(created.id),
      requestSummary: payload,
      responseSummary: { id: created.id },
      success: true,
      adminUserId: auth.adminUserId,
    });
    revalidateAssignrGamesCache();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAssignrAuditLog({
      organizationId: auth.organizationId,
      action: "game.create",
      assignrResource: "game",
      requestSummary: body.row,
      success: false,
      errorMessage: message,
      adminUserId: auth.adminUserId,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
