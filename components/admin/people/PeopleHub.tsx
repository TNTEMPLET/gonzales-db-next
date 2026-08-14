"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import AdminCoachingInterestManager from "@/components/admin/AdminCoachingInterestManager";
import AdminUsersManager from "@/components/admin/AdminUsersManager";
import AdminVolunteersManager from "@/components/admin/AdminVolunteersManager";
import AdminRoleAssignmentConsole from "@/components/admin/AdminRoleAssignmentConsole";
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
  roles: {
    label: "Role Assignment",
    description:
      "Master Admin console: grant, change, and revoke organization admin roles with least-privilege guidance.",
  },
};

export default function PeopleHub({
  targetOrg,
  directoryScope = targetOrg,
  initialSection = "directory",
  focusUserId,
  isMaster = false,
  canDirectory = true,
  canVolunteers = true,
  canCoachingInterest = true,
  currentAdminEmail = null,
}: {
  targetOrg: ContentOrgId;
  /** Directory-only scope; "all" is the master-only cross-org aggregate view. */
  directoryScope?: ContentOrgId | "all";
  initialSection?: PeopleSection;
  focusUserId?: string | null;
  isMaster?: boolean;
  canDirectory?: boolean;
  canVolunteers?: boolean;
  canCoachingInterest?: boolean;
  currentAdminEmail?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const availableSections = useMemo(() => {
    const sections: PeopleSection[] = [];
    if (canDirectory) sections.push("directory");
    if (canVolunteers) sections.push("volunteers");
    if (canCoachingInterest) sections.push("coaching-interest");
    if (isMaster) sections.push("roles");
    return sections;
  }, [canDirectory, canVolunteers, canCoachingInterest, isMaster]);

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
      router.push(`/admin/people?${params.toString()}`);
    },
    [router, searchParams, targetOrg],
  );

  const setDirectoryScope = useCallback(
    (nextOrg: ContentOrgId | "all") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", "directory");
      params.set("org", nextOrg);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
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
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="People Hub Sections">
          {availableSections.map((s) => {
            const active = section === s;
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {SECTION_META[s].label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">{SECTION_META[section].description}</p>
          {section === "directory" && canDirectory && isMaster ? (
            <button
              type="button"
              onClick={() =>
                setDirectoryScope(directoryScope === "all" ? targetOrg : "all")
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              {directoryScope === "all"
                ? "Switch to single org view"
                : "View all sites directory"}
            </button>
          ) : null}
        </div>

        {section === "directory" && canDirectory && (
          <AdminUsersManager targetOrg={directoryScope} />
        )}

        {section === "volunteers" && canVolunteers && (
          <AdminVolunteersManager targetOrg={targetOrg} focusUserId={focusUserId} />
        )}

        {section === "coaching-interest" && canCoachingInterest && (
          <AdminCoachingInterestManager targetOrg={targetOrg} />
        )}

        {section === "roles" && isMaster && (
          <AdminRoleAssignmentConsole
            currentAdminEmail={currentAdminEmail}
            isMasterAdmin={isMaster}
          />
        )}
      </div>
    </div>
  );
}
