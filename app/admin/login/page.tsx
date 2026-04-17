import Link from "next/link";

import AdminLoginForm from "@/components/auth/AdminLoginForm";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export const metadata = {
  title: "Admin Login | Gonzales Diamond Baseball",
  description: "Sign in to access Gonzales Diamond Baseball admin tools.",
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : "/admin";

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-md mx-auto px-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Admin Sign In
          </h1>
          <p className="text-zinc-400 text-sm mb-6">
            Sign in with your admin account to manage news posts.
          </p>

          <AdminLoginForm nextPath={nextPath} />

          <div className="mt-6 pt-4 border-t border-zinc-800 text-sm">
            <Link
              href="/news"
              className="text-brand-gold hover:text-brand-gold/80"
            >
              Back to News
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
