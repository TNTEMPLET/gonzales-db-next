"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "gdb-admin-sidebar-state";

type StoredState = {
  collapsed: boolean;
  openSubcategoryIds: string[];
};

const DEFAULT_STATE: StoredState = { collapsed: false, openSubcategoryIds: [] };

function readStoredState(): StoredState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      collapsed: Boolean(parsed.collapsed),
      openSubcategoryIds: Array.isArray(parsed.openSubcategoryIds) ? parsed.openSubcategoryIds : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeStoredState(next: StoredState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

type AdminSidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  isSubcategoryOpen: (id: string) => boolean;
  toggleSubcategory: (id: string) => void;
};

const AdminSidebarContext = createContext<AdminSidebarContextValue | null>(null);

export function AdminSidebarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredState>(DEFAULT_STATE);

  useEffect(() => {
    setState(readStoredState());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, collapsed: !prev.collapsed };
      writeStoredState(next);
      return next;
    });
  }, []);

  const toggleSubcategory = useCallback((id: string) => {
    setState((prev) => {
      const isOpen = prev.openSubcategoryIds.includes(id);
      const next = {
        ...prev,
        openSubcategoryIds: isOpen
          ? prev.openSubcategoryIds.filter((existing) => existing !== id)
          : [...prev.openSubcategoryIds, id],
      };
      writeStoredState(next);
      return next;
    });
  }, []);

  const isSubcategoryOpen = useCallback(
    (id: string) => state.openSubcategoryIds.includes(id),
    [state.openSubcategoryIds],
  );

  const value = useMemo(
    () => ({ collapsed: state.collapsed, toggleCollapsed, isSubcategoryOpen, toggleSubcategory }),
    [state.collapsed, toggleCollapsed, isSubcategoryOpen, toggleSubcategory],
  );

  return <AdminSidebarContext.Provider value={value}>{children}</AdminSidebarContext.Provider>;
}

export function useAdminSidebar(): AdminSidebarContextValue {
  const ctx = useContext(AdminSidebarContext);
  if (!ctx) {
    throw new Error("useAdminSidebar must be used within an AdminSidebarProvider");
  }
  return ctx;
}
