"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  canAccessAdminModule,
  isAdminRole,
  toAdminRole,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { isRegistrationOpen } from "@/lib/registrationStatus";
import CoachAuthButton from "@/components/dugout/CoachAuthButton";

type DugoutMeResponse = {
  user: {
    isCoach: boolean;
    isAdmin: boolean;
  } | null;
};

type AdminMeResponse = {
  authenticated: boolean;
  user?: {
    role?: string;
    isMaster?: boolean;
  };
};

type HeaderProps = {
  brand: {
    name: string;
    displayNameLine1: string;
    displayNameLine2: string;
    logoPath: string;
  };
};

export default function Header({ brand }: HeaderProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [canSeeDugout, setCanSeeDugout] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [logoSrc, setLogoSrc] = useState(brand.logoPath);
  const regOpen = isRegistrationOpen();
  const isMasterHeader =
    brand.displayNameLine2.toUpperCase() === "MASTER ADMIN";

  const headerClassName = isMasterHeader
    ? "sticky top-0 z-50 border-b border-red-900/60 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 shadow-[0_6px_24px_rgba(0,0,0,0.3)]"
    : "sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800";

  const headerInnerClassName = isMasterHeader
    ? "mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4"
    : "max-w-7xl mx-auto px-6 py-4 flex items-center justify-between";

  const logoFrameClassName = isMasterHeader
    ? "relative h-12 w-12 overflow-hidden rounded-full border-2 border-red-500/70 bg-zinc-900/60 ring-2 ring-red-900/50 md:h-14 md:w-14"
    : "relative h-12 w-12 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900/40 md:h-14 md:w-14";

  const subLabelClassName = isMasterHeader
    ? "-mt-1 inline-flex rounded-full border border-red-700/60 bg-red-950/40 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-red-200"
    : "text-[10px] text-brand-gold -mt-1";

  const brandTitleClassName = isMasterHeader
    ? "font-bold text-2xl tracking-[0.06em] text-white uppercase"
    : "font-bold text-2xl tracking-tight text-white uppercase";

  const desktopNavClassName = isMasterHeader
    ? "hidden md:flex items-center gap-6 text-[13px] font-semibold tracking-wide"
    : "hidden md:flex items-center gap-8 text-sm font-medium";

  const mobileMenuClassName = isMasterHeader
    ? "md:hidden border-t border-red-900/60 bg-zinc-900/95"
    : "md:hidden border-t border-zinc-800 bg-zinc-900";

  function desktopLinkClassName(href: string) {
    if (!isMasterHeader) return "hover:text-brand-gold transition-colors";

    const isRouteLink = !href.includes("#");
    const isActive = isRouteLink
      ? href === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(href)
      : false;
    return isActive
      ? "relative text-red-200 transition-colors after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-red-400"
      : "relative text-zinc-200/90 transition-colors hover:text-red-200 after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-red-400 after:transition-all hover:after:w-full";
  }

  function mobileLinkClassName(href: string) {
    if (!isMasterHeader) return "hover:text-brand-gold";

    const isRouteLink = !href.includes("#");
    const isActive = isRouteLink
      ? href === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(href)
      : false;
    return isActive
      ? "rounded-md border border-red-800/70 bg-red-950/40 px-3 py-2 text-red-200"
      : "rounded-md px-3 py-2 text-zinc-200 hover:bg-red-950/30 hover:text-red-200";
  }

  useEffect(() => {
    let active = true;

    async function loadDugoutAccess() {
      try {
        const [dugoutRes, adminRes] = await Promise.all([
          fetch("/api/dugout/me", { cache: "no-store" }),
          fetch("/api/admin/me", { cache: "no-store" }),
        ]);

        if (!dugoutRes.ok) {
          if (active) setIsLoggedIn(false);
          if (active) setCanSeeDugout(false);
        } else {
          const json = (await dugoutRes.json()) as DugoutMeResponse;
          if (active) setIsLoggedIn(Boolean(json.user));
          if (active)
            setCanSeeDugout(Boolean(json.user?.isCoach || json.user?.isAdmin));
        }

        if (!adminRes.ok) {
          if (active) setAdminRole(null);
        } else {
          const adminJson = (await adminRes.json()) as AdminMeResponse;
          const roleValue = adminJson.user?.role;
          const isMaster = Boolean(adminJson.user?.isMaster);
          if (active) {
            setAdminRole(
              isMaster
                ? "MASTER_ADMIN"
                : isAdminRole(roleValue)
                  ? roleValue
                  : null,
            );
          }
        }
      } catch {
        if (active) setIsLoggedIn(false);
        if (active) setCanSeeDugout(false);
        if (active) setAdminRole(null);
      }
    }

    void loadDugoutAccess();

    function handleAuthChanged() {
      void loadDugoutAccess();
    }

    function handleWindowFocus() {
      void loadDugoutAccess();
    }

    window.addEventListener("gdb-auth-changed", handleAuthChanged);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      active = false;
      window.removeEventListener("gdb-auth-changed", handleAuthChanged);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [pathname]);

  if (pathname.startsWith("/dugout")) return null;

  const masterRole = adminRole ? toAdminRole(adminRole) : null;
  const allowModule = (
    module: "USERS" | "REPORTS" | "SCORES" | "DUGOUT_MODERATION",
  ) => {
    if (!masterRole) return true;
    return canAccessAdminModule(masterRole, module);
  };

  const navLinks = isMasterHeader
    ? [
        { href: "/admin", label: "Dashboard" },
        ...(allowModule("USERS")
          ? [{ href: "/admin/users", label: "Users" }]
          : []),
        ...(allowModule("REPORTS")
          ? [{ href: "/admin/reports", label: "Reports" }]
          : []),
        ...(allowModule("SCORES")
          ? [{ href: "/admin/scores", label: "Scores" }]
          : []),
        ...(allowModule("DUGOUT_MODERATION")
          ? [{ href: "/admin/dugout", label: "Dugout" }]
          : []),
        ...(canSeeDugout ? [{ href: "/dugout", label: "The Board Room" }] : []),
      ]
    : [
        { href: "/schedule", label: "Schedules & Standings" },
        ...(regOpen ? [{ href: "/#register", label: "Registration" }] : []),
        ...(isLoggedIn ? [{ href: "/#teams", label: "Teams" }] : []),
        { href: "/#fields", label: "Fields & Status" },
        ...(canSeeDugout ? [{ href: "/dugout", label: "The Dugout" }] : []),
        { href: "/news", label: "News" },
        { href: "/#contact", label: "Contact" },
      ];

  return (
    <header className={headerClassName}>
      <div className={headerInnerClassName}>
        {/* Logo */}
        <Link href="/#" className="flex items-center gap-3">
          <div className={logoFrameClassName}>
            <Image
              src={logoSrc}
              alt={`${brand.name} Logo`}
              fill
              sizes="64px"
              className="rounded-full object-cover"
              priority
              onError={() => {
                if (logoSrc.endsWith(".webp")) {
                  setLogoSrc(logoSrc.replace(/\.webp$/i, ".png"));
                  return;
                }
                setLogoSrc("/images/logo.png");
              }}
            />
          </div>
          <div className="hidden sm:block">
            <div className={brandTitleClassName}>{brand.displayNameLine1}</div>
            <div className={subLabelClassName}>{brand.displayNameLine2}</div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className={desktopNavClassName}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={desktopLinkClassName(link.href)}
            >
              {link.label}
            </Link>
          ))}
          <CoachAuthButton />
        </nav>

        {/* Register Button */}
        {!isMasterHeader && regOpen && (
          <Link
            href="/#register"
            className="hidden md:block bg-brand-purple hover:bg-brand-purple-dark px-6 py-2.5 rounded-lg font-semibold text-sm transition"
          >
            Register Now
          </Link>
        )}

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden text-2xl"
        >
          {isMenuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className={mobileMenuClassName}>
          <div className="px-6 py-8 flex flex-col gap-6 text-lg">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className={mobileLinkClassName(link.href)}
              >
                {link.label}
              </Link>
            ))}
            {!isMasterHeader && regOpen && (
              <Link
                href="/#register"
                onClick={() => setIsMenuOpen(false)}
                className="bg-brand-purple hover:bg-brand-purple-dark py-3 text-center rounded-lg font-semibold mt-4"
              >
                Register for Spring 2026
              </Link>
            )}
            {!isMasterHeader && canSeeDugout && (
              <Link
                href="/dugout"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 hover:text-brand-gold"
              >
                The Dugout
              </Link>
            )}
            <div className="pt-2 border-t border-zinc-700 mt-2">
              <CoachAuthButton
                mobile
                onNavigate={() => setIsMenuOpen(false)}
                onAuthenticated={() => setIsMenuOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
