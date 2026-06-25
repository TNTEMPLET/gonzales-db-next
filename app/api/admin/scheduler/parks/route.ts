import { NextResponse, type NextRequest } from "next/server";
import type { ScheduleAvailabilityType } from "@prisma/client";

import prisma from "@/lib/prisma";
import { jsonError, requireSchedulerAdmin, requestId } from "@/lib/scheduler/api";
import { parseDate, parseStringArray, requireString } from "@/lib/scheduler/validation";

const AVAILABILITY_TYPES = new Set(["AVAILABLE", "BLACKOUT"]);

type FieldPayload = {
  id?: unknown;
  name?: unknown;
  shortName?: unknown;
  supportedAgeGroups?: unknown;
  supportedDivisions?: unknown;
  fieldMetadata?: unknown;
  isActive?: unknown;
};

type AvailabilityPayload = {
  id?: unknown;
  seasonId?: unknown;
  parkId?: unknown;
  fieldId?: unknown;
  availabilityType?: unknown;
  date?: unknown;
  dayOfWeek?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  notes?: unknown;
};

type ParkPayload = {
  id?: unknown;
  name?: unknown;
  shortName?: unknown;
  address?: unknown;
  notes?: unknown;
  isActive?: unknown;
  fields?: FieldPayload[];
  availabilities?: AvailabilityPayload[];
  deleteFieldIds?: unknown;
  deleteAvailabilityIds?: unknown;
};

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseAvailabilityType(value: unknown): ScheduleAvailabilityType {
  if (typeof value !== "string") return "AVAILABLE" as ScheduleAvailabilityType;
  const normalized = value.trim().toUpperCase();
  if (!AVAILABILITY_TYPES.has(normalized)) throw new Error("Invalid availabilityType");
  return normalized as ScheduleAvailabilityType;
}

function parseDayOfWeek(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) {
    throw new Error("dayOfWeek must be an integer from 0 to 6");
  }
  return value;
}

function fieldData(body: FieldPayload, organizationId: string, parkId: string) {
  return {
    organizationId,
    parkId,
    name: requireString(body.name, "field.name"),
    shortName: nullableString(body.shortName),
    supportedAgeGroups: parseStringArray(body.supportedAgeGroups, "supportedAgeGroups"),
    supportedDivisions: parseStringArray(body.supportedDivisions, "supportedDivisions"),
    fieldMetadata: body.fieldMetadata && typeof body.fieldMetadata === "object" ? body.fieldMetadata : {},
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
  };
}

function availabilityData(body: AvailabilityPayload, organizationId: string, fallbackParkId: string) {
  return {
    organizationId,
    seasonId: nullableString(body.seasonId),
    parkId: nullableString(body.parkId) || fallbackParkId,
    fieldId: nullableString(body.fieldId),
    availabilityType: parseAvailabilityType(body.availabilityType),
    date: parseDate(body.date, "date"),
    dayOfWeek: parseDayOfWeek(body.dayOfWeek),
    startTime: nullableString(body.startTime),
    endTime: nullableString(body.endTime),
    notes: nullableString(body.notes),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const parks = await prisma.schedulePark.findMany({
      where: { organizationId: auth.organizationId },
      include: {
        fields: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
        availabilities: { orderBy: [{ date: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }] },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ organizationId: auth.organizationId, data: parks });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ParkPayload;
    const park = await prisma.schedulePark.create({
      data: {
        organizationId: auth.organizationId,
        name: requireString(body.name, "name"),
        shortName: nullableString(body.shortName),
        address: nullableString(body.address),
        notes: nullableString(body.notes),
        isActive: typeof body.isActive === "boolean" ? body.isActive : true,
      },
    });

    if (Array.isArray(body.fields) && body.fields.length) {
      await prisma.scheduleField.createMany({
        data: body.fields.map((field) => fieldData(field, auth.organizationId, park.id)),
      });
    }
    if (Array.isArray(body.availabilities) && body.availabilities.length) {
      await prisma.scheduleFieldAvailability.createMany({
        data: body.availabilities.map((availability) => availabilityData(availability, auth.organizationId, park.id)),
      });
    }

    const created = await prisma.schedulePark.findUnique({
      where: { id: park.id },
      include: { fields: true, availabilities: true },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ParkPayload;
    const id = requireString(body.id, "id");
    const existing = await prisma.schedulePark.findFirst({ where: { id, organizationId: auth.organizationId } });
    if (!existing) return NextResponse.json({ error: "Schedule park not found" }, { status: 404 });

    const park = await prisma.schedulePark.update({
      where: { id },
      data: {
        ...(typeof body.name === "string" ? { name: requireString(body.name, "name") } : {}),
        ...(body.shortName !== undefined ? { shortName: nullableString(body.shortName) } : {}),
        ...(body.address !== undefined ? { address: nullableString(body.address) } : {}),
        ...(body.notes !== undefined ? { notes: nullableString(body.notes) } : {}),
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
      },
    });

    if (Array.isArray(body.deleteFieldIds) && body.deleteFieldIds.length) {
      await prisma.scheduleField.deleteMany({ where: { organizationId: auth.organizationId, parkId: id, id: { in: body.deleteFieldIds.filter((value): value is string => typeof value === "string") } } });
    }
    if (Array.isArray(body.deleteAvailabilityIds) && body.deleteAvailabilityIds.length) {
      await prisma.scheduleFieldAvailability.deleteMany({ where: { organizationId: auth.organizationId, parkId: id, id: { in: body.deleteAvailabilityIds.filter((value): value is string => typeof value === "string") } } });
    }
    for (const field of Array.isArray(body.fields) ? body.fields : []) {
      const fieldId = nullableString(field.id);
      if (fieldId) {
        await prisma.scheduleField.updateMany({
          where: { id: fieldId, organizationId: auth.organizationId, parkId: id },
          data: fieldData(field, auth.organizationId, id),
        });
      } else {
        await prisma.scheduleField.create({ data: fieldData(field, auth.organizationId, id) });
      }
    }
    for (const availability of Array.isArray(body.availabilities) ? body.availabilities : []) {
      const availabilityId = nullableString(availability.id);
      if (availabilityId) {
        await prisma.scheduleFieldAvailability.updateMany({
          where: { id: availabilityId, organizationId: auth.organizationId, parkId: id },
          data: availabilityData(availability, auth.organizationId, id),
        });
      } else {
        await prisma.scheduleFieldAvailability.create({ data: availabilityData(availability, auth.organizationId, id) });
      }
    }

    const updated = await prisma.schedulePark.findUnique({ where: { id: park.id }, include: { fields: true, availabilities: true } });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const type = request.nextUrl.searchParams.get("type") || "park";
    const id = requestId(request, "id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (type === "field") {
      const deleted = await prisma.scheduleField.deleteMany({ where: { id, organizationId: auth.organizationId } });
      return NextResponse.json({ deleted: deleted.count });
    }
    if (type === "availability") {
      const deleted = await prisma.scheduleFieldAvailability.deleteMany({ where: { id, organizationId: auth.organizationId } });
      return NextResponse.json({ deleted: deleted.count });
    }
    const deleted = await prisma.schedulePark.deleteMany({ where: { id, organizationId: auth.organizationId } });
    return NextResponse.json({ deleted: deleted.count });
  } catch (error) {
    return jsonError(error);
  }
}
