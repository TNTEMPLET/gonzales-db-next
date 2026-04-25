import { OAuth2Client } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
} from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { upsertRegisteredUserFromGoogle } from "@/lib/auth/registeredUserAuth";
import { isMasterDeployment } from "@/lib/siteConfig";

type GoogleLoginPayload = {
  credential?: string;
};

const googleClientId =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "";
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

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "Google token validation failed. Verify GOOGLE_CLIENT_ID/NEXT_PUBLIC_GOOGLE_CLIENT_ID and Google authorized origins for this domain.",
        },
        { status: 401 },
      );
    }

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

    await upsertRegisteredUserFromGoogle({
      email,
      sub,
      name,
      firstName,
      lastName,
    });

    const admin = await prisma.adminUser.findUnique({ where: { email } });

    const canCreateAdminSession = Boolean(
      admin && (!isMasterDeployment() || admin.isMaster),
    );

    const response = NextResponse.json({
      success: true,
      isAdmin: canCreateAdminSession,
      user: { email, name },
    });

    if (admin && canCreateAdminSession) {
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
