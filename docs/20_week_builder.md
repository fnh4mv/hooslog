# 20 — Post a week in the app (the week builder)

**Status:** BUILT 2026-09-15 — page, server action, colour pass and five test
suites green. **Not yet reviewed by a human and not yet seen by a coach.**
No migration: it writes through the existing `import_week` v5.

**Problem:** the spreadsheet importer is where nearly all of this project's
engineering has gone, and where both production incidents happened.

---

## Why this exists (the receipts)

Every one of these cost real time or a real upload:

| What went wrong | Where |
|---|---|
| `"12-13"` typed as a long run; Excel converted it to a date | 09-07 |
| Dunbar's upload rejected — `"12-13" isn't a training group` (column order) | 09-07 |
| Week posted with **every long run silently dropped** (code not deployed) | 09-07 |
| Counter row in A–C read as an athlete → `row 33 has no email` | 08-31 |
| Hint text in G1 read as the GROUP column (unbounded header scan) | 09-07 |
| GROUP column left blank → 27 athletes stayed on the distance schedule | 09-01 |
| `import_week` rewritten v1 → v5; 65 fixtures to hold the parser still | ongoing |

The common root is structural, not fixable: **Excel is an untyped format the
coach can hand-edit**, so every parse is a guess, and "the coach moved a
column" is not a bug you can close. You can only harden against it forever.

The counter-argument, which is real: Dunbar has built weeks in Excel for
years, and a form that is *slower* than opening last week's file loses on
adoption no matter how correct it is. That is what "Start from last week"
below is for. It is the load-bearing feature, not the form.

---

## Decisions

**30. The builder is the coach's first option; the importer stays as the
backup.** Not a replacement. `/coach/upload` is untouched and fully working,
labelled as the backup, and linked both ways. It gets deleted only after
Dunbar has posted several weeks through the builder — and then the 65
fixtures go with it.

**30a. Neither door gets its own write path.** Both call `import_week` v5
(migration 0012). One transaction, one set of rules, one place where plans,
goals and squad moves land. This is why there is no migration in this work,
and why **every week ever posted is untouched** — the function only ever
upserts the week it is handed.

**30b. The parsing rule lives in one module.** `src/lib/goal-input.ts` owns
`"57" / "55-60" / "60+" / "55 to 60"` and both doors call it, the same shape
as `resolve_display_name` in 0013. `importer.ts`'s `readMileage` delegates to
it and keeps only what is genuinely Excel's problem: a cell that already
arrived as a `Date`. Two parsers drift, and a drifted parser is how 12-13
became December.

**31. The posting week flips at noon on Sunday.** From 12:00 ET Sunday the
builder opens on the week *coming*, and stays on it until the following
Sunday noon. Before then it opens on the week in progress, which is still the
one a correction applies to.

**31a. The builder reasons in calendar weeks, not training days.** It uses
`todayET()`, not `trainingTodayET()`. The 3 AM rollover is correct for
logging — a run finished at 12:40 AM is yesterday's — but applied here it
means a coach opening the builder at 1 AM Monday lands on the week that just
ended, two hours after the same screen correctly offered him the week ahead.
The builder's own "this week" reference moved for the same reason, so the
banner cannot contradict its own default across midnight. **The grid and the
athlete portal keep the rollover.**

---

## What the form cannot do, by construction

Each of these maps to a row in the table above:

- **A range is text in a text box.** Parsed by the shared rule and echoed back
  as `avg 12.5` before anything posts. It cannot become a date.
- **There are no columns to reorder** — only labelled fields.
- **The roster is read from the database.** No counter row is parsed as an
  athlete; no email fails to match an account. The spreadsheet re-sends 31
  names and emails every week that the app already knows.
- **Training group is an always-explicit toggle** showing what the athlete
  *is*. Blank-means-no-change is not representable.
- **The long run is a field on the form**, so what is on screen is what posts.

## What it does to be faster than Excel

- **Start from last week** — pre-fills both schedules and every goal from the
  last posted week. Most weeks are last week with a few numbers changed.
- Distance → Mid-D copy, fill-down on both number columns, Enter moves down a
  column.
- **Draft autosave to `localStorage`, per week.** A half-built week surviving
  a refresh matters more than any parser bug.
- Live squad counts, live validation, a progress bar, and a review step that
  names anyone changing schedule before you post.

## The colour system (2026-09-15)

Three states legible without reading: **empty** = tinted, dashed (a gap, not a
field) · **filled** = white, solid, dark bold figure · **wrong** = orange.

New token `--color-teal` / `--color-teal-soft`. The two schedules carry a
colour each — navy for distance, teal for mid-distance — because confusing
them is the most expensive mistake this screen can make. The two hues already
in play were spoken for: navy is structure, and **orange has to keep meaning
only "look at this"**, which is what it stops meaning if it also decorates
half the page. Teal is scoped to the builder; the grid is untouched.

`scripts/test-contrast.mjs` composites Tailwind's `/60` opacities the way the
browser does, so banded rows and tinted boxes are measured as they render. It
caught two defects in the first pass of this very section: a `bg-orange` chip
with white text at **3.14:1** (11px bold is not large text — bold does not
lower the threshold below 18.66px), and placeholders at `text-navy/45`. This
palette has regressed twice before, both recorded in `globals.css`, both found
by eye long after shipping.

---

## Known limits, deliberately

- **A goal cannot be cleared.** `import_week` treats blank as "leave it
  alone", which is exactly what lets a coach fill only the long-run column
  mid-week. So an emptied box says **"blank keeps 57"** rather than implying
  removal. A real clear needs `import_week` v6 with an explicit marker
  (`"clear_goal": true` — NOT a null `goal`, which the spreadsheet path
  already sends for every blank cell). Excel never had a clear either.
- **An athlete with no account cannot be given a goal.** A goal hangs off a
  profile and `import_week` raises on an unknown email, correctly. The builder
  lists everyone on the allowlist without an account under "ON THE ROSTER, NO
  ACCOUNT YET" and says why. As of 2026-09-15 that is **Andrew Mangum
  (`utb5vp`)** and **Tyler Edson (`ret8ve`)** — 31 on the allowlist, 29 with
  accounts. This is the honest version of the spreadsheet's behaviour, which
  pre-filled their row, let the coach type a number, then refused the upload.
- **No React component tests exist in this project.** Everything below the
  server action is verified; the UI itself is not.

---

## Files

```
src/lib/goal-input.ts              the shared "55-60 / 60+" rule
src/lib/dates.ts                   + postingWeekMondayFrom / postingWeekMonday
src/lib/queries.ts                 + getWeekBuilder (roster, plans, goals, pending, previous)
src/app/coach/week/page.tsx        server route, default week, openedAhead
src/app/coach/week/builder.tsx     the UI
src/app/coach/week/actions.ts      postWeek → import_week
src/app/globals.css                + --color-teal / --color-teal-soft
src/app/coach/header.tsx           "Post a week" now opens the builder
src/app/coach/upload/page.tsx      relabelled as the backup, links to the builder
```

## Running the tests

Five suites, all offline. Four need their module copied next to the script
because `@/lib/...` does not resolve outside Next — **worth collapsing into one
`npm test` next time someone is in here.**

```bash
# contrast — no copy needed
node scripts/test-contrast.mjs                     # 25

