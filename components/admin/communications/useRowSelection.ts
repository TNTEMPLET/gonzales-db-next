"use client";

import { useCallback, useState } from "react";

/**
 * Set-based row selection, generalizing the pattern hand-rolled in
 * AdminUsersManager.tsx (selectedUserIds), TravelEventDetailClient.tsx
 * (selectedIds), and AllStarVaultManager.tsx (selectedInviteCoachIds).
 */
export function useRowSelection<T extends string = string>() {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());

  const toggle = useCallback((id: T, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: T[]) => {
    setSelected((prev) => new Set([...prev, ...ids]));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, selectMany, clear, size: selected.size };
}
