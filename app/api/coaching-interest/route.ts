import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getDefaultContentOrg } from "@/lib/siteConfig";

type CoachingInterestBody = {
  firstName?: string;
  lastName?: string;
  email?: string;
  cellPhone?: string;
  interestedDivision?: string;
  rolePreference?: "HEAD_COACH" | "ASSISTANT_COACH" | "EITHER";
  hasCoachedBefore?: boolean;
  priorDivision?: string | null;
  notes?: string | null;
};

const ROLE_PREFERENCES = new Set(["HEAD_COACH", "ASSISTANT_COACH", "EITHER"]);

function clean(value: unknown, maxLength = 255) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : "";
}

function normalizeEmail(value: unknown) {
  return clean(value, 320).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: unknown) {
  return clean(value, 40);
}

function rolePreference(value: unknown): "HEAD_COACH" | "ASSISTANT_COACH" | "EITHER" {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ROLE_PREFERENCES.has(normalized)
    ? (normalized as "HEAD_COACH" | "ASSISTANT_COACH" | "EITHER")
    : "EITHER";
}

export async function POST(request: NextRequest) {
  const organizationId = getDefaultContentOrg();
  if (organizationId !== "fallball") {
    return NextResponse.json(
      { error: "Coaching interest is only available for Fall Ball right now." },
      { status: 404 },
    );
  }

  let body: CoachingInterestBody;
  try {
    body = (await request.json()) as CoachingInterestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = normalizeEmail(body.email);
  const cellPhone = normalizePhone(body.cellPhone);
  const interestedDivision = clean(body.interestedDivision, 120);
  const priorDivision = clean(body.priorDivision, 120) || null;
  const notes = clean(body.notes, 1000) || null;
  const hasCoachedBefore = Boolean(body.hasCoachedBefore);

  const errors: string[] = [];
  if (!firstName) errors.push("First name is required.");
  if (!lastName) errors.push("Last name is required.");
  if (!email || !isValidEmail(email)) errors.push("A valid email is required.");
  if (!cellPhone) errors.push("Cell phone is required.");
  if (!interestedDivision) errors.push("Interested age group or division is required.");
  if (hasCoachedBefore && !priorDivision) {
    errors.push("Please tell us which division you coached before.");
  }
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  const submission = await prisma.coachingInterestSubmission.upsert({
    where: {
      organizationId_email: {
        organizationId,
        email,
      },
    },
    create: {
      organizationId,
      firstName,
      lastName,
      email,
      cellPhone,
      interestedDivision,
      rolePreference: rolePreference(body.rolePreference),
      hasCoachedBefore,
      priorDivision,
      notes,
    },
    update: {
      firstName,
      lastName,
      cellPhone,
      interestedDivision,
      rolePreference: rolePreference(body.rolePreference),
      hasCoachedBefore,
      priorDivision,
      notes,
    },
    select: {
      id: true,
      status: true,
    },
  });

  return NextResponse.json({ data: submission });
}
