import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess, ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

function forbidIfNotMaster() {
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const [cycle, data] = await Promise.all([
    prisma.allStarBallotCycle.findUnique({
      where: { id: cycleId },
      select: { ballotLinkToken: true },
    }),
    prisma.allStarInvite.findMany({
      where: { ballotCycleId: cycleId },
      include: {
        invitedUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const ballotVotingLink =
    cycle?.ballotLinkToken != null
      ? `${baseUrl}/all-star/vote?t=${encodeURIComponent(cycle.ballotLinkToken)}`
      : null;

  return NextResponse.json({
    ballotVotingLink,
    data: data.map((invite) => ({
      ...invite,
      /** @deprecated Use top-level `ballotVotingLink` — one link per ballot. */
      link:
        invite.inviteToken != null
          ? `${baseUrl}/all-star/vote?c=${invite.ballotCycleId}&t=${encodeURIComponent(invite.inviteToken)}`
          : ballotVotingLink,
      invitedCoachName:
        invite.invitedUser?.firstName || invite.invitedUser?.lastName
          ? [invite.invitedUser?.firstName, invite.invitedUser?.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
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
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const upserted = [];
  for (const rawEmail of body.emails) {
    const email = rawEmail.trim().toLowerCase();
    if (!email) continue;
    const registered = await prisma.registeredUser.findFirst({
      where: { email, organizationId: cycle.organizationId },
      select: { id: true },
    });
    const existing = await prisma.allStarInvite.findFirst({
      where: {
        ballotCycleId: cycle.id,
        invitedEmail: email,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    const invite = existing
      ? await prisma.allStarInvite.update({
          where: { id: existing.id },
          data: {
            tokenHash: null,
            inviteToken: null,
            invitedUserId: registered?.id || null,
            createdByAdminId: admin?.id || null,
            expiresAt,
            revokedAt: null,
          },
        })
      : await prisma.allStarInvite.create({
          data: {
            ballotCycleId: cycle.id,
            tokenHash: null,
            inviteToken: null,
            organizationId: cycle.organizationId,
            ageGroup: cycle.ageGroup,
            invitedEmail: email,
            invitedUserId: registered?.id || null,
            createdByAdminId: admin?.id || null,
            expiresAt,
          },
        });
    upserted.push({
      inviteId: invite.id,
      invitedEmail: email,
    });
  }

  const refreshed = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycle.id },
    select: { ballotLinkToken: true },
  });
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const ballotVotingLink =
    refreshed?.ballotLinkToken != null
      ? `${baseUrl}/all-star/vote?t=${encodeURIComponent(refreshed.ballotLinkToken)}`
      : null;

  return NextResponse.json({
    success: true,
    invites: upserted,
    ballotVotingLink,
    message:
      ballotVotingLink == null
        ? "Roster saved. Generate a shared ballot link so coaches can open the ballot (one link for everyone)."
        : undefined,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { inviteId?: string };
  if (!body.inviteId) return NextResponse.json({ error: "inviteId is required" }, { status: 400 });

  const existing = await prisma.allStarInvite.findUnique({
    where: { id: body.inviteId },
    include: { ballotCycle: { select: { organizationId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (existing.ballotCycle.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invite = await prisma.allStarInvite.update({
    where: { id: body.inviteId },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ success: true, inviteId: invite.id });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { inviteId?: string; action?: string };
  if (!body.inviteId) {
    return NextResponse.json({ error: "inviteId is required" }, { status: 400 });
  }
  if (body.action !== "re_enable") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const existing = await prisma.allStarInvite.findUnique({
    where: { id: body.inviteId },
    include: { ballotCycle: { select: { organizationId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (existing.ballotCycle.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invite = await prisma.allStarInvite.update({
    where: { id: body.inviteId },
    data: { revokedAt: null },
  });
  return NextResponse.json({ success: true, inviteId: invite.id });
}
