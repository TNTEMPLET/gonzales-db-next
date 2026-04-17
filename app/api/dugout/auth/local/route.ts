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

type LocalAuthPayload = {
  mode?: "login" | "signup";
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
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
      const existing = await prisma.registeredUser.findUnique({
        where: { email },
      });

      const user = existing
        ? await prisma.registeredUser.update({
            where: { id: existing.id },
            data: {
              passwordHash,
              firstName: existing.firstName || firstName,
              lastName: existing.lastName || lastName,
              name:
                existing.name ||
                displayName(
                  existing.firstName || firstName,
                  existing.lastName || lastName,
                ),
            },
          })
        : await prisma.registeredUser.create({
            data: {
              email,
              firstName,
              lastName,
              name: displayName(firstName, lastName),
              passwordHash,
            },
          });

      const admin = await prisma.adminUser.findUnique({ where: { email } });

      const response = NextResponse.json({
        success: true,
        isAdmin: Boolean(admin),
        isCoach: Boolean(user.isCoach),
        linkedGoogle: Boolean(user.googleSub),
        user: { email: user.email, name: user.name },
      });

      const session = await createCoachSession(user.id);
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

    const user = await prisma.registeredUser.findUnique({ where: { email } });

    // Allow admin-local sign in even when there's no linked RegisteredUser local password.
    const adminAuth = await verifyAdminCredentials(email, password);
    if (adminAuth) {
      const adminSession = await createAdminSession(adminAuth.id);
      const response = NextResponse.json({
        success: true,
        isAdmin: true,
        linkedGoogle: Boolean(user?.googleSub),
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

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        {
          error:
            "No local login found for this email. Use Google sign-in or create a local password.",
          canRegister: true,
        },
        { status: 404 },
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    const response = NextResponse.json({
      success: true,
      isAdmin: Boolean(admin),
      isCoach: Boolean(user.isCoach),
      linkedGoogle: Boolean(user.googleSub),
      user: { email: user.email, name: user.name },
    });

    const session = await createCoachSession(user.id);
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
