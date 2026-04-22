"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isRegistrationOpen } from "@/lib/registrationStatus";
import { getSiteConfig } from "@/lib/siteConfig";
import CoachAuthButton from "@/components/dugout/CoachAuthButton";

type DugoutMeResponse = {
  user: {
    isCoach: boolean;
    isAdmin: boolean;
  } | null;
};

export default function Header() {
  const site = getSiteConfig();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [canSeeDugout, setCanSeeDugout] = useState(false);
  const [logoSrc, setLogoSrc] = useState(site.logoPath);
  const regOpen = isRegistrationOpen();

  useEffect(() => {
    let active = true;

    async function loadDugoutAccess() {
      try {
        const res = await fetch("/api/dugout/me", { cache: "no-store" });
        if (!res.ok) {
          if (active) setIsLoggedIn(false);
          if (active) setCanSeeDugout(false);
          return;
        }

        const json = (await res.json()) as DugoutMeResponse;
        if (active) setIsLoggedIn(Boolean(json.user));
        if (active)
          setCanSeeDugout(Boolean(json.user?.isCoach || json.user?.isAdmin));
      } catch {
        if (active) setIsLoggedIn(false);
        if (active) setCanSeeDugout(false);
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

  const navLinks = [
    { href: "/schedule", label: "Schedules & Standings" },
    ...(regOpen ? [{ href: "/#register", label: "Registration" }] : []),
    ...(isLoggedIn ? [{ href: "/#teams", label: "Teams" }] : []),
    { href: "/#fields", label: "Fields & Status" },
    ...(canSeeDugout ? [{ href: "/dugout", label: "The Dugout" }] : []),
    { href: "/news", label: "News" },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/#" className="flex items-center gap-3">
          <div className="relative w-12 h-12 md:w-14 md:h-14">
            {" "}
            {/* Adjust size as needed */}
            <Image
              src={logoSrc}
              alt={`${site.name} Logo`}
              fill
              sizes="64px"
              className="object-contain"
              priority
              onError={() => setLogoSrc("/images/logo.png")}
            />
          </div>
          <div className="hidden sm:block">
            <div className="font-bold text-2xl tracking-tight text-white uppercase">
              {site.displayNameLine1}
            </div>
            <div className="text-[10px] text-brand-gold -mt-1">
              {site.displayNameLine2}
            </div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-brand-gold transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <CoachAuthButton />
        </nav>

        {/* Register Button */}
        {regOpen && (
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
        <div className="md:hidden border-t border-zinc-800 bg-zinc-900">
          <div className="px-6 py-8 flex flex-col gap-6 text-lg">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="hover:text-brand-gold"
              >
                {link.label}
              </Link>
            ))}
            {regOpen && (
              <Link
                href="/#register"
                onClick={() => setIsMenuOpen(false)}
                className="bg-brand-purple hover:bg-brand-purple-dark py-3 text-center rounded-lg font-semibold mt-4"
              >
                Register for Spring 2026
              </Link>
            )}
            {canSeeDugout && (
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
