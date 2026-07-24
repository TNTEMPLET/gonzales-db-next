import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import {
  getCanonicalBallotOriginForOrganizationId,
  isContentOrgId,
} from "@/lib/siteConfig";
import { importParticipantsFromFinalRoster } from "@/lib/trip/service";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

/**
 * Import finalized All-Star roster players into a trip event.
 * Prefills name, jersey, and guardian contact when TeamPlayer match is found.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id: eventId } = await context.params;
  const organizationId = resolveOrg(request);

  let body: {
    cycleId?: string;
    /** SELECTED | SECOND_TEAM | both (default) */
    rosterTeam?: "first" | "second" | "both";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cycleId = body.cycleId?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const rosterTeam = body.rosterTeam ?? "both";
  const slots: Array<"SELECTED" | "SECOND_TEAM"> =
    rosterTeam === "first"
      ? ["SELECTED"]
      : rosterTeam === "second"
        ? ["SECOND_TEAM"]
        : ["SELECTED", "SECOND_TEAM"];

  try {
    const result = await importParticipantsFromFinalRoster({
      eventId,
      organizationId,
      cycleId,
      slots,
    });
    const baseUrl = getCanonicalBallotOriginForOrganizationId(organizationId);
    return NextResponse.json({
      success: true,
      cycle: result.cycle,
      sourceCount: result.sourceCount,
      created: result.created.length,
      skipped: result.skipped,
      contactMatched: result.contactMatched,
      participants: result.created.map((p) => ({
        id: p.id,
        playerFullName: p.playerFullName,
        inviteToken: p.inviteToken,
        inviteUrl: `${baseUrl}/trip/${p.inviteToken}`,
        status: p.status,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    const status =
      msg.includes("not found") || msg.includes("Event not found") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
