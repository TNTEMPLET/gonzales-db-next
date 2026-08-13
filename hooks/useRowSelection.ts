"use client";

import { useCallback, useMemo, useState } from "react";

export function useRowSelection<T extends string | number = string>(
  initialSelected: T[] = [],
) {
  const [selectedSet, setSelectedSet] = useState<Set<T>>(
    () => new Set(initialSelected),
  );

  const selectedIds = useMemo(
    () => Array.from(selectedSet),
    [selectedSet],
  );

  const selectedCount = selectedSet.size;

  const isSelected = useCallback(
    (id: T) => selectedSet.has(id),
    [selectedSet],
  );

  const toggleId = useCallback((id: T) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((allIds: T[]) => {
    setSelectedSet(new Set(allIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSet(new Set());
  }, []);

  const toggleAll = useCallback((allIds: T[]) => {
    setSelectedSet((prev) => {
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }, []);

  const isAllSelected = useCallback(
    (allIds: T[]) => allIds.length > 0 && allIds.every((id) => selectedSet.has(id)),
    [selectedSet],
  );

  return {
    selectedSet,
    selectedIds,
    selectedCount,
    isSelected,
    toggleId,
    selectAll,
    clearSelection,
    toggleAll,
    isAllSelected,
  };
}
