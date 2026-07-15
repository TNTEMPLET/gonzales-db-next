"use client";

export type ScoresSectionId = "queue" | "gamechanger" | "import";

const SECTIONS: Array<{ id: ScoresSectionId; label: string; description: string }> = [
  {
    id: "queue",
    label: "Score queue",
    description: "League and tournament games ready for manual entry",
  },
  {
    id: "gamechanger",
    label: "GameChanger",
    description: "Connect widgets, preview finals, import completed scores",
  },
  {
    id: "import",
    label: "File import",
    description: "Spreadsheet / CSV score imports",
  },
];

export default function ScoresWorkflowNav({
  active,
  onChange,
}: {
  active: ScoresSectionId;
  onChange: (id: ScoresSectionId) => void;
}) {
  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b border-zinc-800 pb-3"
      aria-label="Scores workflow"
    >
      {SECTIONS.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            title={section.description}
            className={
              isActive
                ? "rounded-lg border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-100"
                : "rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
            }
            aria-current={isActive ? "page" : undefined}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
