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

## ⛔ BLOCKING — coach onboarding (mostly DONE 2026-08-17 evening)

**The coach-impersonation fix — status:**

1. ~~Site URL + redirect allowlist~~ — **DONE** (Claude, via the Chrome
   extension, which CAN now attach to supabase.com — the old blocker is gone).
   Site URL = production; allowlist = `…vercel.app/**`. Verified on reload.
2. ~~Confirm email ON~~ — **DONE**, verified saved ("Successfully updated
   settings", toggle green on reload).
3. **Re-add the coaches** — SQL editor paste (kept on William's clipboard at
   the end of the 08-17 session):
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
   'fnh4mv+coach@virginia.edu';` — with 0006 applied this **actually revokes**.

**⚠ Email rate limit (new finding, matters for the roster wave):** the
built-in Supabase mailer sends **2 emails/hour** (Auth → Rate Limits; field is
locked without custom SMTP). Two coaches signing up tonight fit exactly.
~27 athletes signing up with confirmation ON do NOT — before inviting the
roster, either wire custom SMTP (Resend free tier, then raise the limit) or
accept a very staggered signup. Also note confirmation emails may land in spam
(generic supabase.io sender) — tell signups to check.

~~Rotate the trial account passwords~~ — **William declined 2026-08-17**
("don't need to rotate"); the value remains in git history (commit 773532e) on
a private repo. Decision recorded, item closed.

## 📋 Migration status

`supabase/migrations/0006_audit_hardening.sql` — **APPLIED 2026-08-17**
(William ran it in the SQL editor). `is_coach()` now requires current
`staff_emails` membership; role changes are service-role only; no athlete
hard-DELETE on logs; `created_at` pinned; week rows can't be athlete-deleted.

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
