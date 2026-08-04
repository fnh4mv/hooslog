# CLAUDE.md — UVA Training Log (HoosLog)

> **Read this first, every session. Update it before ending any session that changes project state.** This file is the anti-staleness anchor for the project.

## What this project is

Digital training log for the UVA XC/track distance program, replacing the weekly **paper** training sheet: coach prescribes a week (distance/time/pace per day), athletes log actuals + notes + questions, hand in Sunday, coach reviews/comments. We digitize *that exact workflow* — same sheet, same Sunday rhythm — nothing about the coaching changes. Killer feature: **same-day coach visibility of pain flags and questions** (paper = 5-day blind spot).

Built by William Sheets (UVA athlete on the team; eGateway intern; builds with Claude Code). Users: ~40–70 distance athletes, 2–4 coaches.

## Repo & workflow

- **Home: https://github.com/fnh4mv/hooslog (private).** This CLAUDE.md at repo root is the canonical copy; `C:\UVA software` on William's machine is the pre-repo planning archive (pointer note added 2026-08-03).
- Local work: William clones to his dev directory (NOT inside `C:\UVA software`); Claude Code operates in the clone. Cloud Cowork sessions authenticate with a fine-grained PAT scoped to this repo only (Contents R/W, ~90-day expiry, rotate on expiry; never committed, never written into docs or memory).
- Numbered docs live in `docs/`, mockups in `docs/mockups/`. Same numbering conventions as before.
- ~~No app scaffold until the coach co-design session~~ — **GREENLIGHT received 2026-08-04; app code is live at repo root.** See the `## App` section below for dev setup. The co-design gate was satisfied by the 2026-08-03/04 Q&A rounds with William + the real sheet (02 §8) — remaining coach-side unknowns are enumerated in Open items, none block the trial build.

## App (live as of 2026-08-04)

- **Stack as built:** Next.js **16** (App Router, TS, Tailwind v4 — create-next-app current; supersedes "15" in older docs), `@supabase/ssr` cookie auth, src/ layout, no ORM, no UI library.
- **Dev:** `npm install` → `.env.local` from `.env.example` → `npm run dev`.
- **Database:** migrations in `supabase/migrations/` — apply in the Supabase SQL Editor (or `supabase db push`). Then edit + run `supabase/seed.sql` to set the coach allowlist. **Auth setting for trial: Supabase Dashboard → Auth → disable email confirmations** (athletes sign in immediately; revisit before September pilot).
- **Structure:** `src/middleware.ts` (session refresh + signed-out redirect) · `src/lib/supabase/` (server/client factories) · `src/app/(auth)/` (login/signup) · `src/app/log/` (athlete portal) · `src/app/coach/` (coach portal, role-gated in layout) · `/` routes by role.
- **Build order remaining (from docs/08 §6):** athlete day form + week strip → coach grid (09a) → athlete drill-in + review → template importer (locked 23) → trial polish.
- **Verify before every push:** `npm run build` passes.

## Current status — update this section every session

