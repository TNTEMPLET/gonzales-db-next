import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import DugoutModerationPanel from "@/components/admin/DugoutModerationPanel";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";

export const metadata = {
  title: "Dugout Moderation | Gonzales Diamond Baseball",
  description: "Edit and delete Dugout feed posts as an admin.",
};

export default async function AdminDugoutPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/dugout");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full">
              FEED MODERATION
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/admin" className="text-zinc-300 hover:text-white">
                Admin Dashboard
              </Link>
              <Link
                href="/dugout"
                className="text-brand-gold hover:text-brand-gold/80"
              >
                View Public Dugout
              </Link>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Dugout Moderation
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Review, edit, and remove dugout posts to keep coach communication
            clear and appropriate.
          </p>
        </div>

        <DugoutModerationPanel />
      </section>
    </main>
  );
}
