# 02 — Product Spec & Gap Fill

**Date:** 2026-08-03 · **Status:** Draft — several decisions explicitly deferred to the coach co-design session (§6)

This doc fills in what the original pitch left open: data model, workflows, edge cases, costs, timeline, and governance.

---

## 1. Data model (Supabase / Postgres, v0)

All tables: `id`, `created_at`, `updated_at`, `deleted_at` (soft delete — never hard-delete a log). RLS on everything: athletes read/write only their own rows; coaches read their squads; admin full.

| Table | Key fields | Notes |
|---|---|---|
| `profiles` | auth user id, name, email, role (`athlete`/`coach`/`admin`), status (`active`/`injured`/`redshirt`/`alum`) | UVA email domain gate on signup |
| `squads` | name (Men's Distance, Women's Distance), coach ids | |
| `training_groups` | squad id, name (e.g., "A group") | groups are how plans are written |
| `group_memberships` | athlete id, group id, start/end date | athletes move between groups mid-season |
| `weeks` | group id, week_start (Monday, stored as a DATE — no timezone bugs), status (`draft`/`published`), published_at | one row per group-week |
| `planned_sessions` | week id, day, slot (`AM`/`PM`), type (`easy`/`workout`/`long`/`race`/`cross`/`lift`/`off`), distance_mi, duration_min, pace_target (text: "6:30–6:45"), description (free text — workouts like "6x1k @ CV w/ 90s" live here in MVP), athlete_id (nullable → when set, this is a **per-athlete override** replacing the group session) | |
| `athlete_weeks` | athlete id, week id, status (`open`/`submitted`/`reviewed`), submitted_at, reviewed_at, coach_summary | the digital "sheet" that gets handed in |
| `logs` | athlete_week id, planned_session id (nullable — unplanned sessions allowed), day, actual_distance, actual_duration, rpe (1–10), notes | pace derived, not entered |
| `flags` | log id, type (`question`/`pain`/`missed`), body, status (`open`/`answered`), answer, answered_by, answered_at | this is the coach inbox |
| `comments` | target (log or athlete_week), author id, body | threaded feedback |

Deliberately **not** in v0: structured interval schemas, shoe tracking, wellness tables, race results, GPS routes. Each is a later migration if asked for.

## 2. Workflow details & edge cases

