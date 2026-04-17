import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { isCoach?: boolean };

  if (typeof body.isCoach !== "boolean") {
    return NextResponse.json(
      { error: "isCoach (boolean) required" },
      { status: 400 },
    );
  }

  const user = await prisma.registeredUser.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.registeredUser.update({
    where: { id },
    data: { isCoach: body.isCoach },
  });

  return NextResponse.json({ user: updated });
}
