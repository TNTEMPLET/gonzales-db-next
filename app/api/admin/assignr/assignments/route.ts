import { NextRequest, NextResponse } from "next/server";

import { ensureAssignrAdmin } from "@/lib/assignr/adminAuth";
import {
  fetchAssignrGamesForContentOrg,
  fetchUnassignedAssignrGamesForContentOrg,
} from "@/lib/admin/assignrOrgScope";
import { resolveAssignrDeskDateRange } from "@/lib/admin/assignrDeskDateRange";
import {
  enrichAssignrGamesWithAssignmentDetails,
  listGlobalUnassignedGames,
} from "@/lib/assignr/games";

export async function GET(request: NextRequest) {
  const auth = await ensureAssignrAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const startDate = request.nextUrl.searchParams.get("startDate") || undefined;
  const endDate = request.nextUrl.searchParams.get("endDate") || undefined;
  const scope = request.nextUrl.searchParams.get("scope") || "site";
  const view = request.nextUrl.searchParams.get("view") || "all";

  try {
    const resolvedRange = resolveAssignrDeskDateRange({ startDate, endDate });
    const games =
      view === "unassigned"
        ? scope === "global"
          ? await listGlobalUnassignedGames()
          : await fetchUnassignedAssignrGamesForContentOrg(auth.organizationId, {
              startDate: resolvedRange.startDate,
              endDate: resolvedRange.endDate,
            })
        : await fetchAssignrGamesForContentOrg(auth.organizationId, {
            startDate: resolvedRange.startDate,
            endDate: resolvedRange.endDate,
            cache: "no-store",
          });
    const detailedGames = await enrichAssignrGamesWithAssignmentDetails(games);
    return NextResponse.json({ data: detailedGames, view, count: detailedGames.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
