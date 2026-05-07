import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeDate(value: string | null | undefined) {
  const parsed = value?.trim() ? new Date(value) : null;
  if (!parsed) return null;
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeAllStarAgeBand(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() || "";
  if (normalized === "11U" || normalized === "12U") return normalized;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, organizationId: true },
  });
  if (!team || team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const players = await prisma.teamPlayer.findMany({
    where: { teamId: team.id },
    orderBy: [{ fullName: "asc" }],
  });
  return NextResponse.json({ data: players });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as {
    teamId?: string;
    fullName?: string;
    firstName?: string | null;
    lastName?: string | null;
    contactPhone?: string | null;
    rosterStatus?: string | null;
    jerseyNumber?: string | null;
    gender?: string | null;
    birthDate?: string | null;
    guardianFirstName?: string | null;
    guardianLastName?: string | null;
    guardianEmail?: string | null;
    guardianPhone?: string | null;
    paymentStatus?: string | null;
    birthCertificateStatus?: string | null;
    registrationOrderNo?: string | null;
    registrationOrderDate?: string | null;
    jerseySize?: string | null;
    medicalConditionsSummary?: string | null;
    medicalConditionsDetails?: string | null;
    medicalTreatmentAuthorized?: boolean | null;
    liabilityWaiverAccepted?: boolean | null;
    codeOfConductAccepted?: boolean | null;
    refundPolicyAccepted?: boolean | null;
    playedPriorSeason?: boolean | null;
    priorSeasonTeamInfo?: string | null;
    streetAddress?: string | null;
    unit?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    allStarAgeBand?: string | null;
  };
  if (!body.teamId || !body.fullName?.trim()) {
    return NextResponse.json(
      { error: "teamId and fullName are required" },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: body.teamId },
    select: { id: true, organizationId: true },
  });
  if (!team || team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const created = await prisma.teamPlayer.create({
    data: {
      teamId: team.id,
      fullName: body.fullName.trim(),
      firstName: normalizeString(body.firstName),
      lastName: normalizeString(body.lastName),
      contactPhone: normalizeString(body.contactPhone),
      rosterStatus: normalizeString(body.rosterStatus),
      jerseyNumber: normalizeString(body.jerseyNumber),
      gender: normalizeString(body.gender),
      birthDate: normalizeDate(body.birthDate),
      guardianFirstName: normalizeString(body.guardianFirstName),
      guardianLastName: normalizeString(body.guardianLastName),
      guardianEmail: normalizeString(body.guardianEmail),
      guardianPhone: normalizeString(body.guardianPhone),
      paymentStatus: normalizeString(body.paymentStatus),
      birthCertificateStatus: normalizeString(body.birthCertificateStatus),
      registrationOrderNo: normalizeString(body.registrationOrderNo),
      registrationOrderDate: normalizeDate(body.registrationOrderDate),
      jerseySize: normalizeString(body.jerseySize),
      medicalConditionsSummary: normalizeString(body.medicalConditionsSummary),
      medicalConditionsDetails: normalizeString(body.medicalConditionsDetails),
      medicalTreatmentAuthorized: body.medicalTreatmentAuthorized ?? null,
      liabilityWaiverAccepted: body.liabilityWaiverAccepted ?? null,
      codeOfConductAccepted: body.codeOfConductAccepted ?? null,
      refundPolicyAccepted: body.refundPolicyAccepted ?? null,
      playedPriorSeason: body.playedPriorSeason ?? null,
      priorSeasonTeamInfo: normalizeString(body.priorSeasonTeamInfo),
      streetAddress: normalizeString(body.streetAddress),
      unit: normalizeString(body.unit),
      city: normalizeString(body.city),
      state: normalizeString(body.state),
      postalCode: normalizeString(body.postalCode),
      allStarAgeBand: normalizeAllStarAgeBand(body.allStarAgeBand),
    },
  });
  return NextResponse.json({ success: true, player: created });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as {
    playerId?: string;
    fullName?: string;
    firstName?: string | null;
    lastName?: string | null;
    contactPhone?: string | null;
    rosterStatus?: string | null;
    jerseyNumber?: string | null;
    gender?: string | null;
    birthDate?: string | null;
    guardianFirstName?: string | null;
    guardianLastName?: string | null;
    guardianEmail?: string | null;
    guardianPhone?: string | null;
    paymentStatus?: string | null;
    birthCertificateStatus?: string | null;
    registrationOrderNo?: string | null;
    registrationOrderDate?: string | null;
    jerseySize?: string | null;
    medicalConditionsSummary?: string | null;
    medicalConditionsDetails?: string | null;
    medicalTreatmentAuthorized?: boolean | null;
    liabilityWaiverAccepted?: boolean | null;
    codeOfConductAccepted?: boolean | null;
    refundPolicyAccepted?: boolean | null;
    playedPriorSeason?: boolean | null;
    priorSeasonTeamInfo?: string | null;
    streetAddress?: string | null;
    unit?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    allStarAgeBand?: string | null;
  };
  if (!body.playerId) {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  const player = await prisma.teamPlayer.findUnique({
    where: { id: body.playerId },
    include: { team: { select: { organizationId: true } } },
  });
  if (!player || player.team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const updated = await prisma.teamPlayer.update({
    where: { id: player.id },
    data: {
      fullName: body.fullName === undefined ? undefined : body.fullName.trim() || undefined,
      firstName: body.firstName === undefined ? undefined : body.firstName?.trim() || null,
      lastName: body.lastName === undefined ? undefined : body.lastName?.trim() || null,
      contactPhone:
        body.contactPhone === undefined ? undefined : body.contactPhone?.trim() || null,
      rosterStatus:
        body.rosterStatus === undefined ? undefined : body.rosterStatus?.trim() || null,
      jerseyNumber:
        body.jerseyNumber === undefined ? undefined : body.jerseyNumber?.trim() || null,
      gender: body.gender === undefined ? undefined : normalizeString(body.gender),
      birthDate: body.birthDate === undefined ? undefined : normalizeDate(body.birthDate),
      guardianFirstName:
        body.guardianFirstName === undefined ? undefined : normalizeString(body.guardianFirstName),
      guardianLastName:
        body.guardianLastName === undefined ? undefined : normalizeString(body.guardianLastName),
      guardianEmail:
        body.guardianEmail === undefined ? undefined : normalizeString(body.guardianEmail),
      guardianPhone:
        body.guardianPhone === undefined ? undefined : normalizeString(body.guardianPhone),
      paymentStatus:
        body.paymentStatus === undefined ? undefined : normalizeString(body.paymentStatus),
      birthCertificateStatus:
        body.birthCertificateStatus === undefined
          ? undefined
          : normalizeString(body.birthCertificateStatus),
      registrationOrderNo:
        body.registrationOrderNo === undefined
          ? undefined
          : normalizeString(body.registrationOrderNo),
      registrationOrderDate:
        body.registrationOrderDate === undefined
          ? undefined
          : normalizeDate(body.registrationOrderDate),
      jerseySize: body.jerseySize === undefined ? undefined : normalizeString(body.jerseySize),
      medicalConditionsSummary:
        body.medicalConditionsSummary === undefined
          ? undefined
          : normalizeString(body.medicalConditionsSummary),
      medicalConditionsDetails:
        body.medicalConditionsDetails === undefined
          ? undefined
          : normalizeString(body.medicalConditionsDetails),
      medicalTreatmentAuthorized:
        body.medicalTreatmentAuthorized === undefined
          ? undefined
          : body.medicalTreatmentAuthorized,
      liabilityWaiverAccepted:
        body.liabilityWaiverAccepted === undefined ? undefined : body.liabilityWaiverAccepted,
      codeOfConductAccepted:
        body.codeOfConductAccepted === undefined ? undefined : body.codeOfConductAccepted,
      refundPolicyAccepted:
        body.refundPolicyAccepted === undefined ? undefined : body.refundPolicyAccepted,
      playedPriorSeason:
        body.playedPriorSeason === undefined ? undefined : body.playedPriorSeason,
      priorSeasonTeamInfo:
        body.priorSeasonTeamInfo === undefined
          ? undefined
          : normalizeString(body.priorSeasonTeamInfo),
      streetAddress:
        body.streetAddress === undefined ? undefined : normalizeString(body.streetAddress),
      unit: body.unit === undefined ? undefined : normalizeString(body.unit),
      city: body.city === undefined ? undefined : normalizeString(body.city),
      state: body.state === undefined ? undefined : normalizeString(body.state),
      postalCode:
        body.postalCode === undefined ? undefined : normalizeString(body.postalCode),
      allStarAgeBand:
        body.allStarAgeBand === undefined
          ? undefined
          : normalizeAllStarAgeBand(body.allStarAgeBand),
    },
  });
  return NextResponse.json({ success: true, player: updated });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { playerId?: string };
  if (!body.playerId) {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  const player = await prisma.teamPlayer.findUnique({
    where: { id: body.playerId },
    include: { team: { select: { organizationId: true } } },
  });
  if (!player || player.team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  await prisma.teamPlayer.delete({ where: { id: player.id } });
  return NextResponse.json({ success: true });
}
