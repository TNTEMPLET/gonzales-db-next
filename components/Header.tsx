"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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

type MasterNavLink = { href: string; label: string };

type MasterNavGroup = { id: string; label: string; items: MasterNavLink[] };

export default function Header({ brand }: HeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMasterMenu, setOpenMasterMenu] = useState<string | null>(null);
  const masterMenuRef = useRef<HTMLDivElement | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [canSeeDugout, setCanSeeDugout] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [logoSrc, setLogoSrc] = useState(brand.logoPath);
  const currentOrgParam = searchParams.get("org");
  const regOpen = isRegistrationOpen();
  const isMasterHeader =
    brand.displayNameLine2.toUpperCase() === "MASTER ADMIN";

  const headerClassName = isMasterHeader
    ? "sticky top-0 z-50 border-b border-red-900/60 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 shadow-[0_6px_24px_rgba(0,0,0,0.3)]"
    : "sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800";

  const headerInnerClassName = isMasterHeader
    ? "mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-4 lg:gap-6"
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
    ? "flex min-w-0 items-center justify-end gap-1 lg:gap-2 text-[12px] font-semibold tracking-wide xl:text-[13px]"
    : "hidden md:flex items-center gap-8 text-sm font-medium";

  const mobileMenuClassName = isMasterHeader
    ? "md:hidden border-t border-red-900/60 bg-zinc-900/95"
    : "md:hidden border-t border-zinc-800 bg-zinc-900";

  function masterNavTriggerClass(isActive: boolean) {
    return isActive
      ? "relative whitespace-nowrap px-2 py-1.5 text-red-200 transition-colors after:absolute after:-bottom-0.5 after:left-2 after:right-2 after:h-[2px] after:rounded-full after:bg-red-400"
      : "relative whitespace-nowrap px-2 py-1.5 text-zinc-200/90 transition-colors hover:text-red-200 after:absolute after:-bottom-0.5 after:left-2 after:h-[2px] after:w-0 after:rounded-full after:bg-red-400 after:transition-all hover:after:w-[calc(100%-1rem)]";
  }

  function desktopLinkClassName(href: string) {
    if (!isMasterHeader)
      return "text-white hover:text-brand-gold transition-colors";

    const isRouteLink = !href.includes("#");
    const pathKey = href.split("?")[0] ?? href;
    const isActive = isRouteLink
      ? pathKey === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(pathKey)
      : false;
    return isActive
      ? "relative whitespace-nowrap px-2 py-1.5 text-red-200 transition-colors after:absolute after:-bottom-0.5 after:left-2 after:right-2 after:h-[2px] after:rounded-full after:bg-red-400"
      : "relative whitespace-nowrap px-2 py-1.5 text-zinc-200/90 transition-colors hover:text-red-200 after:absolute after:-bottom-0.5 after:left-2 after:h-[2px] after:w-0 after:rounded-full after:bg-red-400 after:transition-all hover:after:w-[calc(100%-1rem)]";
  }

  function mobileLinkClassName(href: string) {
    if (!isMasterHeader) return "text-white hover:text-brand-gold";

    const isRouteLink = !href.includes("#");
    const pathKey = href.split("?")[0] ?? href;
    const isActive = isRouteLink
      ? pathKey === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(pathKey)
      : false;
    return isActive
      ? "rounded-md border border-red-800/70 bg-red-950/40 px-3 py-2 text-red-200"
      : "rounded-md px-3 py-2 text-zinc-200 hover:bg-red-950/30 hover:text-red-200";
  }

  function masterDropdownItemClass(href: string) {
    const pathKey = href.split("?")[0] ?? href;
    const isActive =
      pathKey === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(pathKey);
    return isActive
      ? "block px-3 py-2 text-left text-sm text-red-200 bg-red-950/35"
      : "block px-3 py-2 text-left text-sm text-zinc-200 hover:bg-red-950/25 hover:text-red-100";
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

  useEffect(() => {
    if (!openMasterMenu) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = masterMenuRef.current;
      if (el && !el.contains(e.target as Node)) setOpenMasterMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMasterMenu(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMasterMenu]);

  if (pathname.startsWith("/dugout")) return null;

  const masterRole = adminRole ? toAdminRole(adminRole) : null;
  const masterOrgSuffix =
    isMasterHeader && currentOrgParam ? `?org=${encodeURIComponent(currentOrgParam)}` : "";
  const allowModule = (
    module:
      | "USERS"
      | "SPONSORS"
      | "REPORTS"
      | "SCORES"
      | "DUGOUT_MODERATION"
      | "SOCIAL_MEDIA"
      | "ORG_DOCUMENTS"
      | "TOURNAMENT_BRACKETS",
  ) => {
    if (!masterRole) return true;
    return canAccessAdminModule(masterRole, module);
  };

  const masterNavGroups: MasterNavGroup[] = isMasterHeader
    ? [
        {
          id: "program",
          label: "Program",
          items: [
            { href: `/admin/teams${masterOrgSuffix}`, label: "Teams" },
            ...(allowModule("SPONSORS")
              ? [{ href: `/admin/sponsors${masterOrgSuffix}`, label: "Sponsors" }]
              : []),
            ...(allowModule("SOCIAL_MEDIA")
              ? [{ href: "/admin/social", label: "Social" }]
              : []),
            ...(allowModule("ORG_DOCUMENTS")
              ? [{ href: "/admin/documents", label: "Documents" }]
              : []),
            ...(allowModule("TOURNAMENT_BRACKETS")
              ? [
                  {
                    href: "/admin/tournament-brackets",
                    label: "Brackets",
                  },
                ]
              : []),
            { href: `/admin/all-star${masterOrgSuffix}`, label: "Vault" },
          ],
        },
        {
          id: "operations",
          label: "Operations",
          items: [
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
            ...(canSeeDugout
              ? [{ href: `/coach-corner${masterOrgSuffix}`, label: "Coach's Corner" }]
              : []),
          ],
        },
      ].filter((g) => g.items.length > 0)
    : [];

  const publicNavLinks = [
    { href: "/schedule", label: "Schedules & Standings" },
    { href: "/tournaments", label: "Tournaments" },
    ...(regOpen ? [{ href: "/#register", label: "Registration" }] : []),
    ...(isLoggedIn ? [{ href: "/#teams", label: "Teams" }] : []),
    { href: "/#fields", label: "Fields & Status" },
    ...(canSeeDugout ? [{ href: "/coach-corner", label: "Coach's Corner" }] : []),
    ...(canSeeDugout ? [{ href: "/dugout", label: "The Dugout" }] : []),
    { href: "/news", label: "News" },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <header className={headerClassName}>
      <div className={headerInnerClassName}>
        {/* Logo */}
        <Link
          href="/#"
          className={`flex min-w-0 items-center gap-3 ${isMasterHeader ? "justify-self-start md:col-start-1 md:row-start-1" : ""}`}
        >
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
        {isMasterHeader ? (
          <div
            ref={masterMenuRef}
            className="hidden min-w-0 items-center justify-end gap-2 md:col-start-2 md:row-start-1 md:flex lg:gap-3"
          >
            <nav className={desktopNavClassName}>
              <Link href="/admin" className={desktopLinkClassName("/admin")}>
                Dashboard
              </Link>
              {masterNavGroups.map((group) => {
                const groupActive = group.items.some((item) => {
                  const pathKey = item.href.split("?")[0] ?? item.href;
                  return pathname.startsWith(pathKey);
                });
                const open = openMasterMenu === group.id;
                return (
                  <div key={group.id} className="relative shrink-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-haspopup="true"
                      className={`inline-flex items-center gap-0.5 rounded-md ${masterNavTriggerClass(groupActive)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMasterMenu(open ? null : group.id);
                      }}
                    >
                      {group.label}
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </button>
                    {open ? (
                      <div
                        className="absolute right-0 top-full z-50 mt-1 min-w-50 rounded-lg border border-red-900/50 bg-zinc-900/98 py-1 shadow-xl backdrop-blur-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {group.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={masterDropdownItemClass(item.href)}
                            onClick={() => setOpenMasterMenu(null)}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {canSeeDugout ? (
                <Link
                  href={`/dugout${masterOrgSuffix}`}
                  className={desktopLinkClassName(`/dugout${masterOrgSuffix}`)}
                >
                  The Board Room
                </Link>
              ) : null}
            </nav>
            <div className="shrink-0">
              <CoachAuthButton />
            </div>
          </div>
        ) : (
          <nav className={desktopNavClassName}>
            {publicNavLinks.map((link) => (
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
        )}

        {/* Register Button */}
        {!isMasterHeader && regOpen && (
          <Link
            href="/#register"
            className="hidden md:block bg-brand-purple hover:bg-brand-purple-dark px-6 py-2.5 rounded-lg font-semibold text-sm text-white transition"
          >
            Register Now
          </Link>
        )}

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`justify-self-end text-2xl text-white md:hidden ${isMasterHeader ? "col-start-2 row-start-1" : ""}`}
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
        >
          {isMenuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className={mobileMenuClassName}>
          <div
            className={`flex flex-col px-6 py-8 ${isMasterHeader ? "gap-5 text-base" : "gap-6 text-lg"}`}
          >
            {isMasterHeader ? (
              <>
                <Link
                  href="/admin"
                  onClick={() => setIsMenuOpen(false)}
                  className={mobileLinkClassName("/admin")}
                >
                  Dashboard
                </Link>
                {masterNavGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-400/90">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-1 border-l border-red-900/40 pl-3">
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMenuOpen(false)}
                          className={mobileLinkClassName(item.href)}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
                {canSeeDugout ? (
                  <Link
                    href={`/dugout${masterOrgSuffix}`}
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileLinkClassName(`/dugout${masterOrgSuffix}`)}
                  >
                    The Board Room
                  </Link>
                ) : null}
              </>
            ) : (
              publicNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={mobileLinkClassName(link.href)}
                >
                  {link.label}
                </Link>
              ))
            )}
            {!isMasterHeader && regOpen && (
              <Link
                href="/#register"
                onClick={() => setIsMenuOpen(false)}
                className="bg-brand-purple hover:bg-brand-purple-dark py-3 text-center rounded-lg font-semibold text-white mt-4"
              >
                Register for Spring 2026
              </Link>
            )}
            {!isMasterHeader && canSeeDugout && (
              <Link
                href="/coach-corner"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 text-white hover:text-brand-gold"
              >
                Coach&apos;s Corner
              </Link>
            )}
            {!isMasterHeader && canSeeDugout && (
              <Link
                href="/dugout"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 text-white hover:text-brand-gold"
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
