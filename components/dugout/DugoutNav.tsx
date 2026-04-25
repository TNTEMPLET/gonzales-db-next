"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import CoachAuthButton from "@/components/dugout/CoachAuthButton";

const NAV_ITEMS = [
  {
    key: "notifications",
    label: "Notifications",
    href: "/dugout?view=notifications",
    icon: "baseball",
  },
  {
    key: "schedule",
    label: "Schedule",
    href: "/dugout?view=schedule",
    icon: "calendar",
  },
  { key: "home", label: "Home", href: "/", icon: "home" },
] as const;

function renderNavIcon(icon: (typeof NAV_ITEMS)[number]["icon"]) {
  if (icon === "baseball") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M9 4.5C7.5 7 7.5 17 9 19.5" />
        <path strokeLinecap="round" d="M15 4.5C16.5 7 16.5 17 15 19.5" />
        <path strokeLinecap="round" d="M9 8.5 L7 9" />
        <path strokeLinecap="round" d="M9 12 L6.8 12" />
        <path strokeLinecap="round" d="M9 15.5 L7 15" />
        <path strokeLinecap="round" d="M15 8.5 L17 9" />
        <path strokeLinecap="round" d="M15 12 L17.2 12" />
        <path strokeLinecap="round" d="M15 15.5 L17 15" />
      </svg>
    );
  }

  if (icon === "calendar") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-7 9 7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10v10h14V10" />
    </svg>
  );
}

type Props = {
  activeView: "timeline" | "notifications" | "schedule";
  currentUserName: string | null;
  isAdmin: boolean;
  isMaster?: boolean;
  brand: {
    name: string;
    logoPath: string;
  };
};

export default function DugoutNav({
  activeView,
  currentUserName,
  isAdmin,
  isMaster,
  brand,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [logoSrc, setLogoSrc] = useState(brand.logoPath);

  return (
    <nav
      className={`hidden lg:flex shrink-0 flex-col border-r border-zinc-800 overflow-y-auto scrollbar-hide py-4 transition-all duration-200 ${
        collapsed ? "w-16 px-2 items-center" : "w-56 px-3"
      }`}
    >
      {/* Brand / logo */}
      <div
        className={`mb-4 flex items-center ${collapsed ? "justify-center" : "gap-2 px-1"}`}
      >
        <Link
          href="/dugout"
          className="flex shrink-0 items-center justify-center rounded-full p-1.5 transition hover:bg-zinc-800"
          aria-label="The Dugout"
        >
          <Image
            src={logoSrc}
            alt={brand.name}
            width={collapsed ? 32 : 40}
            height={collapsed ? 32 : 40}
            loading="eager"
            priority
            className="object-contain"
            onError={() => setLogoSrc("/images/logo.png")}
          />
        </Link>
        {!collapsed && (
          <span className="text-base font-black tracking-tight leading-tight">
            {isMaster ? "The Board Room" : "The Dugout"}
          </span>
        )}
      </div>

      {/* Nav links */}
      <div className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            (item.key === "notifications" && activeView === "notifications") ||
            (item.key === "schedule" && activeView === "schedule");

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-full transition hover:bg-zinc-800 ${
                collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5"
              } ${
                isActive
                  ? "font-bold text-white"
                  : "font-medium text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-zinc-300">
                {renderNavIcon(item.icon)}
              </span>
              {!collapsed && <span className="text-[14px]">{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <div className={`mt-4 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex items-center rounded-full transition hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 ${
            collapsed ? "justify-center p-3" : "gap-3 px-4 py-2.5"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {!collapsed && (
            <span className="text-[14px] font-medium">Collapse</span>
          )}
        </button>
      </div>

      {/* User profile at bottom */}
      <div
        className={`mt-auto border-t border-zinc-800 pt-3 ${collapsed ? "flex justify-center" : ""}`}
      >
        <div
          className={`flex items-center rounded-full hover:bg-zinc-800 transition ${
            collapsed ? "justify-center p-1.5" : "gap-3 px-3 py-2"
          }`}
        >
          <CoachAuthButton avatarOnly avatarSize={32} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {currentUserName}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {isAdmin ? "Admin" : "Coach"}
              </p>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
