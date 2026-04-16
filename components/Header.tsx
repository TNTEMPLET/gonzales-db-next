"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import logo from "@/public/images/logo.png";
import { isRegistrationOpen } from "@/lib/registrationStatus";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const regOpen = isRegistrationOpen();

  const navLinks = [
    { href: "#schedule", label: "Schedules & Standings" },
    ...(regOpen ? [{ href: "#register", label: "Registration" }] : []),
    { href: "#teams", label: "Teams" },
    { href: "#fields", label: "Fields & Status" },
    { href: "/news", label: "News" },
    { href: "#contact", label: "Contact" },
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
              src={logo}
              alt="Gonzales Diamond Baseball Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="hidden sm:block">
            <div className="font-bold text-2xl tracking-tight text-white uppercase">
              Gonzales
            </div>
            <div className="text-[10px] text-brand-gold -mt-1">
              DIAMOND BASEBALL
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
        </nav>

        {/* Register Button */}
        {regOpen && (
          <a
            href="#register"
            className="hidden md:block bg-brand-purple hover:bg-brand-purple-dark px-6 py-2.5 rounded-lg font-semibold text-sm transition"
          >
            Register Now
          </a>
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
              <a
                href="#register"
                onClick={() => setIsMenuOpen(false)}
                className="bg-brand-purple hover:bg-brand-purple-dark py-3 text-center rounded-lg font-semibold mt-4"
              >
                Register for Spring 2026
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
