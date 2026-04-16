import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import NewsAdminPanel from "@/components/news/NewsAdminPanel";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";

export const metadata = {
  title: "News Admin | Gonzales Diamond Baseball",
  description: "Create and manage Gonzales Diamond Baseball news posts.",
};

export default async function NewsAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/news/admin");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full">
              CONTENT MANAGEMENT
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/admin/users"
                className="text-zinc-300 hover:text-white"
              >
                Manage Admin Users
              </Link>
              <Link
                href="/news"
                className="text-brand-gold hover:text-brand-gold/80"
              >
                View Public News
              </Link>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            News Admin
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Manage published announcements and drafts from one place.
          </p>
        </div>

        <NewsAdminPanel
          adminEmail={adminUser.email}
          adminName={
            adminUser.firstName || adminUser.lastName
              ? [adminUser.firstName, adminUser.lastName]
                  .filter(Boolean)
                  .join(" ")
              : adminUser.name
          }
        />
      </section>
    </main>
  );
}
