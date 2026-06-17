"use client";

import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";
import type { ClassicGridPlacement } from "@/lib/tournament-brackets/classicDoubleElimGridPlacement";
import { tournamentInfoFields } from "@/lib/tournament-brackets/tournamentInfo";

import styles from "@/components/brackets/TournamentBracketView.module.css";

type Props = {
  info?: BracketTournamentInfo | null;
  placement: ClassicGridPlacement;
};

export default function ClassicTournamentInfoTable({ info, placement }: Props) {
  const fields = tournamentInfoFields(info);
  if (fields.length === 0) return null;

  const { col, row, span, colSpan } = placement;

  return (
    <div
      className={styles.classicTournamentInfoCell}
      style={{
        gridColumn: colSpan ? `${col} / span ${colSpan}` : col,
        gridRow: `${row} / span ${span}`,
      }}
    >
      <div className={styles.classicTournamentInfoGrid} aria-label="Tournament information">
        <div className={styles.classicTournamentInfoCaption}>Tournament information</div>
        {fields.map(({ key, label, lines }) => (
          <section
            key={key}
            className={
              key === "nextLevel"
                ? `${styles.classicTournamentInfoCard} ${styles.classicTournamentInfoCardWide}`
                : styles.classicTournamentInfoCard
            }
          >
            <div className={styles.classicTournamentInfoLabel}>{label}</div>
            <div className={styles.classicTournamentInfoValue}>
              {lines.map((line, idx) =>
                line ? (
                  <div key={`${key}-${idx}`} className={styles.classicTournamentInfoLine}>
                    {line}
                  </div>
                ) : (
                  <div key={`${key}-${idx}`} className={styles.classicTournamentInfoLineBreak} aria-hidden />
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
