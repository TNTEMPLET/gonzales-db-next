import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import {
  getCanonicalBallotOriginForOrganizationId,
  isContentOrgId,
} from "@/lib/siteConfig";
import { addParticipants } from "@/lib/trip/service";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

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
    participants?: Array<{
      playerFullName?: string;
      ageGroup?: string | null;
      team?: string | null;
      jerseyNumber?: string | null;
    }>;
    /** Bulk paste: one player name per line */
    namesText?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows: Array<{
    playerFullName: string;
    ageGroup?: string | null;
    team?: string | null;
    jerseyNumber?: string | null;
  }> = [];

  if (Array.isArray(body.participants)) {
    for (const p of body.participants) {
      const name = (p.playerFullName ?? "").trim();
      if (!name) continue;
      rows.push({
        playerFullName: name,
        ageGroup: p.ageGroup,
        team: p.team,
        jerseyNumber: p.jerseyNumber,
      });
    }
  }

  if (typeof body.namesText === "string" && body.namesText.trim()) {
    for (const line of body.namesText.split(/\r?\n/)) {
      const name = line.trim();
      if (!name || name.startsWith("#")) continue;
      rows.push({ playerFullName: name });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Provide participants[] or namesText with at least one name" },
      { status: 400 },
    );
  }

  try {
    const created = await addParticipants(eventId, organizationId, rows);
    const baseUrl = getCanonicalBallotOriginForOrganizationId(organizationId);
    return NextResponse.json({
      created: created.length,
      participants: created.map((p) => ({
        id: p.id,
        playerFullName: p.playerFullName,
        inviteToken: p.inviteToken,
        inviteUrl: `${baseUrl}/trip/${p.inviteToken}`,
        status: p.status,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add participants";
    const status = msg === "Event not found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
