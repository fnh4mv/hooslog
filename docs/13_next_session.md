# 13 — Next session: to-do & redeploy checklist

**Updated 2026-08-17 after the full audit + fix pass. Read `CLAUDE.md` first,
then `docs/14_audit_2026-08-17.md` for the full findings.**

App is **LIVE**: https://hooslog-william-s-projects-aaa81194.vercel.app
`git push` to `main` auto-deploys (~90s). **Migrations must be pasted into the
Supabase SQL editor by hand** — there is no API path for DDL, and the Claude
Chrome extension cannot attach to supabase.com or vercel.com. Vercel env vars
are set and manageable from the repo with `vercel env`.

Real athletes are already signing up and logging. Treat the DB as production.

---

## ⛔ BLOCKING — William only (Supabase dashboard, ~5 min)

**The coach-impersonation fix.** Signup grants `role='coach'` to whoever types
a coach email, and email confirmation is currently OFF, so the address alone is
the credential. Both coach emails are **parked out of `staff_emails`** as a
mitigation, which means **Dunbar and Bradley cannot sign up until this is done.**

1. Supabase → Auth → **URL Configuration** → Site URL =
   `https://hooslog-william-s-projects-aaa81194.vercel.app`; add it to the
   redirect allowlist. (It still points at localhost.)
2. Supabase → Auth → **turn "Confirm email" ON.**
3. Re-add the coaches:
   ```sql
   insert into public.staff_emails (email, note) values
     ('hfb5af@virginia.edu', 'Coach — Trevor Dunbar'),
     ('ndt4ve@virginia.edu', 'Coach — Sam Bradley')
   on conflict (email) do update set note = excluded.note;
   ```
4. Have Dunbar and Bradley sign up **immediately** so both addresses are
   claimed. (Even with confirmation ON, an unclaimed address can still be
   *squatted* to block the real person — the AFTER INSERT trigger writes the
   profile row regardless. Claiming early is the belt-and-braces.)
5. Then remove the test coach: `delete from public.staff_emails where email =
   'fnh4mv+coach@virginia.edu';` — after 0006 this **actually revokes** access.

**Also:** rotate the trial account passwords. The value was in a chat
transcript and is still in git history (commit 773532e); deleting the line was
not remediation.

## 📋 Paste this migration (written, tested to build, not yet applied)

`supabase/migrations/0006_audit_hardening.sql` — SQL editor → paste → Run.
- `is_coach()` now requires **current** `staff_emails` membership, so removing
  a row revokes access (previously it did not — the documented go-live step
  left the test coach fully privileged).
- `role` changes are service-role only — a coach can no longer mint coaches or
  demote the head coach.
- Athletes lose hard-DELETE on `logs` (app only soft-deletes anyway), so a pain
  flag the coach already read can't be erased; `created_at` is pinned.
- Athletes can't soft-delete a week row out from under the coach's comment.
- `search_path` includes `pg_temp` on SECURITY DEFINER functions.

Verify block at the bottom should return `1, 0, 1` and only intended coaches.

---

## Still open, ranked (all confirmed by the audit)

### ✅ Fixed 2026-08-17 evening (items renumbered below)
- ~~Midnight-ET rollover~~ — training day now rolls at **3 AM ET**
  (`trainingTodayET()` in `src/lib/dates.ts`), used by every page for default
  day/week, nudges, and grids. `/log` shows an after-midnight banner naming the
  day it will log to, with a link to the new day instead; server validation
  still accepts either day.
- ~~Week comment last-write-wins~~ — `saveWeekReview` is now a compare-and-swap
  on the coach-owned columns (not `updated_at`, so athlete summary saves can't
  false-conflict). On conflict nothing is written; the coach sees what the week
  says now and can save again to deliberately replace it.
- ~~Goal % capped at 100~~ — uncapped athlete + coach + drill-in; bars clamp.
- ~~`readDate` rollover~~ — round-trip check, same rule as `fromISO`.
- ~~Importer refuses whole week over unmatched emails~~ — now posts the plan +
  matched goals; skipped emails reported in preview, confirm button, and the
  done screen. Fixed app-side (commitUpload filters), `import_week` unchanged.
- ~~No handled state on alerts~~ — an alert is handled when a live day_review
  for that athlete+day is **newer than the log**; athlete edits after the
  review resurface it. Handled alerts collapse to "✓ N handled"; all-handled
  shows a green strip. Code-only, no schema change.
- ~~Wrong "keeps existing goal" preview copy~~ · ~~no past-week warning~~ —
  copy corrected; B3 in a past week now warns (never blocks backfill).

### Coach workflow
1. Coach can't see who hasn't signed up, or who hasn't logged, without reading
   210 cells. (Signed-up-vs-roster needs coach read access to `athlete_emails`
   — check its RLS before building.)

### Athlete UX
2. **Nothing typed persists until Save** — tapping another day chip or
   backgrounding the phone discards the entry (`day-forms.tsx:115`).
3. **Sunday nudge shames new athletes** with an impossible count and a
   deadline the app doesn't enforce (`src/app/log/page.tsx`).
4. **"Coach sees this today" only appears after opting in** — the killer
   feature is invisible on day one.
5. **RPE + run-type chips ~27px** at 390px — below a reliable tap target.
6. Save sits below four optional fields, off-screen behind the keyboard.

### Visual system
7. Thirteen font sizes, two spellings of the same value, three near-identical
   weights; the athlete's two screens have different headers; `SignOutButton`
   ships a layout margin two callers cancel.
8. Grid rows 41px with no zebra beyond the new odd-row tint — re-check density
   once there are 30 real athletes.

### Phase 6 polish (unblocks real push)
9. Favicon (none — `/favicon.ico` 404s), page titles, PWA manifest + icons so
   it installs to the home screen.

## Real push notifications (deferred by design)

Shipped = **in-app** red-dot nudges only. To buzz a phone when the app is
closed: PWA install first (iOS only allows web push for installed PWAs), then
VAPID keys → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in Vercel, a
service worker + permission prompt, and a Vercel Cron job for the evening and
Sunday sends. Optional email fallback via Resend for anyone not installed.

## Don't regress these (locked decisions)

No scores anywhere. No coach response-time metrics. No submit button — every
save is instantly live to the coach. Backfilling is normal and must never be
shamed. Orange means pain and nothing else.
