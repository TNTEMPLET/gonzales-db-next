import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";

export type GameDayParkChoice = {
  id: string;
  label: string;
};

/** League field desk loads only when this user has Game Day on that org. */
export function mayLoadLeagueGameDay(roleOnOrg: AdminRole | null): boolean {
  return Boolean(roleOnOrg && canAccessAdminModule(roleOnOrg, "GAME_DAY"));
}

/**
 * One assigned park opens on its own. Several parks wait for a tap.
 * An unknown park id does not guess.
 */
export function chooseGameDayPark(
  parks: readonly GameDayParkChoice[],
  requested: string | null | undefined,
): { parks: GameDayParkChoice[]; selectedId: string | null; needsChoice: boolean } {
  const seen = new Set<string>();
  const unique: GameDayParkChoice[] = [];
  for (const park of parks) {
    const id = park.id.trim();
    const label = park.label.trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    unique.push({ id, label });
  }
  unique.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  if (unique.length <= 1) {
    return { parks: unique, selectedId: unique[0]?.id ?? null, needsChoice: false };
  }
  const request = requested?.trim() ?? "";
  if (request && seen.has(request)) {
    return { parks: unique, selectedId: request, needsChoice: false };
  }
  return { parks: unique, selectedId: null, needsChoice: true };
}

/** Assigned venues drive the list. Admins and unassigned directors stay on the league field desk. */
export function gameDayDataMode(input: {
  isMaster: boolean;
  roleIsParkDirector: boolean;
  activeAssignmentCount: number;
}): "assigned" | "league" {
  if (input.isMaster || !input.roleIsParkDirector) return "league";
  if (input.activeAssignmentCount <= 0) return "league";
  return "assigned";
}
