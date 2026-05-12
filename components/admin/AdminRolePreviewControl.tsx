"use client";

import { useEffect, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";
import {
  resolvePreviewUserAccess,
  type PreviewUserSnapshot,
} from "@/lib/admin/viewPreview";

export type { PreviewUserSnapshot } from "@/lib/admin/viewPreview";

export type AdminViewPreviewRole =
  | "NONE"
  | "ADMIN"
  | "BOARD_MEMBER"
  | "PARK_DIRECTOR"
  | "ALL_STAR_VIEW_ONLY";

export const ADMIN_VIEW_PREVIEW_SESSION_KEY = "admin-view-preview-role";
export const ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY = "admin-view-preview-context";

export type AdminViewPreviewContext = {
  mode: "role" | "user";
  role: AdminViewPreviewRole;
  user: PreviewUserSnapshot | null;
};

const OPTIONS: Array<{ id: AdminViewPreviewRole; label: string }> = [
  { id: "NONE", label: "Live access (no preview)" },
  { id: "ADMIN", label: "Admin" },
  { id: "BOARD_MEMBER", label: "Board Member" },
  { id: "PARK_DIRECTOR", label: "Park Director" },
  { id: "ALL_STAR_VIEW_ONLY", label: "All-Star Vault Limited Admin" },
];

function isPreviewRole(value: string): value is AdminViewPreviewRole {
  return OPTIONS.some((option) => option.id === value);
}

function isPreviewUserEffectiveRole(
  value: unknown,
): value is PreviewUserSnapshot["memberships"][number]["effectiveRole"] {
  return (
    value === "MASTER_ADMIN" ||
    value === "ADMIN" ||
    value === "BOARD_MEMBER" ||
    value === "PARK_DIRECTOR"
  );
}

function normalizePreviewUser(raw: unknown): PreviewUserSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;
  if (typeof parsed.id !== "string" || typeof parsed.label !== "string") return null;

  if (Array.isArray(parsed.memberships)) {
    const memberships = parsed.memberships
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        if (row.organizationId !== "gonzales" && row.organizationId !== "ascension") {
          return null;
        }
        if (!isPreviewUserEffectiveRole(row.effectiveRole)) return null;
        return {
          organizationId: row.organizationId,
          effectiveRole: row.effectiveRole,
          allStarVaultView: Boolean(row.allStarVaultView),
        };
      })
      .filter(
        (
          value,
        ): value is PreviewUserSnapshot["memberships"][number] => value !== null,
      );
    if (memberships.length > 0) {
      return { id: parsed.id, label: parsed.label, memberships };
    }
  }

  if (
    parsed.id.includes("::") &&
    isPreviewUserEffectiveRole(parsed.effectiveRole)
  ) {
    const [legacyUserId, organizationId] = parsed.id.split("::");
    if (organizationId !== "gonzales" && organizationId !== "ascension") {
      return null;
    }
    return {
      id: legacyUserId,
      label: parsed.label,
      memberships: [
        {
          organizationId,
          effectiveRole: parsed.effectiveRole,
          allStarVaultView: Boolean(parsed.allStarVaultView),
        },
      ],
    };
  }

  return null;
}

function normalizePreviewContext(raw: string | null): AdminViewPreviewContext {
  if (!raw) return { mode: "role", role: "NONE", user: null };
  try {
    const parsed = JSON.parse(raw) as Partial<AdminViewPreviewContext>;
    const mode = parsed.mode === "user" ? "user" : "role";
    const role = isPreviewRole(parsed.role || "") ? parsed.role! : "NONE";
    const user = parsed.user ? normalizePreviewUser(parsed.user) : null;
    return { mode, role, user };
  } catch {
    return { mode: "role", role: "NONE", user: null };
  }
}

export function readAdminViewPreviewContext(): AdminViewPreviewContext {
  if (typeof window === "undefined") return { mode: "role", role: "NONE", user: null };
  const rawContext = window.sessionStorage.getItem(ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY);
  if (rawContext) return normalizePreviewContext(rawContext);
  // Backward compatibility with old single-role preview key.
  const rawRole = window.sessionStorage.getItem(ADMIN_VIEW_PREVIEW_SESSION_KEY);
  const role = rawRole && isPreviewRole(rawRole) ? rawRole : "NONE";
  return { mode: "role", role, user: null };
}

export function readAdminViewPreviewRole(
  organizationId?: ContentOrgId | null,
): AdminViewPreviewRole {
  const context = readAdminViewPreviewContext();
  if (context.mode === "user" && context.user) {
    const access = resolvePreviewUserAccess(context.user, organizationId);
    if (access.allStarVaultView) return "ALL_STAR_VIEW_ONLY";
    if (access.effectiveRole === "MASTER_ADMIN") return "ADMIN";
    return access.effectiveRole;
  }
  return context.role;
}

