"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  canAccessAdminModule,
  getMinimumRoleForModule,
  hasAdminRoleAtLeast,
  isAdminRole,
  toAdminRole,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import { isRegistrationOpen } from "@/lib/registrationStatus";
import { CURRENT_SEASON_LABEL } from "@/lib/seasonConfig";
import CoachAuthButton from "@/components/dugout/CoachAuthButton";
import {
  isAdminModuleEnabledForOrg,
  isContentOrgId,
  isPublicNavEnabledForOrg,
} from "@/lib/siteConfig";

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
    tournamentOnly?: boolean;
  };
};

type MasterNavLink = { href: string; label: string };

type MasterNavGroup = { id: string; label: string; items: MasterNavLink[] };

export default function Header({ brand }: HeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openMasterMenu, setOpenMasterMenu] = useState<string | null>(null);
  const [isCoachCornerOpen, setIsCoachCornerOpen] = useState(false);
  const masterMenuRef = useRef<HTMLDivElement | null>(null);
  const coachCornerMenuRef = useRef<HTMLDivElement | null>(null);
  const [canSeeDugout, setCanSeeDugout] = useState(false);
  const [showAllStarLink, setShowAllStarLink] = useState(false);
  const [showParkInfoLink, setShowParkInfoLink] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [logoSrc, setLogoSrc] = useState(brand.logoPath);
  const currentOrgParam = searchParams.get("org");
  const [regOpen] = useState(() => isRegistrationOpen());
  const isMasterHeader =
    brand.displayNameLine2.toUpperCase() === "MASTER ADMIN";
  const isTournamentOnly = brand.tournamentOnly ?? false;
  const isFallBallHeader = brand.displayNameLine2.toUpperCase() === "FALL BALL";

  const headerClassName = isMasterHeader
    ? "sticky top-0 z-50 border-b border-red-900/60 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 shadow-[0_6px_24px_rgba(0,0,0,0.3)]"
    : isFallBallHeader
    ? "sticky top-0 z-50 border-b border-[#171717] bg-[#050505]"
    : "sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800";

  const headerInnerClassName = isMasterHeader
    ? "mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-4 lg:gap-6"
    : isFallBallHeader
    ? "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6"
    : "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4";

  const logoFrameClassName = isMasterHeader
    ? "relative h-12 w-12 overflow-hidden rounded-full border-2 border-red-500/70 bg-zinc-900/60 ring-2 ring-red-900/50 md:h-14 md:w-14"
    : isFallBallHeader
    ? "relative h-12 w-32 shrink-0 overflow-visible md:h-14 md:w-40"
    : isTournamentOnly
    ? "relative h-12 w-20 md:h-14 md:w-24"
    : "relative h-12 w-12 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900/40 md:h-14 md:w-14";

  const logoImageClassName =
    isTournamentOnly || isFallBallHeader ? "object-contain" : "rounded-full object-cover";

  const subLabelClassName = isMasterHeader
    ? "-mt-1 inline-flex rounded-full border border-red-700/60 bg-red-950/40 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-red-200"
    : "text-[10px] text-brand-gold -mt-1";

  const brandTitleClassName = isMasterHeader
    ? "text-xl font-bold uppercase tracking-[0.06em] text-white sm:text-2xl"
    : "text-xl font-bold uppercase tracking-tight text-white sm:text-2xl";

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
          if (active) setCanSeeDugout(false);
        } else {
          const json = (await dugoutRes.json()) as DugoutMeResponse;
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
        if (active) setCanSeeDugout(false);
        if (active) setAdminRole(null);
      }
    }

    void loadDugoutAccess();

    // Fetch whether to show All-Stars nav link (once per mount, not per auth change)
    fetch("/api/all-star/nav-hint", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { showAllStarLink?: boolean }) => {
        if (active) setShowAllStarLink(Boolean(d.showAllStarLink));
      })
      .catch(() => { /* silent */ });

    fetch("/api/park-info/nav-hint", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { showParkInfoLink?: boolean }) => {
        if (active) setShowParkInfoLink(Boolean(d.showParkInfoLink));
      })
      .catch(() => { /* silent */ });

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
    if (!openMasterMenu && !isCoachCornerOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const masterEl = masterMenuRef.current;
      const coachCornerEl = coachCornerMenuRef.current;
      if (masterEl && !masterEl.contains(target)) setOpenMasterMenu(null);
      if (coachCornerEl && !coachCornerEl.contains(target)) setIsCoachCornerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMasterMenu(null);
        setIsCoachCornerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMasterMenu, isCoachCornerOpen]);

  if (pathname.startsWith("/dugout") || pathname.startsWith("/tournament-rosters")) return null;

  const masterRole = adminRole ? toAdminRole(adminRole) : null;
  const masterOrgSuffix =
    isMasterHeader && currentOrgParam ? `?org=${encodeURIComponent(currentOrgParam)}` : "";
  const currentMasterOrg = isContentOrgId(currentOrgParam) ? currentOrgParam : null;
  const allowModule = (module: AdminModule) => {
    if (!isAdminModuleEnabledForOrg(currentMasterOrg, module)) return false;
    if (!masterRole) return true;
    // isMasterDeployment() reads process.env which is unavailable client-side.
    // Use isMasterHeader (derived from brand prop, server-provided) instead.
    if (isMasterHeader) return hasAdminRoleAtLeast(masterRole, getMinimumRoleForModule(module));
    return canAccessAdminModule(masterRole, module);
  };

  const masterNavGroups: MasterNavGroup[] = isMasterHeader
    ? [
        {
          id: "program",
          label: "Program",
          items: [
            { href: `/admin/teams${masterOrgSuffix}`, label: "Teams" },
            ...(allowModule("TEAMS") && currentMasterOrg === "fallball"
              ? [{ href: `/admin/coaching-interest${masterOrgSuffix}`, label: "Coaching Interest" }]
              : []),
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
            ...(allowModule("PARK_INFO")
              ? [{ href: `/admin/park-info${masterOrgSuffix}`, label: "Park Info" }]
              : []),
            ...(allowModule("ALL_STAR_VAULT")
              ? [{ href: `/admin/all-star${masterOrgSuffix}`, label: "Vault" }]
              : []),
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

  const publicNavLinks = (isTournamentOnly
    ? [
        { href: "/", label: "Home" },
        { href: "/today", label: "Today", key: "today" },
        { href: "/tournaments", label: "Brackets", key: "tournaments" },
        { href: "/rosters", label: "Rosters" },
        ...(showParkInfoLink ? [{ href: "/park-info", label: "Park Info" }] : []),
      ]
    : [
        { href: "/schedule", label: "Schedule" },
        { href: "/tournaments", label: "Tournaments", key: "tournaments" },
        ...(showAllStarLink ? [{ href: "/all-star", label: "All-Stars", key: "all-stars" }] : []),
        ...(showParkInfoLink ? [{ href: "/park-info", label: "Park Info" }] : []),
        { href: "/news", label: "News" },
        ...(regOpen ? [{ href: "/registration", label: "Registration" }] : []),
        ...(!isFallBallHeader && canSeeDugout ? [{ href: "/coach-corner", label: "Coaches" }] : []),
        ...(!isFallBallHeader && canSeeDugout ? [{ href: "/dugout", label: "Dugout" }] : []),
      ]).filter((link) =>
        isPublicNavEnabledForOrg(isFallBallHeader ? "fallball" : null, link.key ?? link.label.toLowerCase()),
      );

  const fallBallCoachCornerLinks = isFallBallHeader
    ? [
        ...(isPublicNavEnabledForOrg("fallball", "coaching-interest")
          ? [{ href: "/coaching-interest", label: "Coaching Interest" }]
          : []),
        ...(canSeeDugout && isPublicNavEnabledForOrg("fallball", "coaches")
          ? [{ href: "/coach-corner", label: "Coaches" }]
          : []),
        ...(canSeeDugout && isPublicNavEnabledForOrg("fallball", "dugout")
          ? [{ href: "/dugout", label: "Dugout" }]
          : []),
      ]
    : [];

  return (
    <header className={headerClassName}>
      <div className={headerInnerClassName}>
        {/* Logo */}
        <Link
          href="/#"
          className={`flex min-w-0 items-center gap-2 sm:gap-3 ${isMasterHeader ? "justify-self-start md:col-start-1 md:row-start-1" : ""}`}
        >
          <div className={logoFrameClassName}>
            <Image
              src={logoSrc}
              alt={`${brand.name} Logo`}
              fill
              sizes="64px"
              className={logoImageClassName}
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
          <div className={isFallBallHeader ? "sr-only" : "block min-w-0"}>
            <div className={brandTitleClassName}>{brand.displayNameLine1}</div>
            <div className={`${subLabelClassName} max-w-[11rem] truncate sm:max-w-none`}>
              {brand.displayNameLine2}
            </div>
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
            {fallBallCoachCornerLinks.length > 0 ? (
              <div ref={coachCornerMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={isCoachCornerOpen}
                  aria-haspopup="true"
                  className="inline-flex items-center gap-1 text-white transition-colors hover:text-brand-gold"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCoachCornerOpen((open) => !open);
                  }}
                >
                  Coach&apos;s Corner
                  <svg
                    className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${isCoachCornerOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>
                {isCoachCornerOpen ? (
                  <div
                    className="absolute right-0 top-full z-50 mt-3 min-w-48 rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {fallBallCoachCornerLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-800 hover:text-brand-gold"
                        onClick={() => setIsCoachCornerOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {!isTournamentOnly ? <CoachAuthButton /> : null}
          </nav>
        )}

        {/* Register Button */}
        {!isMasterHeader && !isTournamentOnly && regOpen && (
          <Link
            href="/registration"
            className="hidden md:block bg-brand-purple hover:bg-brand-purple-dark px-6 py-2.5 rounded-lg font-semibold text-sm text-white transition"
          >
            Register Now
          </Link>
        )}

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-2xl text-white md:hidden ${isMasterHeader ? "col-start-2 row-start-1 justify-self-end" : ""}`}
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
            className={`flex max-h-[calc(100dvh-4.5rem)] flex-col overflow-y-auto px-4 py-5 sm:px-6 ${isMasterHeader ? "gap-4 text-base" : "gap-4 text-base sm:text-lg"}`}
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
              <>
                {publicNavLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileLinkClassName(link.href)}
                  >
                    {link.label}
                  </Link>
                ))}
                {fallBallCoachCornerLinks.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-zinc-700/70 bg-zinc-950/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">
                      Coach&apos;s Corner
                    </p>
                    <div className="flex flex-col gap-2 border-l border-zinc-700 pl-3">
                      {fallBallCoachCornerLinks.map((item) => (
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
                ) : null}
              </>
            )}
            {!isMasterHeader && !isTournamentOnly && regOpen && (
              <Link
                href="/registration"
                onClick={() => setIsMenuOpen(false)}
                className="mt-2 rounded-lg bg-brand-purple py-3 text-center font-semibold text-white hover:bg-brand-purple-dark"
              >
                Register for {CURRENT_SEASON_LABEL}
              </Link>
            )}
            {!isMasterHeader && !isFallBallHeader && canSeeDugout && (
              <Link
                href="/coach-corner"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 text-white hover:text-brand-gold"
              >
                Coach&apos;s Corner
              </Link>
            )}
            {!isMasterHeader && !isFallBallHeader && canSeeDugout && (
              <Link
                href="/dugout"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-2 text-white hover:text-brand-gold"
              >
                The Dugout
              </Link>
            )}
            {!isTournamentOnly ? (
              <div className="pt-2 border-t border-zinc-700 mt-2">
                <CoachAuthButton
                  mobile
                  onNavigate={() => setIsMenuOpen(false)}
                  onAuthenticated={() => setIsMenuOpen(false)}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </header>
  );
}
