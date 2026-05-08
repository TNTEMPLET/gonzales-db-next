"use client";

import { useEffect, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";

export type AdminViewPreviewRole =
  | "NONE"
  | "ADMIN"
  | "BOARD_MEMBER"
  | "PARK_DIRECTOR"
  | "ALL_STAR_VIEW_ONLY";

export const ADMIN_VIEW_PREVIEW_SESSION_KEY = "admin-view-preview-role";
export const ADMIN_VIEW_PREVIEW_CONTEXT_SESSION_KEY = "admin-view-preview-context";

type PreviewUserSnapshot = {
  id: string;
  label: string;
  effectiveRole: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR";
  allStarVaultView: boolean;
};

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

function normalizePreviewContext(raw: string | null): AdminViewPreviewContext {
  if (!raw) return { mode: "role", role: "NONE", user: null };
  try {
    const parsed = JSON.parse(raw) as Partial<AdminViewPreviewContext>;
    const mode = parsed.mode === "user" ? "user" : "role";
    const role = isPreviewRole(parsed.role || "") ? parsed.role! : "NONE";
    const user =
      parsed.user &&
      typeof parsed.user.id === "string" &&
      typeof parsed.user.label === "string" &&
      (parsed.user.effectiveRole === "MASTER_ADMIN" ||
        parsed.user.effectiveRole === "ADMIN" ||
        parsed.user.effectiveRole === "BOARD_MEMBER" ||
        parsed.user.effectiveRole === "PARK_DIRECTOR")
        ? {
            id: parsed.user.id,
            label: parsed.user.label,
            effectiveRole: parsed.user.effectiveRole,
            allStarVaultView: Boolean(parsed.user.allStarVaultView),
          }
        : null;
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

export function readAdminViewPreviewRole(): AdminViewPreviewRole {
  const context = readAdminViewPreviewContext();
  if (context.mode === "user" && context.user) {
    if (context.user.allStarVaultView) return "ALL_STAR_VIEW_ONLY";
    if (context.user.effectiveRole === "MASTER_ADMIN") return "ADMIN";
    return context.user.effectiveRole;
  }
  return context.role;
}

export default function AdminRolePreviewControl({
  enabled,
  currentOrg,
  allowViewByUser = false,
}: {
  enabled: boolean;
  currentOrg?: ContentOrgId;
  allowViewByUser?: boolean;
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
        ? context.user.allStarVaultView
          ? "ALL_STAR_VIEW_ONLY"
          : context.user.effectiveRole
        : context.role;
    if (previewRole === "ALL_STAR_VIEW_ONLY") {
      document.body.classList.add(cls);
    } else {
      document.body.classList.remove(cls);
    }
    return () => {
      document.body.classList.remove(cls);
    };
  }, [enabled, context]);

  useEffect(() => {
    if (!enabled || !allowViewByUser) return;
    let cancelled = false;
    (async () => {
      try {
        const endpoint = currentOrg
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
  }, [enabled, allowViewByUser, currentOrg]);

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
              saveContext({
                mode: "user",
                role:
                  selectedUser.allStarVaultView
                    ? "ALL_STAR_VIEW_ONLY"
                    : selectedUser.effectiveRole === "MASTER_ADMIN"
                      ? "ADMIN"
                      : selectedUser.effectiveRole,
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
      `}</style>
    </div>
  );
}