cp src/lib/dates.ts scripts/dates.ts
node scripts/test-posting-week.mjs                 # 19
rm scripts/dates.ts

cp src/lib/goal-input.ts scripts/goal-input.ts
node scripts/test-goal-input.mjs                   # 31
rm scripts/goal-input.ts

cp src/lib/names.ts scripts/names.ts
node scripts/test-names.mjs                        # 21
rm scripts/names.ts

# importer: fixtures + a copy with the aliases rewritten
python3 scripts/make-importer-fixtures.py          # → ~/fixtures
mkdir -p ~/imptest && cp src/lib/{importer,dates,goal-input}.ts ~/imptest/
ln -sfn "$PWD/node_modules" ~/imptest/node_modules
sed -i 's#@/lib/dates#./dates.ts#; s#@/lib/goal-input#./goal-input.ts#' ~/imptest/importer.ts
IMPORTER_PATH=~/imptest/importer.ts node scripts/test-importer-groups.mjs   # 65
```

**Build:** Turbopack bus-errors in the mounted Linux VM on William's machine
(noted 09-07), so `npx next build` runs in the cloud container instead.

---

## Open, in order

1. **William reviews the UI** on the coach account. ⚠ `fnh4mv+coach` is a
   coach on the **production** database — everything up to "Post this week" is
   read-only, but posting on a live week really does replace that week. Test
   the round trip on a far-future week.
2. **Then Dunbar sees it.** He has not been asked about this yet. He agreed to
   the build in principle; he has not used it.
3. Collapse the five suites into `npm test`.
4. Only after several real weeks through the builder: retire the importer.
5. Still outstanding from before this work — `docs/18` #2, the **"Coach sees
   this today" badge**, which remains the highest-priority item in the project
   because Gate 3 is still failing.
