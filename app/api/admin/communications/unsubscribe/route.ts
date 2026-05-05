import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/communications/unsubscribeToken";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid unsubscribe token" }, { status: 400 });
  }
  if (decoded.channel === "EMAIL") {
    if (decoded.organizationId) {
      await prisma.emailSuppression.upsert({
        where: {
          organizationId_email: {
            organizationId: decoded.organizationId,
            email: decoded.email,
          },
        },
        update: { reason: "user_unsubscribe" },
        create: {
          organizationId: decoded.organizationId,
          email: decoded.email,
          reason: "user_unsubscribe",
        },
      });
    } else {
      const existing = await prisma.emailSuppression.findFirst({
        where: {
          organizationId: null,
          email: decoded.email,
        },
      });
      if (existing) {
        await prisma.emailSuppression.update({
          where: { id: existing.id },
          data: { reason: "user_unsubscribe" },
        });
      } else {
        await prisma.emailSuppression.create({
          data: {
            organizationId: null,
            email: decoded.email,
            reason: "user_unsubscribe",
          },
        });
      }
    }
  }
  return NextResponse.json({ success: true });
}
