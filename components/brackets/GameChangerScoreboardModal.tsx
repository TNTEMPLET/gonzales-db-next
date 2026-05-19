"use client";

import { useEffect, useId, useRef } from "react";

import {
  clearGcScoreboardWidget,
  loadGcScoreboardSdk,
  type GcScoreboardInitOptions,
} from "@/lib/gamechanger/loadGcScoreboardSdk";
import type { BracketGameChanger } from "@/lib/gamechanger/types";

import styles from "@/components/brackets/GameChangerScoreboardModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  gameChanger: BracketGameChanger;
  /** Shown in modal header for context. */
  matchLabel?: string;
};

export default function GameChangerScoreboardModal({
  open,
  onClose,
  gameChanger,
  matchLabel,
}: Props) {
  const reactId = useId();
  const hostId = `gc-scoreboard-host-${reactId.replace(/:/g, "")}`;
  const targetSelector = `#${hostId}`;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;

    void (async () => {
      try {
        const sdk = await loadGcScoreboardSdk();
        if (cancelled) return;
        clearGcScoreboardWidget();
        const init: GcScoreboardInitOptions = {
          target: targetSelector,
          widgetId: gameChanger.widgetId,
          maxVerticalGamesVisible: gameChanger.maxVerticalGamesVisible ?? 4,
        };
        if (gameChanger.layout) init.layout = gameChanger.layout;
        sdk.init(init);
      } catch {
        /* Host may unmount before SDK loads */
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      clearGcScoreboardWidget();
      previouslyFocusedRef.current?.focus();
    };
  }, [open, gameChanger, targetSelector, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${hostId}-title`}
      >
        <header className={styles.header}>
          <div>
            <h2 id={`${hostId}-title`} className={styles.title}>
              Live scoreboard
            </h2>
            {matchLabel ? <p className={styles.subtitle}>{matchLabel}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close scoreboard and return to bracket"
          >
            Close
          </button>
        </header>
        <div className={styles.widgetHost}>
          <div id={hostId} className={styles.widgetTarget} />
        </div>
        <p className={styles.footer}>Scores from GameChanger · Updates automatically</p>
      </div>
    </div>
  );
}
