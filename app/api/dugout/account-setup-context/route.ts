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
  const user = await prisma.registeredUser.findFirst({
    where: {
      organizationId,
      email: { equals: email, mode: "insensitive" },
    },
    select: {
      organizationId: true,
      isCoach: true,
      firstName: true,
      lastName: true,
      contactPhone: true,
      ageGroup: true,
      assignedTeam: true,
      passwordHash: true,
    },
  });

  if (!user) {
    return NextResponse.json({
      isCoach: false,
      organizationId: null as string | null,
      profile: null,
    });
  }

  const isCoach = Boolean(user.isCoach);

  if (user.passwordHash) {
    return NextResponse.json({
      isCoach,
      organizationId: user.organizationId,
      profile: null,
    });
  }

  return NextResponse.json({
    isCoach,
    organizationId: user.organizationId,
    profile: {
      firstName: user.firstName?.trim() || "",
      lastName: user.lastName?.trim() || "",
      contactPhone: user.contactPhone?.trim() || "",
      ageGroup: user.ageGroup?.trim() || "",
      assignedTeam: user.assignedTeam?.trim() || "",
    },
  });
}
