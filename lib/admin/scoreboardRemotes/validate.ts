import { SCOREBOARD_CONTROLLER_STATUSES, type ScoreboardControllerStatus } from "@/lib/admin/scoreboardRemotes/present";

export type RemoteControllerWrite = {
  label: string;
  homeFieldName: string | null;
  notes: string | null;
  status?: ScoreboardControllerStatus;
};

export function parseRemoteLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/\s+/g, " ").trim();
  if (!label || label.length > 40) return null;
  return label;
}

export function parseOptionalText(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function parseControllerStatus(value: unknown): ScoreboardControllerStatus | null {
  if (typeof value !== "string") return null;
  const status = value.trim().toUpperCase();
  if (!SCOREBOARD_CONTROLLER_STATUSES.includes(status as ScoreboardControllerStatus)) return null;
  return status as ScoreboardControllerStatus;
}

export function parseRemoteControllerWrite(
  input: {
    label: unknown;
    homeFieldName?: unknown;
    notes?: unknown;
    status?: unknown;
  },
  options: { requireStatus: boolean },
): { ok: true; value: RemoteControllerWrite } | { ok: false; error: string } {
  const label = parseRemoteLabel(input.label);
  if (!label) return { ok: false, error: "Enter the label from the sticker on the remote." };
  const status = input.status == null || input.status === "" ? null : parseControllerStatus(input.status);
  if (options.requireStatus && !status) {
    return { ok: false, error: "Choose active, missing, repair, or retired." };
  }
  if (input.status != null && input.status !== "" && !status) {
    return { ok: false, error: "Choose active, missing, repair, or retired." };
  }
  return {
    ok: true,
    value: {
      label,
      homeFieldName: parseOptionalText(input.homeFieldName, 80),
      notes: parseOptionalText(input.notes, 500),
      ...(status ? { status } : {}),
    },
  };
}
