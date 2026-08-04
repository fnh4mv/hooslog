# 12 — Build Plan & Prompt Library (v1 trial build)

**Date:** 2026-08-04 · **Status:** ACTIVE — this is the execution playbook for the Aug 10 trial
**Operating model (William's spec):** Cowork = project manager. Claude Code agents = builders. William = directional/aesthetic decisions only.

## How the loop runs

1. PM dispatches one builder agent per phase with the PROMPT block below, verbatim plus repo context. Fresh context each time; CLAUDE.md + this doc carry state between them.
2. Builder works in the repo, does NOT commit. PM reviews the diff, runs the verification gate, then commits + pushes.
3. **Verification gate, every phase:** `npm run build` green · diff review against locked decisions · Playwright screenshots at 390px (phone) and 1280px (laptop) · CLAUDE.md status line appended · push to `main`.
4. **Escalate to William ONLY for:** anything that would change a locked decision · the three aesthetic sign-offs (marked ⚑ below) · new account/secret needs · scope additions.
5. One builder at a time. A phase that fails its gate gets a fix-it dispatch, not a hand-wave.

## What makes this fully autonomous (William, one-time)

- **E2E testing:** PM needs the two values already in `.env.local` — `NEXT_PUBLIC_SUPABASE_URL` + the anon key. These are browser-safe by design (RLS is the boundary); with them, Playwright tests real signup → log → coach flows from the cloud.
- **Migrations (optional):** the Postgres connection string (Supabase → Settings → Database) lets PM apply migrations directly. Without it, William pastes each migration into the SQL Editor when asked (~2 min each, rare after 0001).

---

## Phase 0 — Database live (WILLIAM, ~15 min, blocks everything)

Pull → Supabase SQL Editor: run `supabase/migrations/0001_initial.sql` → edit emails in `supabase/seed.sql` (trial-coach email in, placeholder out) → run it → Auth → Sign In / Up → **disable "Confirm email"** → `npm run dev` → create one athlete account (UVA email) and the trial-coach account → confirm they land on `/log` and `/coach` respectively.

---

## Phase 1 — Athlete portal core (BUILDER 1)

**PROMPT:**
> Work in the HoosLog repo. Read `CLAUDE.md` (all locked decisions), `supabase/migrations/0001_initial.sql` (schema truth), and `docs/mockups/06_portal_mockups.html` (design language: UVA navy #232D4B / orange #E57200, big touch targets, card layout — tokens already in `globals.css`). Build the athlete portal core, mobile-first at 390px:
>
> 1. `src/lib/dates.ts` — `mondayOf(date)`, `addDays`, `isoDate`, `fmtDayShort` ("Mon 8/10"). Week starts Monday, all training days are DATEs, never timestamps.
> 2. `src/lib/types.ts` — hand-written row types matching the migration exactly: Profile, AthleteWeek, WeekPlan, Log, DayReview.
> 3. `src/lib/queries.ts` — server-side fetchers: `getWeekData(weekStart)` returns my profile, my athlete_week (may be null), week_plans, my logs, my day_reviews for that week in one round trip pattern.
> 4. Server actions in `src/app/log/actions.ts`: `saveLog` — upsert by (athlete, date, slot), distance required ≥ 0, pace optional free text, rpe 1–10 optional, pain_flag + pain_note, question, notes; creates my athlete_weeks row for that week if missing. Validate server-side; never trust the client.
> 5. `/log` UI: tappable Mon–Sun week strip (states: logged ✓ / today / missed past / future dimmed) + selected-day panel: coach's-plan card (week_plans text or "no plan posted"), the log form (distance, pace, RPE chips 1–10, "Anything hurting?" toggle → note field + badge "⚡ Coach sees this today", question-for-coach, notes), Save button, "+ add PM run" for a second slot. Goal progress bar: sum of week's logged miles vs athlete_weeks.mileage_goal ("25.4 of 46 mi" or "no goal set"), plus "X of 7 days logged".
> 6. Behavior: past + today days are editable (backfill is normal, never shamed); future days show the plan with the form disabled ("upcoming"). Editing an existing log pre-fills the form. Every save is instantly visible to coaches by design — no submit concept anywhere.
>
> Rules: server components by default, client components only for interactive pieces. No new dependencies. No changes outside `src/lib` and `src/app/log`. `npm run build` must pass. Do not commit. Report: files touched, decisions made, anything ambiguous.

**Acceptance:** build green · logging a normal run = pick day, 2 numbers, 2 taps, Save · pain flag path prominent · re-edit works · future-day lockout works.

## Phase 2 — Summary, history, feedback feed (BUILDER 2)

**PROMPT:** (dispatch after P1 merges)
> Read `CLAUDE.md`, `src/lib/*`, `src/app/log/*` first; match their patterns. Add: (1) week summary card on `/log` — free-text `athlete_summary` on my athlete_weeks row, framed "Sunday reflection", editable all week, with save action; (2) `/log/history` — list of my past weeks: week label, total logged vs goal, days-logged count, tap → read-only week view; (3) coach feedback surfaced on `/log`: day_reviews checkmarks + comments shown on each day panel, athlete_weeks.coach_comment shown on the week card. Reuse existing components; no new deps; build green; don't commit.

**Acceptance:** summary persists · history renders ≥2 weeks correctly with seeded data · feedback visibly attached to the right days.

## Phase 3 — Coach portal (BUILDER 3) ⚑ aesthetic sign-off

**PROMPT:**
> Read `CLAUDE.md` (esp. locked 15, 16, 21), `docs/mockups/09_coach_view_mockups.html` + `09a_team_grid.png` (Option A IS the spec), and `src/lib/*`. Build the coach portal (already role-gated by `src/app/coach/layout.tsx`):
>
> 1. `/coach` — the team grid: every active athlete × Mon–Sun for the selected week (‹ › week nav). Cell = logged miles (AM+PM summed); orange underline = pain flag; superscript ? = open question; grey — = past unlogged; "am" = today not yet in; blank = future. Row end: week total vs goal + mini progress bar. Pinned alert strip: today's pain flags + questions by name, always visible. Laptop-first (1280px), readable on phone via horizontal scroll.
> 2. `/coach/[athleteId]` — drill-in: the athlete's full week, per day: plan text, their log(s) (distance, pace, RPE, notes), flags/questions highlighted. Review controls per day: ✓ toggle + comment field (writes day_reviews, coach_id = me). Week-level: coach_comment field + "mark week reviewed" (sets reviewed_at). NO scores anywhere, NO response-time metrics anywhere (locked 7, 16).
> 3. Grid rows link to drill-in; drill-in has prev/next athlete nav so Sunday grading is one continuous flow.
>
> Server-side data fetching; coach RLS does the authz. No new deps. Build green. Don't commit.

**Acceptance:** 24-row grid renders in one screen at 1280px · flags scannable in seconds · grading one athlete ≤60s · athlete sees the ✓/comments (verify via P2 surfaces). **Then: screenshot set → William for visual sign-off.**

## Phase 4 — Template importer (BUILDER 4) ⚑ UX sign-off

**PROMPT:**
> Read `CLAUDE.md` (locked 18, 23), `docs/templates/hooslog_week_plan_template.xlsx` (the format contract: "Week Plan" tab — B3 Monday date, C6:C12 plan text; "Goals" tab — name/email/goal rows from row 2), and `src/lib/*`. Build:
>
> 1. `src/lib/importer.ts` — parse the template (add `xlsx` package — the one allowed new dep) → `{weekStart, plans: string[7], goals: [{email, goal}]}` + structured errors: B3 not a Monday/not a date, Goals email not found among athlete profiles, non-numeric goal, wrong tab names. Unknown emails are ERRORS to show, never silent drops.
> 2. `/coach/upload` — drag-drop + file picker → parse client-side or via action → PREVIEW step: render the parsed week + goals table + any errors, coach confirms → server action writes week_plans (upsert per day) + athlete_weeks.mileage_goal per matched athlete (create rows as needed). All-or-nothing write; on any write failure, nothing persists.
> 3. "Download the template" link on `/coach/upload` serving the committed template file.
>
> Round-trip test is mandatory: the committed template file itself, with example rows removed and one real goal row, must import cleanly. Build green. Don't commit.

**Acceptance:** template → preview → confirm → grid shows the plan and goals · every malformed-file case produces a plain-English error · no partial writes. **Then: preview-screen wording + flow → William.**

## Phase 5 — Deploy (WILLIAM 5 min + PM)

Vercel: sign up with GitHub → Import `fnh4mv/hooslog` → add the two env vars from `.env.local` → Deploy. PM verifies the live URL end-to-end, sets up the trial-week template, and smoke-tests all three roles' flows on production.

## Phase 6 — Trial hardening (BUILDER 5) ⚑ final aesthetic pass

**PROMPT:** (summary — PM details at dispatch)
> Polish pass only, no features: PWA manifest + icons (installable, NO push), empty states (no plan / no logs / brand-new athlete), error toasts on failed saves, loading states, sign-out placement, mobile spacing/target audit at 390px, favicon, page titles. Build green. Don't commit.

**Acceptance:** installable on a phone · nothing looks broken in any empty state · **William's final visual walkthrough before athletes touch it.**

## Phase 7 — Trial week ops (PM + WILLIAM, Aug 10–16)

Seed real week via importer Sunday night · 3 athletes onboard Monday (one-line install/signup instructions from PM) · William runs the coach account · PM on hotfix duty (bug report in chat → fix → push → Vercel auto-deploys) · Sunday: William grades all 3 in the app, timed · retro → go/no-go on September pilot scope.

---

## Standing directional questions (answer whenever — none block P1)

1. Trial roster: which 3 guys? Trial-coach email for `seed.sql`?
2. Confirm assumptions: pace optional · Sunday 9:00 PM deadline (display only in trial).
3. E2E autonomy: paste `NEXT_PUBLIC_SUPABASE_URL` + anon key here? (Recommended — they're browser-safe by design.) Connection string too, or keep migrations manual?