export default function AdminRolePreviewControl({
  enabled,
  currentOrg,
  allowViewByUser = false,
  viewByUserOrgScope = "all",
}: {
  enabled: boolean;
  currentOrg?: ContentOrgId;
  allowViewByUser?: boolean;
  viewByUserOrgScope?: "all" | "current";
}) {
  const [context, setContext] = useState<AdminViewPreviewContext>({
    mode: "role",
    role: "NONE",
    user: null,
  });
  const [userOptions, setUserOptions] = useState<PreviewUserSnapshot[]>([]);
  const role = context.mode === "role" ? context.role : "NONE";

  const saveContext = (next: AdminViewPreviewContext) => {
    setContext(next);
    window.sessionStorage.setItem(ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY, JSON.stringify(next));
    window.sessionStorage.setItem(ADMIN_VIEW_PREVIEW_SESSION_KEY, next.role);
    window.dispatchEvent(new Event("admin-view-preview-updated"));
  };

  useEffect(() => {
    if (!enabled) return;
    setContext(readAdminViewPreviewContext());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const cls = "admin-preview-readonly";
    const previewRole =
      context.mode === "user" && context.user
        ? readAdminViewPreviewRole(currentOrg)
        : context.role;
    if (previewRole === "ALL_STAR_VIEW_ONLY") {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => {
      document.body.classList.remove(cls);
    };
  }, [enabled, context, currentOrg]);

  useEffect(() => {
    if (!enabled || !allowViewByUser) return;
    let cancelled = false;
    (async () => {
      try {
        const endpoint =
          viewByUserOrgScope === "current" && currentOrg
            ? `/api/admin/preview/users?org=${encodeURIComponent(currentOrg)}`
            : "/api/admin/preview/users";
        const response = await fetch(endpoint);
        if (!response.ok) return;
        const data = (await response.json()) as { users?: PreviewUserSnapshot[] };
        if (!cancelled) setUserOptions(data.users || []);
      } catch {
        if (!cancelled) setUserOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, allowViewByUser, currentOrg, viewByUserOrgScope]);

  if (!enabled) return null;

  return (
    <div className="space-y-2" data-admin-preview-ignore="true">
      {context.mode === "user" && context.user ? (
        <div className="rounded-lg border border-cyan-700 bg-cyan-950/40 px-3 py-2 text-xs text-cyan-200">
          Preview mode active: <span className="font-semibold">{context.user.label}</span> (user view, UI-only)
        </div>
      ) : null}
      {context.mode === "role" && role !== "NONE" ? (
        <div className="rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          Preview mode active: <span className="font-semibold">{OPTIONS.find((option) => option.id === role)?.label}</span> (UI-only)
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <span>View by role</span>
        <select
          data-admin-preview-allow="true"
          value={role}
          onChange={(event) => {
            const next = event.target.value as AdminViewPreviewRole;
            saveContext({ mode: "role", role: next, user: null });
          }}
          className="rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
        >
          {OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {allowViewByUser ? (
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <span>View by user</span>
          <select
            data-admin-preview-allow="true"
            value={context.mode === "user" ? context.user?.id || "" : ""}
            onChange={(event) => {
              const selectedId = event.target.value;
              if (!selectedId) {
                saveContext({ mode: "role", role: "NONE", user: null });
                return;
              }
              const selectedUser = userOptions.find((option) => option.id === selectedId) || null;
              if (!selectedUser) return;
              const access = resolvePreviewUserAccess(selectedUser, currentOrg);
              const previewRole: AdminViewPreviewRole = access.allStarVaultView
                ? "ALL_STAR_VIEW_ONLY"
                : access.effectiveRole === "MASTER_ADMIN"
                  ? "ADMIN"
                  : access.effectiveRole;
              saveContext({
                mode: "user",
                role: previewRole,
                user: selectedUser,
              });
            }}
            className="rounded-md bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 min-w-[220px]"
          >
            <option value="">Select user...</option>
            {userOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {(context.mode !== "role" || context.role !== "NONE" || context.user) ? (
        <button
          type="button"
          data-admin-preview-allow="true"
          onClick={() => {
            const resetContext: AdminViewPreviewContext = {
              mode: "role",
              role: "NONE",
              user: null,
            };
            saveContext(resetContext);
            window.sessionStorage.removeItem(ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY);
            window.sessionStorage.removeItem(ADMIN_VIEW_PREVIEW_SESSION_KEY);
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 w-fit"
        >
          Reset Preview
        </button>
      ) : null}
      <style jsx global>{`
        body.admin-preview-readonly main button:not([data-admin-preview-allow="true"]),
        body.admin-preview-readonly main input:not([data-admin-preview-allow="true"]),
        body.admin-preview-readonly main textarea:not([data-admin-preview-allow="true"]),
        body.admin-preview-readonly main select:not([data-admin-preview-allow="true"]) {
          pointer-events: none !important;
          opacity: 0.55 !important;
        }
        /* All-Star vault observer preview: restore interactions inside this subtree (toggles, ballot tools, exports). */
        body.admin-preview-readonly main section[data-admin-vault-interactive="true"] button,
        body.admin-preview-readonly main section[data-admin-vault-interactive="true"] input,
        body.admin-preview-readonly main section[data-admin-vault-interactive="true"] textarea,
        body.admin-preview-readonly main section[data-admin-vault-interactive="true"] select {
          pointer-events: auto !important;
          opacity: 1 !important;
        }
        /* Submitted-ballot roster modal triggers: belt-and-suspenders vs. nested hit targets in preview. */
        body.admin-preview-readonly main button[data-ballot-roster-trigger="true"] {
          pointer-events: auto !important;
          opacity: 1 !important;
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
