import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminLoginForm from "@/components/auth/AdminLoginForm";
import DesignedByBrand from "@/components/ui/DesignedByBrand";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, isMasterDeployment } from "@/lib/siteConfig";

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

function loginErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case "invalid":
      return "Invalid email or password.";
    case "missing":
      return "Email and password are required.";
    case "server":
      return "Login failed due to a server error. Wait a moment and try again.";
    default:
      return null;
  }
}

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Admin Login | ${site.name}`,
    description: `Sign in to access ${site.name} admin tools.`,
  };
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : "/admin";
  const loginError = loginErrorMessage(params.error);

  const cookieStore = await cookies();
  const existingSession = await getAdminUserFromCookieToken(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (existingSession) {
    redirect(nextPath);
  }

  const masterMode = isMasterDeployment();

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-8 sm:py-14">
      <section className="mx-auto max-w-md px-4 sm:px-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight mb-2 sm:text-3xl">
            Admin Sign In
          </h1>
          <p className="text-zinc-400 text-sm mb-6">
            Sign in with your admin account to manage league content and operations.
          </p>

          <AdminLoginForm nextPath={nextPath} initialError={loginError} />

          <div className="mt-6 pt-4 border-t border-zinc-800 text-sm">
            {!masterMode ? (
              <Link
                href="/news"
                className="text-brand-gold hover:text-brand-gold/80"
              >
                Back to News
              </Link>
            ) : (
              <Link
                href="/"
                className="text-brand-gold hover:text-brand-gold/80"
              >
                Back to Admin Home
              </Link>
            )}
            <DesignedByBrand
              className="mt-4 text-xs"
              labelClassName="text-zinc-500"
              linkClassName="font-medium text-brand-gold transition-colors hover:text-brand-gold/80"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
