"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import DesignedByBrand from "@/components/ui/DesignedByBrand";
import type { OrgId } from "@/lib/siteConfig";
import { getSportsConnectVolunteerRegistrationUrl } from "@/lib/sportsConnect/registrationUrl";

type FooterProps = {
  brand: {
    orgId: OrgId;
    name: string;
    shortName: string;
    displayNameLine2: string;
    logoPath: string;
    tournamentOnly?: boolean;
  };
};

export default function Footer({ brand }: FooterProps) {
  const pathname = usePathname();
  const [logoSrc, setLogoSrc] = useState(brand.logoPath);
  if (pathname.startsWith("/dugout") || pathname.startsWith("/tournament-rosters")) return null;

  const isMaster = brand.orgId === "master";
  const isTournamentOnly = brand.tournamentOnly ?? false;
  const isFallBall = brand.orgId === "fallball";
  const volunteerRegistrationUrl = getSportsConnectVolunteerRegistrationUrl();

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 py-10 sm:py-14 md:py-16">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-2 sm:px-6 md:grid-cols-4 md:gap-10">
        {/* Column 1: Logo & About */}
        <div>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="relative w-10 h-10">
              <Image
                src={logoSrc}
                alt={brand.name}
                className="object-contain"
                width={40}
                height={40}
                onError={() => setLogoSrc("/images/logo.png")}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xl font-bold text-white">{brand.shortName}</div>
              <div className="truncate text-xs text-brand-gold">
                {brand.displayNameLine2}
              </div>
            </div>
          </div>
          <p className="text-sm text-zinc-400 max-w-xs">
            {isTournamentOnly
              ? "Official tournament information, brackets, and rosters."
              : isFallBall
              ? "AP Baseball Fall Ball league operations, registration updates, schedules, and team information."
              : "Official youth baseball league in Ascension Parish, Louisiana. Providing fun, skill development, and competitive play for ages 3-12."}
          </p>
        </div>

        {/* Column 2: Quick Links */}
        <div>
          <h4 className="font-semibold mb-4 text-brand-gold">Quick Links</h4>
          <ul className="space-y-2 text-sm">
            {isMaster ? (
              <>
                <li>
                  <a
                    href="/admin"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Dashboard
                  </a>
                </li>
                <li>
                  <a
                    href="/admin/users"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Users
                  </a>
                </li>
                <li>
                  <a
                    href="/admin/reports"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Reports
                  </a>
                </li>
                <li>
                  <a
                    href="/admin/scores"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Scores
                  </a>
                </li>
                <li>
                  <a
                    href="/admin/dugout"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Dugout
                  </a>
                </li>
                <li>
                  <a
                    href="/dugout"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    The Board Room
                  </a>
                </li>
              </>
            ) : isTournamentOnly ? (
              <>
                <li>
                  <Link
                    href="/"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    href="/today"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Today&apos;s Schedule
                  </Link>
                </li>
                <li>
                  <a
                    href="/tournaments"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Brackets
                  </a>
                </li>
                <li>
                  <a
                    href="/rosters"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Rosters
                  </a>
                </li>
              </>
            ) : (
              <>
                <li>
                  <a
                    href="/schedule"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Schedules &amp; Standings
                  </a>
                </li>
                <li>
                  <a
                    href="/registration"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    Player Registration
                  </a>
                </li>
                {isFallBall && (
                  <li>
                    <a
                      href={volunteerRegistrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-100 hover:text-brand-gold transition"
                    >
                      Volunteer Registration (Coaches &amp; Umpires)
                    </a>
                  </li>
                )}
                <li>
                  <Link
                    href="/news"
                    className="text-zinc-100 hover:text-brand-gold transition"
                  >
                    News &amp; Announcements
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>

        {/* Column 3: Contact Info */}
        <div>
          <h4 className="font-semibold mb-4 text-brand-gold">Contact Us</h4>
          <div className="space-y-3 text-sm text-zinc-400">
            <p>
              AP Baseball
              {!isMaster && !isFallBall && <> / Gonzales Diamond Baseball</>}
              <br />
              1943 S. Burnside Ave.
              <br />
              Gonzales, LA 70737
            </p>
            <p>
              Phone:{" "}
              <a
                href="tel:225-495-4001"
                className="text-zinc-100 hover:text-white"
              >
                (225) 495-4001
              </a>
            </p>
            <p>
              Email:{" "}
              <a
                href="mailto:info@apbaseball.com"
                className="text-zinc-100 hover:text-white"
              >
                info@apbaseball.com
              </a>
            </p>
          </div>
        </div>

        {/* Column 4: Social & Legal */}
        <div>
          <h4 className="font-semibold mb-4 text-brand-gold">Follow Us</h4>
          <div className="mb-8 flex flex-wrap gap-x-4 gap-y-3">
            <a
              href="https://www.facebook.com/APBaseball"
              target="_blank"
              rel="noopener"
              className="text-zinc-100 hover:text-brand-gold"
            >
              Facebook
            </a>
            {isMaster ? (
              <a
                href="/privacy"
                className="text-zinc-100 hover:text-brand-gold"
              >
                Privacy
              </a>
            ) : null}
          </div>

          <div className="text-xs text-zinc-500">
            © {new Date().getFullYear()} {brand.name}
            <br />
            Powered by Next.js • All Rights Reserved
          </div>
          <DesignedByBrand
            className="mt-4 text-[10px] opacity-80"
            labelClassName="text-zinc-500"
            linkClassName="inline-flex items-center gap-0 font-normal text-zinc-300 transition-colors hover:text-zinc-200"
            logoWrapClassName="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden opacity-85"
          />
        </div>
      </div>
    </footer>
  );
}
