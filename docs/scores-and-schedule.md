# Scores, schedule, and Assignr — which tool?

| Job | Open | Notes |
|-----|------|--------|
| Enter / import game scores | `/admin/scores` | Score queue, GameChanger, file import |
| Officials & Assignr league schedule | `/admin/assignr` | External Assignr integration |
| Fall Ball field/draft scheduler | `/admin/scheduler` | Capability-gated (Fall Ball) |
| Tournament bracket layout & live pins | `/admin/tournament-brackets` | Master-only; separate from league scores |
| Rainout / tournament alerts | `/admin/tournament-alerts` or alerts on Scores (master) | Monitor + comms status |

Do **not** use Scores for bracket seeding or Assignr for final scores when GameChanger is connected — pick the row above that matches the operator job.
