import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  canAccessAdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import {
  DEFAULT_REGISTRATION_WINDOWS,
  fromDatetimeLocalInput,
  getRegistrationWindow,
  isRegistrationWindowOpen,
  isValidRegistrationLocal,
} from "@/lib/registrationStatus";
import prisma from "@/lib/prisma";
import {
  isContentOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";

async function requireMasterAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminUserFromCookieToken(token);
  if (!user?.isMaster) return null;
  const role: AdminRole = "MASTER_ADMIN";
  if (!canAccessAdminModule(role, "REGISTRATION_WINDOWS")) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const user = await requireMasterAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgParam = request.nextUrl.searchParams.get("org");
  if (!orgParam || !isContentOrgId(orgParam)) {
    return NextResponse.json(
      { error: "Select a content org (gonzales, ascension, or fallball)." },
      { status: 400 },
    );
  }

  const window = await getRegistrationWindow(orgParam);
  const defaults = DEFAULT_REGISTRATION_WINDOWS[orgParam];

  return NextResponse.json({
    data: {
      organizationId: orgParam,
      startLocal: window.startLocal,
      endLocal: window.endLocal,
      source: window.source,
      isOpenNow: isRegistrationWindowOpen(window),
      defaults,
      timezone: "America/Chicago",
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await requireMasterAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    startLocal?: string;
    endLocal?: string;
    resetToDefaults?: boolean;
  };

  if (!body.organizationId || !isContentOrgId(body.organizationId)) {
    return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
  }

  const org = body.organizationId as ContentOrgId;
  let startLocal: string;
  let endLocal: string;

  if (body.resetToDefaults) {
    startLocal = DEFAULT_REGISTRATION_WINDOWS[org].startLocal;
    endLocal = DEFAULT_REGISTRATION_WINDOWS[org].endLocal;
  } else {
    startLocal = fromDatetimeLocalInput(String(body.startLocal ?? ""));
    endLocal = fromDatetimeLocalInput(String(body.endLocal ?? ""));
  }

  if (!isValidRegistrationLocal(startLocal) || !isValidRegistrationLocal(endLocal)) {
    return NextResponse.json(
      {
        error:
          "Start and end must be valid America/Chicago datetimes (YYYY-MM-DDTHH:mm or with seconds).",
      },
      { status: 400 },
    );
  }

  if (startLocal >= endLocal) {
    return NextResponse.json(
      { error: "Start must be before end." },
      { status: 400 },
    );
  }

  try {
    const row = await prisma.orgRegistrationWindow.upsert({
      where: { organizationId: org },
      create: {
        organizationId: org,
        startLocal,
        endLocal,
        updatedByAdminId: user.id,
      },
      update: {
        startLocal,
        endLocal,
        updatedByAdminId: user.id,
      },
    });

    const window = {
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      source: "database" as const,
    };

    return NextResponse.json({
      data: {
        organizationId: org,
        startLocal: row.startLocal,
        endLocal: row.endLocal,
        source: "database",
        isOpenNow: isRegistrationWindowOpen(window),
        defaults: DEFAULT_REGISTRATION_WINDOWS[org],
        timezone: "America/Chicago",
        updatedAt: row.updatedAt,
      },
    });
  } catch (err) {
    console.error("registration-windows POST failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save. Ensure the OrgRegistrationWindow migration is applied.",
      },
      { status: 500 },
    );
  }
}

