import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminUsersManager from "@/components/admin/AdminUsersManager";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";

export const metadata = {
  title: "Admin Users | Gonzales Diamond Baseball",
  description:
    "Promote and demote admin accounts for Gonzales Diamond Baseball.",
};

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/users");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full">
              ACCESS CONTROL
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/news/admin"
                className="text-brand-gold hover:text-brand-gold/80"
              >
                Back to News Admin
              </Link>
              <Link href="/news" className="text-zinc-400 hover:text-zinc-300">
                Public News
              </Link>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Admin User Management
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Promote registered Google users to admin access and demote admins as
            needed.
          </p>
        </div>

        <AdminUsersManager />
      </section>
    </main>
  );
}
