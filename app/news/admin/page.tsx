import { redirect } from "next/navigation";

import { legacyNewsAdminRedirectPath } from "@/lib/admin/newsAdminHref";

/**
 * Bookmark redirect from /news/admin to /admin/news.
 * The destination page owns auth, so a signed-out visit returns to /admin/news
 * (with the same org and edit) after login, not back to this URL.
 */
export default async function LegacyNewsAdminRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyNewsAdminRedirectPath(await searchParams));
}
