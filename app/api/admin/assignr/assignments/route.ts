import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import { getAssignrLeagueIdForOrg } from "@/lib/assignr/config";
import { listGlobalUnassignedGames, listUnassignedOfficialGamesForSite } from "@/lib/assignr/games";

export async function GET(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const startDate = request.nextUrl.searchParams.get("startDate") || undefined;
  const endDate = request.nextUrl.searchParams.get("endDate") || undefined;
  const scope = request.nextUrl.searchParams.get("scope") || "site";

  try {
    const games =
      scope === "global"
        ? await listGlobalUnassignedGames()
        : await listUnassignedOfficialGamesForSite({
            startDate,
            endDate,
            leagueId: getAssignrLeagueIdForOrg(auth.organizationId),
          });
    return NextResponse.json({ data: games });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
