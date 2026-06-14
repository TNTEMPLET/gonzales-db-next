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

  const registeredUser = await withTransientDbRetry(() =>
    prisma.registeredUser.findFirst({
      where: {
        organizationId: getDugoutRegisteredUserOrgId(),
        email: adminUser.email,
      },
    }),
  );

  if (registeredUser) {
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
  }

  return response;
}
