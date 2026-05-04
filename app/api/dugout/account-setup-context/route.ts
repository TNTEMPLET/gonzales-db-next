import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";
import { getDefaultContentOrg, getOrgId } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

function registeredUserOrgId(): ContentOrgId {
  const org = getOrgId();
  if (org === "master") return getDefaultContentOrg();
  return org;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Returns existing coach profile fields for the account-setup form.
 * Only responds for users in this deployment's org who have not set a local password yet
 * (first-time setup / password creation flow).
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

  const organizationId = registeredUserOrgId();
  const user = await prisma.registeredUser.findFirst({
    where: {
      organizationId,
      email: { equals: email, mode: "insensitive" },
    },
    select: {
      firstName: true,
      lastName: true,
      contactPhone: true,
      ageGroup: true,
      assignedTeam: true,
      passwordHash: true,
    },
  });

  if (!user || user.passwordHash) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({
    profile: {
      firstName: user.firstName?.trim() || "",
      lastName: user.lastName?.trim() || "",
      contactPhone: user.contactPhone?.trim() || "",
      ageGroup: user.ageGroup?.trim() || "",
      assignedTeam: user.assignedTeam?.trim() || "",
    },
  });
}
