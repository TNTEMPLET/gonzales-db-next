import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { createInviteToken, hashToken } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { isMasterDeployment } from "@/lib/siteConfig";

function forbidIfNotMaster() {
  if (!isMasterDeployment()) {
    return NextResponse.json(
      { error: "All-Star Vault is only managed from master deployment" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const data = await prisma.allStarInvite.findMany({
    where: { ballotCycleId: cycleId },
    include: { invitedUser: { select: { id: true, email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    data: data.map((invite) => ({
      ...invite,
      createdAt: invite.createdAt.toISOString(),
      openedAt: invite.openedAt?.toISOString() || null,
      expiresAt: invite.expiresAt?.toISOString() || null,
      revokedAt: invite.revokedAt?.toISOString() || null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as {
    cycleId?: string;
    emails?: string[];
    expiresAt?: string;
  };
  if (!body.cycleId || !Array.isArray(body.emails) || body.emails.length === 0) {
    return NextResponse.json(
      { error: "cycleId and at least one email are required" },
      { status: 400 },
    );
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: body.cycleId } });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const admin = await getAdminUserFromRequest(request);
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const created = [];
  for (const rawEmail of body.emails) {
    const email = rawEmail.trim().toLowerCase();
    if (!email) continue;
    const registered = await prisma.registeredUser.findFirst({
      where: { email, organizationId: cycle.organizationId },
      select: { id: true },
    });
    const token = createInviteToken();
    const tokenHash = hashToken(token);
    const invite = await prisma.allStarInvite.create({
      data: {
        ballotCycleId: cycle.id,
        tokenHash,
        organizationId: cycle.organizationId,
        ageGroup: cycle.ageGroup,
        invitedEmail: email,
        invitedUserId: registered?.id || null,
        createdByAdminId: admin?.id || null,
        expiresAt,
      },
    });
    created.push({
      inviteId: invite.id,
      invitedEmail: email,
      link: `${baseUrl}/all-star/vote?c=${cycle.id}&t=${encodeURIComponent(token)}`,
    });
  }

  return NextResponse.json({ success: true, invites: created });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as { inviteId?: string };
  if (!body.inviteId) return NextResponse.json({ error: "inviteId is required" }, { status: 400 });

  const invite = await prisma.allStarInvite.update({
    where: { id: body.inviteId },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ success: true, inviteId: invite.id });
}
