# 11 — HoosLog Dictionary (v0)

**Date:** 2026-08-03 · **Status:** Seeded from the real sheet (`10_real_paper_sheet.png`, McMahon 2/23–3/1). William confirms/fills the ⚠ rows.

Why this doc exists (William's call, 2026-08-03): (1) a shared glossary — eventually an in-app reference page for freshmen/walk-ons/managers; (2) **the controlled vocabulary the plan importer parses against** — every workout-type string the coach writes maps to a dictionary entry, which is what makes deterministic (no-AI) parsing of the weekly Word/Excel plan feasible; (3) keeps docs and UI copy consistent.

Rule: one line per term. When a term is confirmed, flip its status. New coach shorthand gets added the week it first appears.

## Training vocabulary (from the sheet)

| Term | Meaning | Status |
|---|---|---|
| TR | **Training run** — an aerobic run. "TR + hurdles + drills" = aerobic run, then hurdle mobility, then drills | confirmed (William 2026-08-03) |
| Yoga | Thursday-morning team routine | confirmed (William) |
| LR | Long run | confirmed (sheet context) |
| WEIGHTS | Team lift | confirmed |
| 4xmile | 4 × 1-mile repeats | ⚠ confirm (incl. rest convention) |
| 2x200m | 2 × 200 m speed after the workout | ⚠ confirm |
| "200s were 29 high" | 200 m reps in the high-29-second range | ⚠ confirm |
| Fartlek 2x(4-3-2-1), 60 jog | 2 sets of 4-3-2-1 min on, 60 s jog recovery between | ⚠ confirm |
| NCAA DAY OFF | No organized practice that day — athletes still run on their own and log it | confirmed (William 2026-08-03) |
| CV | Critical velocity (workout pace zone) | from earlier docs |
| Doubles / AM–PM | Two runs in one day, logged separately, mileage sums | confirmed (sheet: 4/10 = 14) |
| bpm | Average heart rate for the run | confirmed |
| ft ↑ | Elevation gain | confirmed |
| Splits | Per-mile paces, listed in order | confirmed |
| Strides | Short relaxed accelerations, usually post-run | common usage |

## Product vocabulary (HoosLog terms — keep consistent in UI + docs)

| Term | Meaning |
|---|---|
| Weekly goal | The number in the TOTAL MILES box — coach's weekly mileage target, set **per athlete**, written into the week plan and delivered Monday. The athlete has full autonomy on how to distribute it; the coach watches cumulative progress toward it. |
| Day form | The one entry unit: a day's run(s) — distance + pace + RPE + flags + notes. Same form whether filled daily or batched Sunday. |
| Sync | Saving a day form. Every sync is instantly visible to the coach — no separate submit step. |
| Week | 7 day forms. Complete when all 7 are in by the Sunday deadline. |
| Deadline / due | The Sunday hand-in time (exact time TBD). Reminders fire T-2h and T-1h. |
| Pain flag | Dedicated "anything hurting?" field; coach sees it the same day. The killer feature. |
| Question | Athlete's question-for-coach field on a day form. |
| Grade | Coach's Sunday-night review: per-day ✓ + per-day comment where warranted + one weekly comment. No scores. |
| Group | Training group (G1/G2/G3…) — the unit plans are written for. |
| Importer | Upload of the coach's weekly Word/Excel plan → populates every athlete's week. |
