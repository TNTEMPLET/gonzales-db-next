import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  verifyAdminCredentials,
} from "@/lib/auth/adminSession";
import {
  COACH_SESSION_COOKIE,
  createCoachSession,
} from "@/lib/auth/coachSession";
import prisma from "@/lib/prisma";
import {
  getRegisteredUserWithOrgProfile,
  upsertRegisteredUserFromGoogle, // not used here, but for symmetry
} from "@/lib/auth/registeredUserAuth";
import { recordDuplicateCandidatesForNewUser } from "@/lib/registeredUserDuplicates";
import { getDugoutRegisteredUserOrgId } from "@/lib/siteConfig";

const orgId = getDugoutRegisteredUserOrgId();

type LocalAuthPayload = {
  mode?: "login" | "signup";
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  contactPhone?: string;
  ageGroup?: string;
  assignedTeam?: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function displayName(firstName: string | null, lastName: string | null) {
  return firstName || lastName
    ? [firstName, lastName].filter(Boolean).join(" ")
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LocalAuthPayload;
    const mode = body.mode || "login";
    const email = body.email ? normalizeEmail(body.email) : "";
    const password = body.password || "";
    const firstName = body.firstName?.trim() || null;
    const lastName = body.lastName?.trim() || null;
    const contactPhone = body.contactPhone?.trim() || null;
    const ageGroup = body.ageGroup?.trim() || null;
    const assignedTeam = body.assignedTeam?.trim() || null;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    if (mode === "signup") {
      const passwordHash = await bcrypt.hash(password, 10);

      // Global identity (by email)
      let globalUser = await prisma.registeredUser.findFirst({
        where: { email },
        select: { id: true, email: true, name: true, firstName: true, lastName: true, googleSub: true, isBlocked: true },
      });

      if (globalUser) {
        globalUser = await prisma.registeredUser.update({
          where: { id: globalUser.id },
          data: {
            passwordHash,
            firstName,
            lastName,
            name: displayName(firstName, lastName),
            contactPhone,
          },
          select: { id: true, email: true, name: true, firstName: true, lastName: true, googleSub: true, isBlocked: true },
        });
      } else {
        globalUser = await prisma.registeredUser.create({
          data: {
            email,
            firstName,
            lastName,
            name: displayName(firstName, lastName),
            passwordHash,
            contactPhone,
          },
          select: { id: true, email: true, name: true, firstName: true, lastName: true, googleSub: true, isBlocked: true },
        });
        await recordDuplicateCandidatesForNewUser(prisma, {
          id: globalUser.id,
          firstName,
          lastName,
          name: displayName(firstName, lastName),
        });
      }

      // Ensure per-org profile with the supplied context values
      await prisma.registeredUserOrgProfile.upsert({
        where: {
          registeredUserId_organizationId: { registeredUserId: globalUser.id, organizationId: orgId },
        },
        create: {
          registeredUserId: globalUser.id,
          organizationId: orgId,
          isCoach: false, // explicit signup does not auto-grant coach; caller may toggle later
          ageGroup,
          assignedTeam,
        },
        update: {
          ageGroup,
          assignedTeam,
        },
      });

      if (globalUser.isBlocked) {
        return NextResponse.json(
          {
            error:
              "This account has been blocked and cannot access the application",
          },
          { status: 403 },
        );
      }

      const admin = await prisma.adminUser.findUnique({ where: { email } });

      const response = NextResponse.json({
        success: true,
        isAdmin: Boolean(admin),
        isCoach: false, // fresh profile for this org
        linkedGoogle: Boolean(globalUser.googleSub),
        user: { email: globalUser.email, name: globalUser.name },
      });

      const session = await createCoachSession(globalUser.id);
      response.cookies.set({
        name: COACH_SESSION_COOKIE,
        value: session.token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: session.expiresAt,
      });

      if (admin) {
        const adminSession = await createAdminSession(admin.id);
        response.cookies.set({
          name: ADMIN_SESSION_COOKIE,
          value: adminSession.token,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          expires: adminSession.expiresAt,
        });
      }

      return response;
    }

    // LOGIN (non-signup)
    const globalUser = await prisma.registeredUser.findFirst({
      where: { email },
      select: { id: true, email: true, name: true, googleSub: true, isBlocked: true, passwordHash: true },
    });

    // Allow admin-local sign in even when there's no linked RegisteredUser local password.
    const adminAuth = await verifyAdminCredentials(email, password);
    if (adminAuth) {
      const adminSession = await createAdminSession(adminAuth.id);
      const response = NextResponse.json({
        success: true,
        isAdmin: true,
        linkedGoogle: Boolean(globalUser?.googleSub),
        user: { email: adminAuth.email, name: adminAuth.name },
      });

      response.cookies.set({
        name: ADMIN_SESSION_COOKIE,
        value: adminSession.token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: adminSession.expiresAt,
      });

      return response;
    }

    if (!globalUser || !globalUser.passwordHash) {
      return NextResponse.json(
        {
          error: globalUser
            ? "Finish account setup to create your password and confirm your profile."
            : "No local login found for this email. Use Google sign-in or create a local password.",
          canRegister: true,
          email,
          isCoach: false,
          setupProfile: globalUser
            ? {
                firstName: (globalUser as any).firstName || "",
                lastName: (globalUser as any).lastName || "",
                contactPhone: (globalUser as any).contactPhone || "",
                // We don't have per-org values here without loading the profile; leave minimal
                ageGroup: "",
                assignedTeam: "",
              }
            : null,
        },
        { status: 404 },
      );
    }

    const valid = await bcrypt.compare(password, globalUser.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Check if user is blocked (global)
    if (globalUser.isBlocked) {
      return NextResponse.json(
        {
          error:
            "This account has been blocked and cannot access the application",
        },
        { status: 403 },
      );
    }

    // Ensure/load the org profile to get the effective isCoach for responses
    const withProfile = await getRegisteredUserWithOrgProfile(globalUser.id, orgId);
    const effectiveIsCoach = withProfile ? withProfile.isCoach : false;

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    const response = NextResponse.json({
      success: true,
      isAdmin: Boolean(admin),
      isCoach: effectiveIsCoach,
      linkedGoogle: Boolean(globalUser.googleSub),
      user: { email: globalUser.email, name: globalUser.name },
    });

    const session = await createCoachSession(globalUser.id);
    response.cookies.set({
      name: COACH_SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });

    if (admin) {
      const adminSession = await createAdminSession(admin.id);
      response.cookies.set({
        name: ADMIN_SESSION_COOKIE,
        value: adminSession.token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: adminSession.expiresAt,
      });
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Local auth failed: ${message}` },
      { status: 500 },
    );
  }
}
