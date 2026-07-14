import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
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
  if (!isCoachingInterestEnabled(organizationId)) {
    return NextResponse.json(
      { error: "Coaching interest is not enabled for this site." },
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

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("coaching-interest: DATABASE_URL is not set");
    return NextResponse.json(
      {
        error:
          "Database is not configured for this site. Please contact the league administrator.",
      },
      { status: 503 },
    );
  }

  try {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("coaching-interest upsert failed", message);
    const looksLikeDb = /database|prisma|can.?t reach|P1001|P1013|P2021|connect|server at/i.test(
      message,
    );
    return NextResponse.json(
      {
        error: looksLikeDb
          ? "We could not save your interest right now (database unavailable). Please try again in a few minutes or email the league."
          : "Unable to save coaching interest. Please try again.",
      },
      { status: 500 },
    );
  }
}
