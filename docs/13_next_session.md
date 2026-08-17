# 13 — Next session: to-do & redeploy checklist

**Written 2026-08-16 (end of session). Read `CLAUDE.md` first, then this.**

App is **LIVE**: https://hooslog-william-s-projects-aaa81194.vercel.app
Deploys auto-run on `git push` to `main`. **Migrations must be pasted into the
Supabase SQL editor by hand** — there's no API path for DDL: copy the `.sql`,
paste, Run, check the verify query at the bottom. Env vars are already set in
Vercel (`vercel env`). Data was wiped clean this session — the only accounts
that exist are `fnh4mv+coach@virginia.edu` (coach) and `zwh3ga@virginia.edu`
(a real athlete).

---

## ✅ DONE 2026-08-16/17 (Tasks 1, 2, 3 shipped + verified live)

- **Task 1 & 2 — closed roster:** `supabase/migrations/0005_closed_roster.sql`
  applied. Coaches = Dunbar (`hfb5af`), Bradley (`ndt4ve`), + `fnh4mv+coach`
  test. 30 athletes in `athlete_emails`. Off-roster signups rejected (verified).
- **Task 3 — "Aerobic" → "Training run":** shipped (label only; stored value
  still `aerobic`). Verified on prod.
- **Bonus — in-app reminders shipped:** red-dot nudges (athlete: log-today /
  Sunday week-close; coach: weekend to-review). No push infra (that's below).

### Still open / for next session
- **Task 4 — delete-a-run "redo":** the delete already exists (see below).
  Confirm with William if he wants it reworded / more prominent.
- **Real push notifications** (buzz the phone when the app is closed): still a
  future build — see the new section at the bottom.
- **Before go-live:** remove the `fnh4mv+coach` test coach from `staff_emails`
  once Dunbar/Bradley have their accounts.

---

## Task 1 — Closed signup roster (SECURITY) · needs migration + redeploy

**Now:** any `@virginia.edu` email can self-signup as an athlete
(`handle_new_user()` trigger, `supabase/migrations/0001_initial.sql`).
**New rule William wants:** ONLY explicitly-listed people can create an account
at all.

Plan:
- New migration `0005_closed_roster.sql`: add an `athlete_emails` allowlist
  table (mirrors `staff_emails`: `email pk, note, added_at`). Rewrite
  `handle_new_user()` so signup is **rejected unless** the email is in
  `staff_emails` ∪ `athlete_emails`; role = `coach` if in `staff_emails`, else
  `athlete`. Remove the blanket `%@virginia.edu` allowance. New reject message,
  e.g. `Not on the team roster — ask your coach to add you`.
- Seed `athlete_emails` with William's roster.
- `src/app/(auth)/signup/page.tsx` already softens `database error saving new
  user` into a friendly line — confirm the new rejection still shows nicely;
  update the wording if needed.
- No in-app UI to manage the roster; SQL-only is fine for the trial.
- **Design choice to confirm:** keep `staff_emails` (coaches) + new
  `athlete_emails` (athletes) [recommended], vs one combined `roster(email,
  role)` table.

## Task 2 — Coaches = exactly the 2 real coaches · SQL (part of 0005 seed)

- Add the 2 coach emails to `staff_emails`.
- Remove the placeholder `fnh4mv+coach@virginia.edu` **unless William wants to
  keep his own coach login** (ask).
- `staff_emails` decides the role assigned **at signup**; a coach who already
  signed up keeps their role even if the list changes — set `profiles.role`
  directly if you ever need to fix an existing account.

## Task 3 — Rename "Aerobic" → "Training run" (TR) · code only, no migration

- `src/lib/types.ts` → `RUN_TYPE_LABELS.aerobic = "Training run"`. That relabels
  the athlete form chip, the coach drill-in tag, everywhere it renders.
- Stored DB value stays `'aerobic'` (internal). All run data was wiped, so a
  true rename (`'aerobic'`→`'training'` via a check-constraint migration) is
  optional — do it only if the internal name bugs us.
- **Confirm with William:** should a Training run get a grid mark, or stay
  unmarked like now? Today `RUN_TYPE_MARKS.aerobic = ""` (unmarked); TR is the
  everyday baseline run (team dictionary), so unmarked is consistent — but he
  may want a "TR" mark.

## Task 4 — Delete-a-run to "redo" · ALREADY PARTLY BUILT — confirm scope

- A delete already exists: `deleteLog` (soft-delete) in
  `src/app/log/actions.ts`, surfaced as a **"Logged the wrong day? Remove this
  run"** link on any saved run in `src/app/log/day-forms.tsx`.
- So "delete a run to redo it" already works today: remove it, then log fresh.
- **Confirm with William what's missing:** likely just reword to "Delete / redo
  this run" and/or make it more prominent, or a one-tap "redo" (delete + reopen
  an empty form). Small tweak, not a new build. He may not have seen the
  existing link.

---

## Redeploy steps (next session)

1. Make the code changes; `npm run build` must pass (run it before pushing).
2. New migration: copy the `.sql` → Supabase SQL editor → Run → check the
   verify query. (William pastes it, or hands off the paste.)
3. Seed the roster + coach emails via SQL from William's lists.
4. `git push` → Vercel auto-deploys (~90s). Then verify on the live URL:
   sign in works, an off-roster email is **blocked** from signing up, the
   run-type chip reads "Training run", delete/redo behaves as agreed.
5. Update `CLAUDE.md` status + tick items here.

## Real push notifications (deferred — the "buzz the phone" version)

Shipped now = **in-app** red-dot nudges (only seen when the app is open). To
actually alert athletes when the app is closed (end-of-day "log your run",
Sunday deadline), we need real web push. Plan when we do it:
1. PWA install first — iOS only allows web push for home-screen-installed PWAs
   (iOS 16.4+). That install is part of the Phase 6 polish below, so do push
   right after.
2. Generate VAPID keys → add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`
   to Vercel env (placeholders already noted in `.env.example`).
3. Service worker + a "turn on reminders" permission prompt in the athlete UI.
4. A Vercel Cron job that runs ~evening + Sunday and sends push to athletes who
   haven't logged. (Optional email fallback via Resend for anyone not installed.)
Effort: real but bounded. In-app dots cover a lot until then.

## Not on William's list but worth doing before real athletes (Phase 6)

- Favicon (there's none — `/favicon.ico` 404s), page titles, PWA manifest +
  icons so it installs to the home screen (also unblocks push above), nicer
  empty-state screens.
- Change the trial password later (`Outerbanks14$` is in the chat transcript).
