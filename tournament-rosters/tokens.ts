import { createHash, randomBytes } from "crypto";

import prisma from "@/lib/prisma";

export function createRosterIntakeToken(): string {
  return randomBytes(24).toString("base64url");
}

export function rosterTokenHash(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export async function findActiveRosterLinkByToken(token: string) {
  const tokenHash = rosterTokenHash(token);
  const link = await prisma.tournamentRosterIntakeLink.findUnique({
    where: { tokenHash },
    include: {
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { players: { orderBy: { rowNumber: "asc" } } },
      },
    },
  });
  if (!link) return null;
  if (link.status !== "ACTIVE") return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}
