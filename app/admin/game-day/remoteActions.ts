"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  checkInScoreboardRemote,
  checkoutScoreboardRemote,
  createScoreboardController,
  updateScoreboardController,
} from "@/lib/admin/scoreboardRemotes/mutate";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { isContentOrgId } from "@/lib/siteConfig";

export type RemoteActionState = { error: string | null };

async function currentAdmin() {
  return getAdminUserFromCookieToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
}

function refreshRemotes() {
  revalidatePath("/admin/game-day");
  revalidatePath("/admin/game-day/remotes");
}

export async function checkoutRemoteAction(
  _prev: RemoteActionState,
  formData: FormData,
): Promise<RemoteActionState> {
  const admin = await currentAdmin();
  if (!admin) return { error: "Sign in again to update remotes." };
  const result = await checkoutScoreboardRemote(admin, {
    gameId: String(formData.get("gameId") || ""),
    controllerId: String(formData.get("controllerId") || ""),
    side: String(formData.get("side") || ""),
    volunteerName: String(formData.get("volunteerName") || ""),
  });
  if (!result.ok) return { error: result.error };
  refreshRemotes();
  return { error: null };
}

export async function checkInRemoteAction(
  _prev: RemoteActionState,
  formData: FormData,
): Promise<RemoteActionState> {
  const admin = await currentAdmin();
  if (!admin) return { error: "Sign in again to update remotes." };
  const result = await checkInScoreboardRemote(admin, String(formData.get("checkoutId") || ""));
  if (!result.ok) return { error: result.error };
  refreshRemotes();
  return { error: null };
}

export async function createRemoteAction(
  _prev: RemoteActionState,
  formData: FormData,
): Promise<RemoteActionState> {
  const admin = await currentAdmin();
  if (!admin) return { error: "Sign in again to update remotes." };
  const orgId = String(formData.get("org") || "");
  if (!isContentOrgId(orgId)) return { error: "Unknown league." };
  const result = await createScoreboardController(admin, {
    orgId,
    venueId: String(formData.get("venueId") || ""),
    label: formData.get("label"),
    homeFieldName: formData.get("homeFieldName"),
    notes: formData.get("notes"),
  });
  if (!result.ok) return { error: result.error };
  refreshRemotes();
  return { error: null };
}

export async function updateRemoteAction(
  _prev: RemoteActionState,
  formData: FormData,
): Promise<RemoteActionState> {
  const admin = await currentAdmin();
  if (!admin) return { error: "Sign in again to update remotes." };
  const orgId = String(formData.get("org") || "");
  if (!isContentOrgId(orgId)) return { error: "Unknown league." };
  const result = await updateScoreboardController(admin, {
    orgId,
    controllerId: String(formData.get("controllerId") || ""),
    label: formData.get("label"),
    homeFieldName: formData.get("homeFieldName"),
    notes: formData.get("notes"),
    status: formData.get("status"),
  });
  if (!result.ok) return { error: result.error };
  refreshRemotes();
  return { error: null };
}