- **Doubles:** AM/PM slots per day. Paper handles this today; digital must too, day one.
- **Workouts with reps:** free-text description + total volume fields in MVP. A structured interval builder is a multi-week project with near-zero payoff for logging purposes. Revisit only if coaches want splits captured.
- **Mid-week plan changes:** coaches can edit a published week. Edited sessions get an "updated" badge + athlete notification. Full edit history kept (soft-delete + re-insert), so there's never a dispute about what was prescribed.
- **Injured / modified athletes:** per-athlete override sessions (or a whole override week) on top of the group plan. Status `injured` filters them out of group-compliance stats so the dashboard doesn't nag them.
- **No plan published (break weeks, summer):** athletes can self-log against a blank week. Summer is a quietly large win — remote logging with coach visibility, where today there's often nothing.
- **Unplanned sessions:** always allowed (athlete adds a session the coach didn't prescribe). Deviation from plan is *data*, not an error.
- **Backfill:** an athlete can fill the whole week Sunday night, exactly like paper. Daily logging is nudged (reminders, streaks-lite), never forced. Don't fight the culture in v1; measure it instead (entry timestamps tell us who backfills).
- **Late coach review:** the review queue shows age of each submitted week. This makes coach backlog *visible*, which is politically sensitive — see 04 §4. The pitch frames it as "easier for you," never "accountability for you."
- **Travel meets / connectivity:** logging is online-only in MVP (athletes log at home post-run). Offline queue is a Phase-2+ nice-to-have, not a blocker.
- **Roster churn:** transfers/walk-ons join mid-season → admin adds profile + group; history starts then. Graduating athletes → `alum`, data retained (archive value) unless they request deletion.

## 3. Costs (verified Aug 2026)

| Item | Cost | Notes |
|---|---|---|
| Supabase | **$0** Free tier → **$25/mo** Pro | Free: 500MB DB, pauses after ~1 wk inactivity (fine in season, annoying off-season). Pro adds backups + no pausing. Recommend Pro once full team is on. |
| Vercel | **$0** | Hobby tier, non-commercial — this qualifies. Pro is $20/mo if ever needed. |
| Domain | ~$12/yr | Or free `*.vercel.app` subdomain for pilot |
| Push/email | $0 | Web Push free; Resend free tier ample |
| Apple/Google dev accounts | $0 | Avoided entirely by going PWA |
| **Total** | **$0 pilot → ~$25/mo steady state** | Benchmark: Final Surge coach Pro is $39/mo (up to 100 athletes; athletes free; college discounts on request) |

Build labor: William + Claude Code. No cash cost; the real cost is ~4–6 weeks of part-time attention in August–September. That's the number to be honest with himself about — see 04 §6.

## 4. Timeline (season-aware)

| When | What |
|---|---|
| **Now (early Aug)** | Coach conversation → yes/no. Get the photo of a real weekly sheet. 30-min co-design session: map every field, resolve §6 decisions. |
| **Aug (4 weekends)** | Build MVP: (1) auth + roster + groups, (2) plan builder, (3) athlete log PWA, (4) review queue + dashboard. Seed with 2–3 real past weeks from the paper sheet. |
| **Early–mid Sept** | Pilot: 8–12 athletes + 1 coach, **paper runs in parallel** — nothing breaks if the software fails. |
| **~Oct 1** | Go/no-go against adoption gates (defined in 04 §7). If go: full distance squads. |
| **Nov–Dec (indoor)** | Full adoption, Phase 2 features. Retire paper when the coach says so, not before. |

Cutting against this: XC season is the *worst* time to change team process and also the only time there's a team to pilot on. Parallel-run resolves the tension — the pilot must cost the coach nothing if ignored.

## 5. Governance, compliance, sustainability

- **Approval path:** the coach should clear this with athletics ops/IT before full rollout. A student-built app holding team training data is low-risk but should not be a surprise to the department. Position it as a team-managed logbook (successor to the paper sheet), not a health platform.
- **Data discipline:** no medical records. Pain flags are "left achilles tight" free text — the same thing already written on paper — not diagnoses. Instruct athletes accordingly. Not a HIPAA context (no covered entity), but keep FERPA-adjacent caution: athlete data visible only to their coaches.
- **Countable-hours note:** a digital archive of prescribed training is a permanent, searchable record. That's mostly *good* for compliance documentation, but the coach should know it exists and is discoverable.
- **Bus factor (William graduates):** mitigations — boring stack, this docs folder, CLAUDE.md kept current, admin credentials handed to a coach/manager, one-click CSV export of everything at any time. Worst case: export → back to paper. Lock-in is deliberately ~zero.
- **Ownership:** decide up front (§6) whether this is William's project the team uses, or the team's tool William built. Recommend the latter on paper (team owns data + accounts) — it survives graduation and reads better with the department.

## 6. Open decisions — resolve in the coach session, not by assumption

1. What does "grading" actually mean today — score, checkmark, or just comments? (Determines the review UI.)
2. Does the coach prescribe paces per group or per athlete? How are individual paces derived?
3. Can athletes see teammates' logs? (Default: no. Some teams like transparency; coach's call.)
4. Who enters the weekly plan — head coach, assistant, or coach dictates and a manager types? (Paper-photo AI bridge exists if the coach won't type — 01 §4 Phase 2.)
5. Do lifts/drills/strides get logged, or runs only?
6. How often do plans actually change mid-week? (Determines how much the edit flow matters.)
7. Hard Sunday deadline or rolling? What happens today when someone hands in late?
8. Wellness (sleep/soreness): does the staff *want* it, or is it scope creep? (Default: out.)
9. Squad scope: distance only, or do sprint/field groups want in later? (Build for distance; don't over-generalize the schema yet.)
10. Pilot group: who are the 8–12? (Want: a mix of diligent loggers and habitual backfillers, not just the conscientious ones.)

## 7. What I still need from William

- ~~The **photo of the actual weekly sheet**~~ — **received 2026-08-03** (`10_real_paper_sheet.png`, McMahon 2/23–3/1). Findings in §8.
- The coach's **Word/Excel weekly plan file** (the thing that gets printed into that sheet) — the importer is built around it.
- Roster shape: ~~how many athletes~~ (24, men's distance) — coach/group counts still TBD.
- Confirmation of who the coach conversation is with (head distance coach? both men's and women's staffs?).

## 8. Findings from the real sheet (McMahon, 2/23–3/1) — recorded 2026-08-03

The photo (`10_real_paper_sheet.png`) is ground truth. Sheet structure: NAME + date range · rows Mon–Sun with DATE | WORKOUT PLAN | WORKOUT DETAILS/COMMENTS | MILES · athlete SUMMARY box · COACH'S COMMENTS box · TOTAL MILES. What it changes:

1. **The plan column is workout names, not numbers.** "TR + hurdles + drills WEIGHTS", "Workout 4xmile, 2x200m", "LR", "NCAA DAY OFF". **No prescribed mileage and no target paces anywhere on the sheet.** Open question: where do mileage expectations live (verbal? athlete-managed?) — this decides whether "mileage plan-vs-actual" is a real chart or v1's chart is actually *weekly mileage trend + total*.
2. **Athletes hand-copy watch data.** Mile splits, avg pace, avg HR (bpm), elevation gain (ft ↑) — transcribed from the watch by hand, every day. v1 keeps splits in notes; open question whether avg HR + elevation become optional numeric fields. Also the strongest evidence yet for the Phase-2 .FIT upload (auto-fill exactly what they now copy by hand).
3. **Doubles are frequent, not edge-case** (Tue 4/10 = 14, Fri 3 AM/10 PM = 13). AM/PM confirmed day-one; the day form gets an "add second run" affordance, not two separate forms.
4. **The athlete weekly SUMMARY box exists on paper and was missing from the v0 schema.** Add `athlete_weeks.athlete_summary` (free text).
5. **Grading is now known** (resolves §6 decision 1): coach reviews Sunday night — a red ✓ per day, a short per-day comment where warranted, one weekly comment ("great week."). No scores. The review UI is exactly that and nothing more.
6. **Midweek comms stay on text** (William, 2026-08-03): in-app day-comments are low-stakes, no push needed in MVP. Pain flags remain in-app with same-day visibility — unchanged.
7. **Off-day logging happens:** Saturday says NCAA DAY OFF and has a logged 5-miler with splits. Logging must be allowed any day (deviation is data, per §2) — but note the §5 compliance point now has a concrete instance: a digital archive makes off-day runs permanent and discoverable. Coach should knowingly set the policy; not our call.
8. **Template date errors are real:** the printed sheet said SUN 2/29 in a non-leap year; the athlete crossed it out and wrote 3/1 ("lol"). Auto-dating kills this error class — small, honest pitch win.
9. **Deadline mechanics locked** (William): a week = 7 day forms, same action whether filled daily (encouraged) or batched Sunday; every save syncs to the coach instantly; **no separate submit button**; reminder notifications at T-2h and T-1h before the Sunday deadline (exact time TBD).
10. **Entry fields final form** (William): **distance + pace, "that is it."** Time derived if ever needed. Note: effort 1–10 is on our mockups but NOT on paper — confirm it earns its tap before keeping it.

Sheet vocabulary (TR, LR, 4xmile, "29 high", fartlek notation) now seeds `11_dictionary.md`, which doubles as the controlled vocabulary the plan importer parses against.

11. **(2026-08-03, William's round-3 answers) The mileage-goal model is now known.** The TOTAL MILES box = the coach's **weekly mileage goal, set per athlete** (e.g. 70 for McMahon; others might be 60). Athletes have full autonomy on daily distribution; the coach watches cumulative progress toward the goal as logs come in. → Schema: add `athlete_weeks.mileage_goal` (int, miles). "Plan-vs-actual" is real after all — but it's *cumulative actual vs weekly goal*, not per-day: exactly the athlete progress bar and the coach grid's "35.4 / 78" column already mocked in 06/09. Also resolved: TR = training run (aerobic); splits/HR/elevation stay **notes-only in v1** (McMahon is the diligent outlier); **RPE stays**; NCAA day off = no organized practice, athletes still run and log (normal, not a compliance drama); athlete SUMMARY stays (it's the reflection ritual); **auto-dates on every day row are a hard requirement** ("we want dates for sure"). Same-day update: **the goal numbers are written into the week-plan file itself, delivered Monday** — so the importer ingests workouts + per-athlete goals in one upload, and the coach's whole weekly interaction is *upload Monday, grade Sunday*. Still open: Sunday deadline time (William circling back); pace required vs optional.
