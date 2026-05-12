import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { getAssignrAccessToken } from "@/lib/assignr/client";
import { getAssignrOAuthScope } from "@/lib/assignr/config";
import { listAssignrGames } from "@/lib/assignr/games";

export async function GET(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    await getAssignrAccessToken();
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);

    const format = (value: Date) => value.toISOString().slice(0, 10);
    const games = await listAssignrGames({
      startDate: format(start),
      endDate: format(end),
      cache: "no-store",
    });

    return NextResponse.json({
      ok: true,
      scope: getAssignrOAuthScope(),
      organizationId: auth.organizationId,
      sampleGameCount: games.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
