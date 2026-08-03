# 01 — Expanded Concept: Digital Training Log for UVA XC/Track

**Working name:** HoosLog
**Date:** 2026-08-03 · **Status:** Concept locked pending coach co-design session
**One-liner:** Digitize the exact weekly paper training log the UVA distance program already uses — same sheet, same rhythm, same coaching — delivered to every athlete's phone, with same-day visibility for coaches.

---

## 1. The core insight

This is not a "training platform." It is a **workflow digitization** of a system that already works. The coaching methodology, the weekly sheet structure, the Sunday cadence, the grading/feedback loop — all of that stays. What gets replaced is the *paper*, because paper is the source of every failure mode:

| Paper failure | Consequence today |
|---|---|
| Logs get backlogged in grading | Athletes go 2–3 days into a week without their sheet |
| One physical copy | Lost sheets, no access mid-week, no remote access (travel, summer) |
| Feedback loop is 7+ days | Coach comments arrive a week after the run they're about |
| Coach is blind Mon–Sat | "Achilles tight" written Tuesday isn't seen until Sunday |
| No archive | No mileage trends, no injury history, no year-over-year comparison |

The single most valuable thing this product does — the thing paper *cannot* do and the reason to build at all — is **mid-week coach visibility**. A pain note or a missed day surfaces the day it's written, not five days later. For a distance program, that's an injury-prevention feature, not a convenience feature.

## 2. Users and portals

**Athletes (~40–70 across men's/women's distance squads)**
- Log in (UVA email), see this week's prescribed training: day-by-day distance / time / pace / description.
- Log each day in under 60 seconds: actual distance, time, how it felt (RPE), notes, questions. Can log daily or backfill the week — both supported, daily nudged.
- "Hand in" the week Sunday (or auto-submit), see coach comments when reviewed, full personal archive and mileage trends.

**Coaches (2–4)**
- **Plan builder:** write next week's training once per *training group* (e.g., Men's A group), then adjust individual athletes as exceptions (returning from injury, modified volume). NOT per-athlete entry — see §5.
- **Review queue:** submitted weeks, one at a time, comment inline per day or on the week, mark reviewed ("graded").
- **Live dashboard:** who has/hasn't logged, every open question in one inbox, and flags (pain mentions, missed sessions, big deviations from prescription) surfaced same-day.
- **Athlete profiles:** season mileage trend, flag history, past weeks, unresolved threads.

**Admin (William / a manager):** roster management, group assignments, season setup.

## 3. The weekly loop (mirrors today exactly)

1. **Sunday PM — Coach publishes.** Week template per group + individual overrides → appears on every phone instantly. No photocopies, no handout logistics.
2. **Mon–Sun — Athletes log.** Prescribed vs. actual side by side. Questions and pain flags go to the coach inbox *immediately*, not Sunday.
3. **Sunday — Athletes submit.** One tap. No physical hand-in, works from anywhere (travel meets, breaks, **summer** — summer logging alone may justify the build; remote athletes currently email/text logs or don't log at all).
4. **Coach reviews.** Comments per day or per week, marks reviewed. Athlete gets notified. Backlog is visible and measurable instead of a pile of paper.

## 4. Feature set by phase

**Phase 1 — MVP (build August 2026).** Digitize the sheet. Nothing else.
- Auth (UVA email), roster, training groups
- Coach plan builder: group-level weeks, per-athlete overrides, AM/PM doubles, session types (easy / workout / long / race / cross-train / lift / off), free-text workout descriptions (no structured interval builder yet)
- Athlete daily log: actuals, RPE, notes, question flag, pain flag
- Weekly submit → review → comment → reviewed loop
- Coach dashboard: compliance (who's logged), question inbox, flag feed
- Installable mobile PWA (home-screen icon, feels like an app)

**Phase 2 — Season quality-of-life (Sept–Oct).**
- Push/email reminders (log nudges, "your week was reviewed", "new question")
- Mileage trend charts, week-over-week views, CSV export
- Plan templates + copy-last-week for the coach
- .FIT/.TCX file upload (athlete exports from Garmin Connect → we parse distance/time/pace; no API approval needed)
- **Paper bridge (optional adoption wedge):** coach keeps writing on paper if they want → photograph the sheet → AI transcribes into the structured plan → one-click approve. Coach changes nothing about their habit; athletes still get digital.

**Phase 3 — Later / maybe (indoor season+).**
- Garmin auto-sync via Garmin Connect Developer Program (enterprise-gated; uncertain — see 04 pressure test; do not promise this)
- Race results, season/macro planning view, alumni archive
- Wellness inputs (sleep/soreness) — only if coaches ask; deliberately out of MVP

## 5. Positions taken (differ from the original pitch — flagged deliberately)

1. **Group-based planning, not per-athlete upload.** Entering plans per person for 50+ athletes is untenable and slower than paper — it would kill coach adoption in week one. Groups + exceptions matches how distance coaches actually write training.
2. **PWA, not a native app.** App-store accounts ($99/yr Apple), review cycles, and build maintenance buy nothing here. An installable PWA gives the home-screen icon and (on modern iOS/Android) push notifications. Revisit native only if push proves unreliable.
3. **Vercel, not Azure/AWS.** Next.js on Vercel is zero-ops and free at this scale (Hobby tier, non-commercial). Azure/AWS is eGOS habit, not the right fit for a team tool with no ops staff.
4. **No Garmin promise in the pitch.** Garmin's API program is enterprise-only; Strava's 2024 API terms prohibit showing an athlete's data to anyone but themselves (kills Strava-as-coach-pipe). Manual entry is the honest MVP; .FIT upload is the realistic bridge.
5. **MVP scope is the sheet, period.** No HRV, no readiness scores, no interval builder. Every added field is a tax on a 19-year-old logging at 9pm.

## 6. Architecture (familiar stack, deliberately boring)

- **Frontend:** Next.js (App Router, TypeScript), mobile-first, installable PWA — hosted on **Vercel**
- **Backend:** **Supabase** — Postgres, Auth, Row-Level Security (athletes see only their own data; coaches see their squads), Realtime for the coach dashboard
- **Notifications:** Web Push + email (Resend or Supabase)
- **Build tooling:** Claude Code; conventions carried over from eGOS discipline: soft deletes, audit timestamps, RLS on everything
- **Cost:** $0–25/mo (Supabase Free → Pro), Vercel Hobby $0, domain ~$12/yr. Full breakdown in 02.

## 7. Why this wins vs. status quo and vs. buying

- vs. **paper:** always-available logs, instant distribution, same-day flags, permanent archive, summer coverage. Zero change to coaching content.
- vs. **Final Surge** ($19–39/mo coach plans; free for athletes; college discounts on request): Final Surge is a generic training log — it does not replicate the program's sheet format, grading workflow, or question routing, and the team doesn't own the data or the roadmap. Cost is *not* the differentiator (a D1 program can afford $39/mo); **workflow fit and ownership are**. The pressure test (04) treats "just buy Final Surge" as the strongest objection — read it before pitching.
