"use client";

import { useCallback, useEffect, useState } from "react";

import type { BracketColorScheme } from "@/lib/tournament-brackets/bracketTheme";

const STORAGE_KEY = "gonzales-bracket-color-scheme";

function isBracketColorScheme(value: string | null): value is BracketColorScheme {
  return value === "light" || value === "dark";
}

function readStoredScheme(): BracketColorScheme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isBracketColorScheme(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function useBracketColorScheme() {
  const [colorScheme, setColorSchemeState] = useState<BracketColorScheme>("light");

  useEffect(() => {
    setColorSchemeState(readStoredScheme());
  }, []);

  const setColorScheme = useCallback((next: BracketColorScheme) => {
    setColorSchemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === "light" ? "dark" : "light");
  }, [colorScheme, setColorScheme]);

  return { colorScheme, setColorScheme, toggleColorScheme };
}
