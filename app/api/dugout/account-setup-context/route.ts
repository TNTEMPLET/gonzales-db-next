import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getDugoutRegisteredUserOrgId } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Returns profile + coach flag for the account-setup form.
 * Profile is only included when the user has not set a local password yet
 * (first-time password / setup flow).
 */
export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email ? normalizeEmail(body.email) : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const organizationId = getDugoutRegisteredUserOrgId();
  // Global identity by email; per-org coach/age/team live on the profile.
  const globalUser = await prisma.registeredUser.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      contactPhone: true,
      passwordHash: true,
    },
  });

  if (!globalUser) {
    return NextResponse.json({
      isCoach: false,
      organizationId: null as string | null,
      profile: null,
    });
  }

  const prof = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: { registeredUserId: globalUser.id, organizationId },
    },
    select: { isCoach: true, ageGroup: true, assignedTeam: true },
  });

  const isCoach = Boolean(prof?.isCoach);

  if (globalUser.passwordHash) {
    return NextResponse.json({
      isCoach,
      organizationId,
      profile: null,
    });
  }

  return NextResponse.json({
    isCoach,
    organizationId,
    profile: {
      firstName: globalUser.firstName?.trim() || "",
      lastName: globalUser.lastName?.trim() || "",
      contactPhone: globalUser.contactPhone?.trim() || "",
      ageGroup: prof?.ageGroup?.trim() || "",
      assignedTeam: prof?.assignedTeam?.trim() || "",
    },
  });
}
