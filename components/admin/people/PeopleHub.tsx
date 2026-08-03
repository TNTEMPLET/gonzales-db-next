"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import AdminCoachingInterestManager from "@/components/admin/AdminCoachingInterestManager";
import AdminUsersManager from "@/components/admin/AdminUsersManager";
import AdminVolunteersManager from "@/components/admin/AdminVolunteersManager";
import type { ContentOrgId } from "@/lib/siteConfig";

import {
  parsePeopleSection,
  type PeopleSection,
} from "@/lib/admin/people/sections";

export type { PeopleSection };
export { parsePeopleSection };

const SECTION_META: Record<
  PeopleSection,
  { label: string; description: string }
> = {
  directory: {
    label: "Directory",
    description:
      "Registered accounts, coach flags, admin access, duplicates, and bulk email.",
  },
  volunteers: {
    label: "Volunteer Cards",
    description:
      "JDP background checks, Abuse Awareness certificates, roles, and readiness.",
  },
  "coaching-interest": {
    label: "Coaching Interest",
    description:
      "Fall Ball coach leads, follow-up status, and export for registration planning.",
  },
};

export default function PeopleHub({
  targetOrg,
  initialSection,
  focusUserId,
  isMaster,
  canDirectory,
  canVolunteers,
  canCoachingInterest,
}: {
  targetOrg: ContentOrgId;
  initialSection: PeopleSection;
  focusUserId?: string | null;
  isMaster: boolean;
  canDirectory: boolean;
  canVolunteers: boolean;
  canCoachingInterest: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const availableSections = useMemo(() => {
    const sections: PeopleSection[] = [];
    if (canDirectory) sections.push("directory");
    if (canVolunteers) sections.push("volunteers");
    if (canCoachingInterest) sections.push("coaching-interest");
    return sections;
  }, [canDirectory, canVolunteers, canCoachingInterest]);

  const section = useMemo(() => {
    const fromUrl = parsePeopleSection(searchParams.get("section"));
    if (availableSections.includes(fromUrl)) return fromUrl;
    if (availableSections.includes(initialSection)) return initialSection;
    return availableSections[0] ?? "directory";
  }, [searchParams, initialSection, availableSections]);

  const setSection = useCallback(
    (next: PeopleSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", next);
      params.set("org", targetOrg);
      if (next !== "volunteers") {
        params.delete("userId");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, targetOrg],
  );

  if (availableSections.length === 0) {
    return (
      <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-6 text-amber-100">
        You do not have access to any People sections for this organization.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav
        className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3"
        aria-label="People sections"
      >
        {availableSections.map((id) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={
                active
                  ? "rounded-lg border border-violet-500/60 bg-violet-950/50 px-3 py-2 text-sm font-medium text-violet-100"
                  : "rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
              }
              aria-current={active ? "page" : undefined}
            >
              {SECTION_META[id].label}
            </button>
          );
        })}
      </nav>

      <p className="text-sm text-zinc-400">{SECTION_META[section].description}</p>

      {section === "directory" && canDirectory ? (
        <AdminUsersManager targetOrg={targetOrg} />
      ) : null}

      {section === "volunteers" && canVolunteers ? (
        <AdminVolunteersManager
          targetOrg={targetOrg}
          focusUserId={focusUserId || null}
          isMaster={isMaster}
        />
      ) : null}

      {section === "coaching-interest" && canCoachingInterest ? (
        <AdminCoachingInterestManager targetOrg={targetOrg} isMaster={isMaster} />
      ) : null}
    </div>
  );
}
