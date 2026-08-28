import { SchedulerError } from "./types";

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SchedulerError(`${field} is required`, "INVALID_INPUT", { field });
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new SchedulerError(`${field} must be an ISO date string`, "INVALID_INPUT", { field });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SchedulerError(`${field} must be a valid date`, "INVALID_INPUT", { field, value });
  }
  return date;
}

export function parseStringArray(value: unknown, field: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SchedulerError(`${field} must be an array`, "INVALID_INPUT", { field });
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function addMinutes(time: string, minutesToAdd: number): string {
  const minutes = timeToMinutes(time);
  if (minutes === null) return time;
  const total = minutes + minutesToAdd;
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function schedulerErrorResponse(error: unknown): { error: string; code?: string; details?: unknown; status: number } {
  if (error instanceof SchedulerError) {
    return { error: error.message, code: error.code, details: error.details, status: 400 };
  }
  const message = error instanceof Error ? error.message : "Unknown scheduler error";
  return { error: message, status: 500 };
}
