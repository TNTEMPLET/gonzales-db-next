import { cookies } from "next/headers";

import {
  ADMIN_SESSION_COOKIE,
  getAdminUserByToken,
} from "@/lib/auth/adminSession";
import {
  COACH_SESSION_COOKIE,
  getCoachUserFromCookieToken,
  type CoachSessionUser,
} from "@/lib/auth/coachSession";
import type { AdminSessionUser } from "@/lib/auth/adminSession";

export type ShopAccess = {
  /** True when a registered site user or admin may view merch. */
  allowed: boolean;
  coach: CoachSessionUser | null;
  admin: AdminSessionUser | null;
};

/**
 * Shop is members-only: any non-blocked registered user session
 * (parents/players/coaches via gdb_coach_session) or an admin session.
 * Does not require coach flag — championship shirts are for families too.
 */
export async function getShopAccess(): Promise<ShopAccess> {
  const cookieStore = await cookies();
  const coachToken = cookieStore.get(COACH_SESSION_COOKIE)?.value;
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const [coach, admin] = await Promise.all([
    getCoachUserFromCookieToken(coachToken),
    getAdminUserByToken(adminToken),
  ]);

  const coachOk = Boolean(coach && !coach.isBlocked);
  const adminOk = Boolean(admin);

  return {
    allowed: coachOk || adminOk,
    coach: coachOk ? coach : null,
    admin: adminOk ? admin : null,
  };
}
