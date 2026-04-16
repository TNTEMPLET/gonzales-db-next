import { OAuth2Client } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
} from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

type GoogleLoginPayload = {
  credential?: string;
};

const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const client = googleClientId ? new OAuth2Client(googleClientId) : null;

export async function POST(request: NextRequest) {
  if (!googleClientId || !client) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as GoogleLoginPayload;
    const credential = body.credential || "";

    if (!credential) {
      return NextResponse.json(
        { error: "Missing Google credential" },
        { status: 400 },
      );
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();
    const sub = payload?.sub;
    const firstName = payload?.given_name?.trim() || null;
    const lastName = payload?.family_name?.trim() || null;
    const name =
      firstName || lastName
        ? [firstName, lastName].filter(Boolean).join(" ")
        : payload?.name?.trim() || null;
    const emailVerified = Boolean(payload?.email_verified);

    if (!email || !sub || !emailVerified) {
      return NextResponse.json(
        { error: "Google account email is not verified" },
        { status: 401 },
      );
    }

    await prisma.registeredUser.upsert({
      where: { email },
      create: {
        email,
        name,
        firstName,
        lastName,
        googleSub: sub,
      },
      update: {
        name,
        firstName,
        lastName,
        googleSub: sub,
      },
    });

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    const response = NextResponse.json({
      success: true,
      isAdmin: Boolean(admin),
      user: { email, name },
    });

    if (admin) {
      const session = await createAdminSession(admin.id);
      response.cookies.set({
        name: ADMIN_SESSION_COOKIE,
        value: session.token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: session.expiresAt,
      });
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Google sign-in failed: ${message}` },
      { status: 500 },
    );
  }
}
