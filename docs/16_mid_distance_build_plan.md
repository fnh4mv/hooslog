# 16 — Two training groups (distance + mid-distance)

**Status:** SHIPPED 2026-08-31 — form, schema, importer, coach grid and athlete view all built, `npm run build` green, 34/34 importer fixtures pass. **Migration `0011_training_groups.sql` still needs pasting into the Supabase SQL editor** — until then the app keeps importing distance-only weeks through the v3 function and the upload says so in plain English.
**Problem:** the program runs **two schedules, not one** — a distance schedule and a
mid-distance schedule. Everyone still gets a weekly mileage number; the group only
decides *which workout column* an athlete sees.

## Decisions (locked 2026-08-31, William)

24. **One file, one dropbox — not two.** The week-plan workbook carries both schedules
    (Week Plan `C` = distance, `D` = mid-distance) and the roster's group assignment
    (Goals `D`). Rejected two-dropbox because `import_week()` is deliberately one
    transaction: two uploads can half-post a week, and group-by-which-box makes an
    athlete in both files or neither file a silent failure. Dunbar builds both squads'
    weeks, so there is no two-author reason to split the file.
25. **Group is sticky and lives on the athlete.** `profiles.training_group`
    (`'distance' | 'mid'`, default `'distance'`). The upload sets it; a **blank** group
    cell means *no change* — never a silent reset to distance. Moving a guy is one cell.
26. **Coach grid splits into two sections** — Distance roster under the distance plan
    row, then Mid-D roster under the mid-D plan row.
27. **Everyone gets mileage, both groups.** The goal model (locked 18) is unchanged;
    group and mileage are independent axes. A mid-D guy on distance volume is expressible.

## The form (done)

`docs/templates/hooslog_week_plan_template_v2.xlsx`, built by
`scripts/build_week_template.py` (regenerate, never hand-edit — the template is the
importer's format contract, locked 23).

| Tab | Change |
|---|---|
| Week Plan | `C5` `WORKOUT PLAN` → `DISTANCE PLAN`; new `D5` `MID-DISTANCE PLAN`, `D6:D12` yellow |
| Goals | new `D` `GROUP` — dropdown Distance / Mid-D, blank allowed; 30 rostered athletes pre-filled (no example row to delete); Mid-D / Distance counters moved to `F`/`G` |
| READ ME | rewritten for two columns + sticky groups |

**Verified:** the currently-deployed v1 parser reads the v2 file cleanly — 30 goals,
distance plan posts, column D ignored. The template can go to the coaches before the
code ships. `hooslog_week_plan_v2_FILLED_demo.xlsx` is a filled example.

**Bug caught in build:** the Mid-D/Distance counter row was first written to columns
A–C. The importer walks Goals rows 2..N reading A–C, so it read the label as an athlete
and would have failed every upload with "row 33 has no email." Counters live in F/G.

## Build order

### 1. `0011_training_groups.sql`
- `profiles.training_group text not null default 'distance' check in ('distance','mid')`
- `week_plans.training_group` same; drop `week_plans_week_start_day_key`,
  add unique `(week_start, training_group, day)`. Existing rows default to
  `'distance'` — correct, everything posted so far is the distance schedule.
- **Add `training_group` to `guard_profile_columns()`** (0003). Without it an athlete
  can PATCH their own row and switch squads — same class as the privilege-escalation
  hole 0003 exists to close.
- `import_week` **v4**: `(p_week_start date, p_plans_distance text[], p_plans_mid text[], p_goals jsonb)`.
  Goals entries gain `"group": "distance"|"mid"|null`; null = leave the athlete's group
  alone. Upserts 7 rows per group. Still one transaction, still `security invoker`
  (coach RLS + the guard trigger's `is_coach()` early-return authorize the profile write).
  **Leave the v3 3-arg function in place** so a deploy that lands before the paste keeps
  working; drop it in a later cleanup.

### 2. `src/lib/importer.ts`
- `plansDistance` = `C6:C12`, `plansMid` = `D6:D12`.
- Goals `D` → group. Accept case-insensitively: `distance|dist|d` → `'distance'`;
  `mid-d|midd|md|mid|mid distance|middle distance` → `'mid'`; blank → `null`;
  anything else → error naming the cell.
- New warnings: mid-D athletes exist but `D6:D12` is empty ("they'll see no workouts");
  mid-D plan filled but nobody is assigned to it.
- **Backward compatible:** a v1 file has no column D → `plansMid` all-empty, every
  group `null` → nothing changes. Old files keep importing.

### 3. `src/app/coach/upload/actions.ts`
- Roster query selects `training_group`.
- Preview gains `plansMid` and, per goal, `group` + `currentGroup`, so the confirm
  screen can state plainly: **"Moving to Mid-D: Leath, Moore, Perry. Moving to
  Distance: none."** That summary is the safety net for a mistyped column.
- Commit passes both plan arrays + group to v4. If the RPC 404s because 0011 isn't
  pasted, say so in English ("the mid-distance upgrade hasn't been applied to the
  database yet") rather than leaking a Postgres error.

### 4. Reads + UI
- `src/lib/types.ts`: `Profile.training_group`, `WeekPlan.training_group`, `TrainingGroup`.
- `getWeekData`: fetch the week's plans (≤14 rows) and filter to the athlete's own
  group in JS — no extra round trip. Fixes `/log` and the coach drill-in together.
- `getCoachWeek`: return `plansByGroup`; rows carry the athlete's group.
- `/coach`: two sections, each with its own plan row. `/coach/upload`: preview shows
  both columns side by side + the group-change summary.

### 5. Verify
- Fixtures: v1 file still parses · v2 with groups · bad group value · mid-D athletes
  with an empty mid column · group column present but plan columns swapped.
- `npm run build` green; re-run the six RLS attacks from 0003 plus a new one:
  athlete PATCHes their own `training_group`.


## Shipped notes (2026-08-31)

- **34/34 fixture assertions pass** (`scripts/test-importer-groups.mjs`, fixtures from
  `scripts/make-importer-fixtures.py`). The case that mattered most — case 10 — proves a
  coach still holding the OLD one-column template keeps importing: plans land on the
  distance schedule, `plansMid` comes back empty, and nobody's group is touched.
- **Regression caught and fixed during testing:** pre-filling the template with all 30
  athletes meant every upload emitted ~29 separate "no mileage in column C" warnings.
  A 29-line warning panel is how a coach learns to ignore the panel — burying the one
  warning that matters (mid-D roster, empty mid-D column). Collapsed into a single
  summary line naming the first eight.
- **Building in the linked Linux shell needs a scratch copy.** `.next` can't be unlinked
  on the mounted volume, and the repo's `node_modules` holds macOS binaries. The working
  recipe: rsync the tree (minus `.next`, `node_modules`, `.git`) to `~/buildcheck`,
  `npm install`, add `lightningcss-linux-arm64-gnu` at the top level, then `npm run build`.
- **Left for William:** paste `0011`; delete the stale
  `docs/templates/hooslog_week_plan_template_v2.xlsx` and `docs/templates/preview/`
  scratch copies from disk (gitignored, never committed — the mount denies deletes).
