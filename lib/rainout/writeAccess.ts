import type { AdminRole } from "@/lib/auth/adminRoles";

/** Shown when someone who may not write tries to set or clear a rainout. */
export const RAINOUT_WRITE_DENIED_MESSAGE = "Only league admins can set rainouts.";

export type RainoutWritePath = "game-day" | "park-alerts";

export type RainoutActor = {
  isMaster: boolean;
  /** Effective role on the league whose rainout is being changed. */
  role: AdminRole | null;
  /**
   * Roles on other leagues. They never grant a write.
   * A park director who is also a board member elsewhere stays denied.
   */
  otherRoles?: readonly (AdminRole | null)[];
};

export type RainoutWriteDecision =
  | { allowed: true }
  | { allowed: false; status: 403; message: typeof RAINOUT_WRITE_DENIED_MESSAGE };

const DENIED: RainoutWriteDecision = {
  allowed: false,
  status: 403,
  message: RAINOUT_WRITE_DENIED_MESSAGE,
};

function isLeagueAdmin(role: AdminRole | null): boolean {
  return role === "MASTER_ADMIN" || role === "ADMIN";
}

/**
 * Who may set or clear a rainout.
 *
 * Master admins and league admins (ADMIN) may on every path. That is who
 * manages rainouts today.
 * Board members may on Game Day, which is how they manage rainouts today,
 * and may not on park alerts (that module stays league-admin only).
 * Park directors may not on any path. `otherRoles` is not a grant: a board
 * role on another league does not raise a park director.
 */
export function decideRainoutWrite(input: RainoutActor & { path: RainoutWritePath }): RainoutWriteDecision {
  if (input.isMaster || isLeagueAdmin(input.role)) return { allowed: true };
  if (input.role === "PARK_DIRECTOR") return DENIED;
  if (input.path === "game-day" && input.role === "BOARD_MEMBER") return { allowed: true };
  return DENIED;
}
