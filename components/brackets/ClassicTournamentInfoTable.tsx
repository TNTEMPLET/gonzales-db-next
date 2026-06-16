"use client";

import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";
import type { ClassicGridPlacement } from "@/lib/tournament-brackets/classicDoubleElimGridPlacement";
import { tournamentInfoRows } from "@/lib/tournament-brackets/tournamentInfo";

import styles from "@/components/brackets/TournamentBracketView.module.css";

type Props = {
  info?: BracketTournamentInfo | null;
  placement: ClassicGridPlacement;
};

export default function ClassicTournamentInfoTable({ info, placement }: Props) {
  const rows = tournamentInfoRows(info);
  if (rows.length === 0) return null;

  const { col, row, span, colSpan } = placement;

  return (
    <div
      className={styles.classicTournamentInfoCell}
      style={{
        gridColumn: colSpan ? `${col} / span ${colSpan}` : col,
        gridRow: `${row} / span ${span}`,
      }}
    >
      <table className={styles.classicTournamentInfoTable}>
        <caption className={styles.classicTournamentInfoCaption}>Tournament information</caption>
        <tbody>
          {rows.map(({ key, label, value }) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
