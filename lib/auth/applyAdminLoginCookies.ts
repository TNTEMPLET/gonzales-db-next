import type { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
} from "@/lib/auth/adminSession";
import {
  COACH_SESSION_COOKIE,
  createCoachSession,
} from "@/lib/auth/coachSession";
import prisma from "@/lib/prisma";
import { withTransientDbRetry } from "@/lib/prismaRetry";
import { getDugoutRegisteredUserOrgId } from "@/lib/siteConfig";

async function safeCreateCoachSessionForAdmin(
  response: NextResponse,
  adminUser: { email: string },
) {
  try {
    const orgId = getDugoutRegisteredUserOrgId();
    // Global identity: find by email, then ensure a profile exists for the dugout org bucket.
    const registeredUser = await withTransientDbRetry(async () => {
      const byEmail = await prisma.registeredUser.findFirst({
        where: { email: { equals: adminUser.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!byEmail) return null;
      // Ensure profile (create if missing) so downstream coach gates see the person for this org.
      await (prisma as any).registeredUserOrgProfile.upsert({
        where: {
          registeredUserId_organizationId: { registeredUserId: byEmail.id, organizationId: orgId },
        },
        create: {
          registeredUserId: byEmail.id,
          organizationId: orgId,
          isCoach: false,
          ageGroup: null,
          assignedTeam: null,
        },
        update: {},
      });
      return byEmail;
    });

    if (!registeredUser) return;

    const coachSession = await createCoachSession(registeredUser.id);
    response.cookies.set({
      name: COACH_SESSION_COOKIE,
      value: coachSession.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      expires: coachSession.expiresAt,
    });
  } catch (error) {
    console.error("Optional coach session setup failed during admin login:", error);
  }
}

export async function applyAdminLoginCookies(
  response: NextResponse,
  adminUser: { id: string; email: string },
) {
  const session = await withTransientDbRetry(() =>
    createAdminSession(adminUser.id),
  );

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    expires: session.expiresAt,
  });

  await safeCreateCoachSessionForAdmin(response, adminUser);

  return response;
}
