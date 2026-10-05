"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import { SPRING_FORECAST_BAR_COLOR } from "@/lib/ageDivisions/springForecastTable";
import {
  readSpringComparisonOpen,
  SPRING_COMPARISON_PANEL_ID,
  writeSpringComparisonOpen,
} from "@/lib/ageDivisions/springComparison";

function browserComparisonStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const springComparisonListeners = new Set<() => void>();

function subscribeSpringComparison(onStoreChange: () => void) {
  springComparisonListeners.add(onStoreChange);
  return () => {
    springComparisonListeners.delete(onStoreChange);
  };
}

function emitSpringComparison() {
  for (const listener of springComparisonListeners) listener();
}

function springComparisonSnapshot(): boolean {
  return readSpringComparisonOpen(browserComparisonStorage());
}

function springComparisonServerSnapshot(): boolean {
  return false;
}

type ComparisonOpenState = { open: boolean; toggle: () => void };

const ComparisonOpenContext = createContext<ComparisonOpenState | null>(null);

function SpringComparisonProvider({ children }: { children: ReactNode }) {
  const open = useSyncExternalStore(
    subscribeSpringComparison,
    springComparisonSnapshot,
    springComparisonServerSnapshot,
  );

  function toggle() {
    writeSpringComparisonOpen(browserComparisonStorage(), !open);
    emitSpringComparison();
  }

  return <ComparisonOpenContext.Provider value={{ open, toggle }}>{children}</ComparisonOpenContext.Provider>;
}

/** Mounts the open-state store only for Spring. Fall renders `children` with no store. */
export function WithSpringComparisonState({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return children;
  return <SpringComparisonProvider>{children}</SpringComparisonProvider>;
}

function useComparisonOpen(): ComparisonOpenState {
  const state = useContext(ComparisonOpenContext);
  if (!state) throw new Error("Spring comparison header is outside its provider");
  return state;
}

function ComparisonChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}

export function SpringComparisonHeader({ summary, loading }: { summary: string; loading: boolean }) {
  const { open, toggle } = useComparisonOpen();
  return <SpringComparisonHeaderView open={open} summary={summary} loading={loading} onToggle={toggle} />;
}

export function SpringComparisonHeaderView({
  open,
  summary,
  loading,
  onToggle,
}: {
  open: boolean;
  summary: string;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 py-3 text-left hover:bg-zinc-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400 sm:px-6"
      aria-expanded={open}
      aria-controls={SPRING_COMPARISON_PANEL_ID}
      data-testid="spring-comparison-toggle"
      onClick={onToggle}
    >
      <span className="text-sm font-semibold text-white">Current vs proposed</span>
      {open ? (
        <span className="min-w-0 flex-1" />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-normal text-zinc-400" data-testid="spring-comparison-summary">
          {summary}
        </span>
      )}
      {loading ? <span className="shrink-0 text-xs text-zinc-500">Updating…</span> : null}
      <ComparisonChevron open={open} />
    </button>
  );
}

export function SpringComparisonPanel({ springCombined, children }: { springCombined: boolean; children: ReactNode }) {
  const { open } = useComparisonOpen();
  return (
    <SpringComparisonPanelView open={open} springCombined={springCombined}>
      {children}
    </SpringComparisonPanelView>
  );
}

export function SpringComparisonPanelView({
  open,
  springCombined,
  children,
}: {
  open: boolean;
  springCombined: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={SPRING_COMPARISON_PANEL_ID}
      hidden={!open}
      className={open ? "border-t border-zinc-800 px-4 pb-4 pt-3 sm:px-6" : undefined}
    >
      {springCombined ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400" data-testid="spring-comparison-legend">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SPRING_FORECAST_BAR_COLOR.dyb }} aria-hidden="true" />
            DYB (Gonzales)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SPRING_FORECAST_BAR_COLOR.llb }} aria-hidden="true" />
            LLB (Ascension)
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** No extra node on Fall, so the classic section keeps its existing tree. */
export function SpringComparisonAlerts({ spring, children }: { spring: boolean; children: ReactNode }) {
  if (!spring) return children;
  return <div className="px-4 sm:px-6">{children}</div>;
}

/** Hides the table until the Spring section is expanded. Fall returns the table as-is. */
export function SpringComparisonDetail({
  spring,
  springCombined,
  children,
}: {
  spring: boolean;
  springCombined: boolean;
  children: ReactNode;
}) {
  if (!spring) return children;
  return <SpringComparisonPanel springCombined={springCombined}>{children}</SpringComparisonPanel>;
}