- **2026-08-04 (autonomous build mode):** William's directive: Cowork = project manager, Claude Code builder agents = execution, William consulted only for directional/aesthetic calls. The full phase-by-phase plan + verbatim builder prompts live in **`docs/12_build_plan.md`** — read it before dispatching or resuming any build work. Builders never commit; PM verifies (build green, diff review, 390/1280px screenshots) then commits/pushes. Escalation-to-William triggers and the three ⚑ aesthetic sign-offs are defined there.
- **2026-08-04 (GREENLIGHT — scaffold shipped):** Dunbar approved (locked 22). William's design specs recorded as locked 20–23 (auth w/ password + staff_emails allowlist; coach portal = grid/drill-in/review/drag-drop upload only; phase-0 trial = 3 athletes starting Mon 2026-08-10; template-first importer recreated from the paper sheet — William's call, kills the waiting-on-Excel blocker). Scaffolded the app at repo root: Next.js 16 + Tailwind v4 + @supabase/ssr, login/signup working against the schema, role-based routing (`/` → `/log` or `/coach`), coach routes role-gated server-side. Wrote `supabase/migrations/0001_initial.sql` (6 tables, signup trigger w/ UVA-domain gate + allowlist role assignment, full RLS) + `supabase/seed.sql` (allowlist — William edits emails). `npm run build` green. William must: pull, apply migration + seed in Supabase SQL Editor, disable email confirmations, `npm run dev`, test signup/login.
- **2026-08-03 (evening — pitch imminent, pre-build prep):** William talking to Coach Dunbar **tonight**; greenlight expected. Decision: set up accounts now (allowed — accounts ≠ building; the no-build-before-co-design rule stands). **Guardrail hit and dodged: the Supabase MCP in Cowork is authed to the eGateway Capital org — HoosLog must NEVER be created there** (firm billing, Bruce's domain, and it would kill the 02 §5 team-ownership handoff). William to create: personal Supabase account + project `hooslog` (free tier; note it pauses after ~1 wk idle — one-click restore), personal GitHub private repo `hooslog` (NOT under seideleGC), Vercel via GitHub login (can wait until first push). Goals confirmed written into the week-plan file, delivered Monday (locked 18). Next artifact: draft initial schema SQL from 02 §1 + decisions 18/19 once co-design confirms fields.
- **2026-08-03 (repo live):** Initial commit pushed to **github.com/fnh4mv/hooslog** — CLAUDE.md (root), README, `.gitignore`, `.env.example`, `docs/` 01–05 + 08 + 11, `docs/mockups/` 06/07/09 + real-sheet photo. Repo CLAUDE.md is now canonical; the C:\UVA software folder is archived with a pointer. Next repo artifact: initial schema migration, post-co-design.
- **2026-08-03 (later evening):** Supabase project + GitHub repo **created** (William, personal accounts — guardrail held). Added `12_env_template.txt` (→ `.env.example` in repo): Supabase URL/keys + placeholders; **no GitHub PAT** (app never calls GitHub API; git auth = `gh auth login`); **no Anthropic key** (locked 17 — deterministic importer first); real values only ever in `.env.local` (gitignored) + password manager, never in chat or this folder.
- **2026-08-03 (round-3 answers — goal model cracked):** The TOTAL MILES box is the coach's **per-athlete weekly mileage goal**; athletes distribute it however they want, coach (Dunbar) watches cumulative progress. Plan-vs-actual chart is real = *cumulative actual vs weekly goal* → `athlete_weeks.mileage_goal` added to schema (02 §8.11). Also locked: TR = training run (dictionary updated); splits/HR/elevation notes-only v1; RPE stays; NCAA day off = no practice, still run + log; SUMMARY stays; auto-dates = hard requirement. Still owed by William: Sunday deadline time (circling back), coach's Excel/Word file, where the goal numbers live today, pace required-vs-optional.
- **2026-08-03 (REAL SHEET RECEIVED + round-2 answers):** William provided the photo of an actual completed weekly sheet (`10_real_paper_sheet.png`, McMahon 2/23–3/1) — findings recorded in `02 §8`. Headlines: plan column is workout names with **no prescribed mileage or paces anywhere**; athletes hand-copy watch data (splits/HR/elevation); doubles frequent; athlete SUMMARY box missing from v0 schema (now added); grading = per-day red ✓ + comments, resolving 02 §6 decision 1. Round-2 answers locked: **Option A team grid chosen**; entry = distance + pace only; no submit button — week = 7 day forms by Sunday deadline w/ T-2h/T-1h reminders; midweek comments live on text (no comment push in MVP); importer = start with upload. Started `11_dictionary.md` (William's idea) — glossary + the importer's parsing vocabulary. New open questions sent to William (prescribed-mileage source, TR meaning, HR/elevation fields, RPE keep/cut, off-day policy, deadline time, Excel file shape).
- **2026-08-03 (output answers + coach mockups):** William answered the 10 output/UI questions → new locked decisions 10–14 below. Added `09_coach_view_mockups.html` + `09a_team_grid.png` / `09b_card_list.png` — coach portal Option A (24-row team grid, laptop-density) vs Option B (card list, needs-attention sort, phone-friendly), same sample data, both with pinned pain-flag/question alert strip + Team/Inbox/Review/Plans tabs. **William to choose A or B.** Biggest new intel: the coach builds weeks in **Word/Excel** — an upload-to-populate plan importer is now a candidate MVP feature (example file pending from William; that file decides deterministic parse vs Claude-API parse, which would revise 08's "zero runtime AI in MVP" line). Open follow-ups sent to William: auto-close Sunday vs explicit sync, distance-only entry allowed?, push on day-comments?, coach's review device (laptop vs phone).
- **2026-08-03 (infra scope):** Added `08_infra_scope.md` — full stack scoped: Next.js 15 PWA on Vercel ($0) + Supabase (free → $25/mo Pro) + Supabase Auth w/ UVA domain gate + Web Push/Resend; Claude = build-time only (William's existing account), runtime Anthropic API key deferred to Phase 2 (paper-plan photo import). AWS/Azure explicitly re-rejected (reopens only if athletics IT mandates department hosting). **New roster figure from William: 24 boys (men's distance)** — supersedes the earlier 40–70 estimate for v1 scope; women's-squad inclusion is an open question. Scale check: ~6k log rows/season → all effort goes to UI speed, not scalability. 10 output/UI questions posed to William; answers to be recorded here.
- **2026-08-03 (interactive demo):** Added `07_portal_demo.html` — self-contained interactive demo (throwaway code, NOT the app): one phone frame, working Home/Log tabs, tappable Mon–Sun strip, editable distance/time with auto-derived pace, RPE chips, pain toggle w/ same-day badge, Save updates dashboard tiles/chart/week rows live. In-memory only, nothing persists. Purpose: hand-someone-your-phone show piece for teammates/coach. Week/Trends tabs are stubs (toast). Verified via Playwright: interactions + math tie out, no console errors.
- **2026-08-03 (mockups):** Added `06_portal_mockups.html` + `06a_run_log.png` / `06b_dashboard.png` — phone-frame UI mockups of the athlete portal (daily run log entry + dashboard), UVA navy `#232D4B` / orange `#E57200`, sample data, screenshot-ready. Design decisions embodied (William's picks): run log = date strip · coach's plan (prescribed) · what you ran (distance/time, pace auto-derived) · effort 1–10 · **"Anything hurting?" pain flag with "coach sees this today" badge** · question-for-coach field · notes. Dashboard = week-at-a-glance w/ Sunday submit, mileage plan-vs-actual + 6-week trend, coach feedback feed, streak/completion tiles. **Mockups only — still no code, no coach conversation.** These are teammate/coach show-pieces, not final UI; final UI waits on the co-design session.
- **2026-08-03 (later):** Added `05_athlete_one_pager.docx` — UVA-branded (navy #232D4B / orange #E57200) one-page Word doc for teammates, gauging interest + recruiting the September pilot group. v2: rewritten fully in sheetsvoice (peer/teammate dial, contractions, no em dashes, "-Will" sign-off) and added "How it would work" section — no-app-store PWA framing + Your Portal vs. Coaches' Portal columns. Athlete feedback from it should be recorded here when it comes back.
- **2026-08-03:** Project started. Concept, spec, coach proposal (~281 words), and pressure test written (files below). **No code yet. No coach conversation yet.** Next actions: (1) William gets the photo of a real weekly paper sheet into this folder, (2) verbal pitch to coach → send proposal, (3) 30-min co-design session resolving the 10 open decisions in `02 §6`, (4) then — and only then — build MVP. Before the build starts, run `/bigidea` to lock the spec with the coach's answers.

## File map

| File | What it holds |
|---|---|
| `01_expanded_concept.md` | Full concept: users, weekly loop, phased features, architecture, positions taken |
| `02_product_spec_and_gaps.md` | Data model v0, edge cases, costs, season-aware timeline, governance, **10 open coach decisions (§6)** |
| `03_coach_proposal.md` | The ~300-word coach-facing proposal + framing notes |
| `04_pressure_test.md` | Adversarial pass: 6 personas, verdict, **adoption gates + kill criteria (§8)** |
| `05_athlete_one_pager.docx` | Teammate-facing interest-gauge one-pager (UVA navy/orange; built via `build_one_pager.js`) |
| `06_portal_mockups.html` | Athlete portal UI mockups (run log + dashboard), self-contained HTML source — edit here, re-screenshot |
| `06a_run_log.png` / `06b_dashboard.png` | Screenshot-ready PNG exports (2×) of the two mockup pages |
| `07_portal_demo.html` | Interactive one-phone demo (tabs, day strip, live save → dashboard). Demo code — do not grow into the real app |
| `08_infra_scope.md` | Full infra/build-stack scope: stack table, why-not-AWS/Azure, what we don't need, 24-athlete scale check, setup checklist, weekend build order |
| `09_coach_view_mockups.html` | Coach portal mockups, Option A team grid vs Option B card list (same data, alert strip + tabs) — William picks one |
| `09a_team_grid.png` / `09b_card_list.png` | Screenshot exports (2×) of the two coach-view options |
| `10_real_paper_sheet.png` | **Ground truth:** photo of a real completed weekly sheet (McMahon, 2/23–3/1). Findings in `02 §8` |
| `11_dictionary.md` | Team + product vocabulary — glossary AND the importer's parsing vocabulary. William fills ⚠ rows |
| `12_env_template.txt` | Env template (placeholders only) → becomes `.env.example` in the repo. No PAT (not needed), Anthropic key commented out per locked 17 |

## Locked decisions (revisit only with cause)

1. **Group-based plan authoring** with per-athlete overrides — never per-athlete entry for 50 people.
2. **PWA, not native app.** No app stores. Push via web push; email fallback.
3. **Stack:** Next.js (App Router, TS) on **Vercel** (not Azure/AWS) + **Supabase** (Postgres, Auth, RLS, Realtime). Soft deletes, audit timestamps, RLS everywhere, dates as DATE not timestamp.
4. **No Garmin/Strava sync promised.** Garmin API = enterprise-only; Strava API terms bar showing athlete data to coaches. Bridge = .FIT/.TCX upload (Phase 2). Manual entry is the product.
5. **MVP = the sheet, nothing else.** No wellness/HRV/interval-builder. Free-text workout descriptions.
6. **Pilot** = 8–12 athletes (include habitual backfillers), paper in parallel, go/no-go ~Oct 1 against the gates in `04 §8`.
7. **Politics guardrail:** no coach response-time metrics anywhere. The review queue is a to-do list, not a scoreboard.
8. **Costs:** $0 pilot → ~$25/mo (Supabase Pro) steady state. Benchmark: Final Surge $39/mo coach plan. Cost is not the differentiator; workflow fit + ownership are.
9. **2026-08-03 — Run log fields (v0, from mockup session):** date · prescribed (from plan) · actual (distance + time, pace derived) · effort 1–10 · pain/soreness flag (dedicated, same-day coach visibility) · question-for-coach · free notes. Dashboard v0 = week-at-a-glance, mileage plan-vs-actual + trend, coach feedback feed, streaks/completion. Still subject to coach co-design.
10. **2026-08-03 — v1 scope = men's distance only (24 athletes).** Women's squad is a later phase; don't generalize the schema for it yet.
11. **2026-08-03 (amended same day) — Entry = distance + pace, "that is it."** No time field; derive if ever needed. Target ≤45 s to log a normal run. (Whether pace is required or optional: recommend optional — confirm.)
12. **2026-08-03 (amended same day) — No submit button.** A week = 7 day forms; the same form whether filled daily (encouraged) or batched Sunday; **every save syncs to the coach instantly** (what makes same-day pain flags real). Week complete when 7 forms are in by the Sunday deadline. Reminder notifications T-2h and T-1h before the deadline (exact time TBD).
13. **2026-08-03 — Dashboard chart = weekly mileage plan-vs-actual, the only chart in v1.** Season history lives in its own History tab, not on the dashboard.
14. **2026-08-03 — Feedback + design:** coach comments are primarily per-week; day-level comments must be visible to the athlete the same day they're written. Design language = 06 mockups (UVA navy/orange, big touch targets) as inspiration, finalized in co-design.
15. **2026-08-03 — Coach team view = Option A team grid** (see `09`) — roster format, every athlete × every day, laptop-first. Card view can be a later phone fallback if needed.
16. **2026-08-03 — Review flow ("grading"):** Sunday-night pass — per-day ✓ + per-day comment where warranted + one weekly comment. No scores, ever. Midweek day-comments are low-priority (that conversation lives on text); no comment push notifications in MVP. Pain flags stay in-app, same-day. Resolves 02 §6 decision 1.
17. **2026-08-03 — Plan importer: start with upload.** Coach's Word/Excel weekly file → parsed → populates athletes' weeks. Built against `11_dictionary.md` vocabulary; deterministic parse preferred, Claude-API parse only if the file's structure forces it. Example file from William still required before this is promised to anyone.
18. **2026-08-03 — Weekly mileage goal model:** the coach sets ONE weekly mileage number per athlete (the TOTAL MILES box); the athlete has full autonomy on daily distribution. Plan-vs-actual = cumulative actual vs weekly goal — the 06 progress bar and the 09 grid "Week" column are exactly right. Schema: `athlete_weeks.mileage_goal`. No per-day prescribed mileage exists — simpler build. **Goal numbers are written into the coach's week-plan file and land Monday** → the importer ingests workouts + per-athlete goals in one upload; no separate goal-entry step when upload is used. Coach's whole weekly touch = upload Monday, grade Sunday.
19. **2026-08-03 — Day-form scope final:** distance + pace + RPE (kept) + pain flag + question + notes. Splits/HR/elevation stay in notes for v1 (diligent guys can keep transcribing; .FIT upload is the Phase-2 answer). Athlete weekly SUMMARY stays (reflection ritual). Off-day behavior: no organized practice ≠ no run — logging off-day runs is normal and expected. **Auto-dates on every day row — hard requirement.**
20. **2026-08-04 — Auth (supersedes the magic-link idea):** name + UVA email + password. DB signup trigger rejects non-`@virginia.edu` emails unless the email is in `staff_emails`; allowlisted emails get the coach role automatically. RLS: athletes see only their own rows; coaches see everything. Coach access is governed ONLY by the `staff_emails` table (Dunbar + assistant coaches, managed via SQL/service role — never by app code), so it outlives William. His trial-coach account is temporary: delete from the allowlist at trial end.
21. **2026-08-04 — Coach portal MVP scope, nothing else:** Option A team grid with week navigation → click an athlete → their full week → per-day ✓ + comment review → drag-and-drop weekly plan upload. That is the entire coach surface for v1; additions come after the trial proves the loop.
22. **2026-08-04 — GREENLIGHT + timeline:** Dunbar approved. Build week now; **phase-0 trial = 3 athletes + William-run trial coach account, starts Mon 2026-08-10.** The 8–12 athlete paper-parallel pilot (locked 6) follows in September. Trial-week cuts: push/deadline reminders, PWA install polish, CSV export, printable view. Working assumptions (flagged, not confirmed): pace optional on the day form; Sunday deadline placeholder 9:00 PM.
23. **2026-08-04 — Template-first importer:** we author the canonical week-plan Excel template (recreated from the real paper sheet, lives in `docs/templates/`) — week date + Mon–Sun plan text + per-athlete mileage goals. The importer parses OUR template deterministically, zero AI. Dunbar's legacy file, whenever it surfaces, validates/adjusts the template — not the parser.

## Open items

- [x] ~~Photo of the real paper weekly sheet~~ — received 2026-08-03 (`10_real_paper_sheet.png`); findings in `02 §8`
- [x] ~~Coach team view~~ — Option A grid (locked 15) · ~~submit model~~ — no submit button (locked 12) · ~~comment push~~ — not in MVP, text culture (locked 16)
- [ ] Athlete reactions to `05` one-pager collected → record takeaways + pilot volunteers here
- [ ] Roster shape: 24 men's distance confirmed; coach count still TBD (women's squad → later phase, locked 10)
- [x] ~~Example coach Word/Excel week file~~ — superseded by template-first (locked 23): we author the canonical template; Dunbar's legacy file validates it later, whenever it surfaces
- [ ] Trial roster: which 3 guys + the trial-coach email for `seed.sql`
- [ ] Confirm working assumptions in locked 22: pace optional; Sunday 9:00 PM deadline
- [x] ~~Prescribed mileage~~ — TOTAL MILES box = per-athlete weekly goal (locked 18) · ~~TR~~ = training run · ~~HR/elevation~~ — notes-only v1 · ~~RPE~~ — kept · ~~off-day policy~~ — run + log is normal (all locked 19)
- [x] ~~Where do weekly goal numbers live~~ — written into the week-plan file, delivered Monday (folded into locked 18)
- [ ] Sunday deadline time — William circling back (drives T-2h/T-1h reminders)
- [ ] Remaining dictionary ⚠ rows in `11` (4xmile rest convention, 200s, fartlek notation)
- [ ] Is pace required or optional on the day form? (Recommend optional — still unanswered)
- [ ] Printable week view: William leans yes ("I think so") — confirm with coach
- [ ] Coach conversation + proposal sent
- [ ] Co-design session → answers to `02 §6` decisions recorded here
- [ ] Final Surge shown to coach as honest benchmark (see `04 §2`) — if coach prefers buying, recommend buying
- [ ] Athletics ops/IT heads-up before full rollout (pilot with volunteers is fine without)

## Conventions for future sessions

- Keep docs numbered `NN_name.md`; new major docs get the next number (next: `08_`).
- When a decision is made, move it from "Open items" into "Locked decisions" with a date.
- When code starts, add a `/app` section here: repo location, env setup, deploy notes.
- Session hygiene: append a dated line to "Current status" whenever state changes. Never leave this file describing a stale reality.
