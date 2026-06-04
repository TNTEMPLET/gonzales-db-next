import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAdminUserFromCookieToken, ADMIN_SESSION_COOKIE } from "@/lib/auth/adminSession";
import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import { isBracketOrgId } from "@/lib/siteConfig";
import { cookies } from "next/headers";

async function getAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminUserFromCookieToken(token);
  if (!user) return null;
  const role = toAdminRole(user.role, user.isMaster);
  if (!canAccessAdminModule(role, "PARK_INFO")) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const org = request.nextUrl.searchParams.get("org");
  if (!org || !isBracketOrgId(org)) {
    return NextResponse.json({ error: "Invalid org" }, { status: 400 });
  }
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.parkInfoPage.findUnique({ where: { organizationId: org } });
  return NextResponse.json({ data: row ?? { organizationId: org, rulesMarkdown: "", parkingMarkdown: "", fieldLayoutImageUrl: null } });
}

export async function POST(request: NextRequest) {
  const user = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    org: string;
    rulesMarkdown: string;
    parkingMarkdown: string;
    fieldLayoutImageUrl?: string | null;
  };

  if (!body.org || !isBracketOrgId(body.org)) {
    return NextResponse.json({ error: "Invalid org" }, { status: 400 });
  }

  const row = await prisma.parkInfoPage.upsert({
    where: { organizationId: body.org },
    create: {
      organizationId: body.org,
      rulesMarkdown: body.rulesMarkdown ?? "",
      parkingMarkdown: body.parkingMarkdown ?? "",
      fieldLayoutImageUrl: body.fieldLayoutImageUrl ?? null,
      updatedByAdminId: user.id,
    },
    update: {
      rulesMarkdown: body.rulesMarkdown ?? "",
      parkingMarkdown: body.parkingMarkdown ?? "",
      ...(body.fieldLayoutImageUrl !== undefined
        ? { fieldLayoutImageUrl: body.fieldLayoutImageUrl }
        : {}),
      updatedByAdminId: user.id,
    },
  });

  return NextResponse.json({ data: row });
}
