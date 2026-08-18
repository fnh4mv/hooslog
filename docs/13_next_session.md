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

### Correctness — do first
1. **Midnight-ET rollover** (`src/app/log/page.tsx:42`, `src/lib/dates.ts`).
   A run logged after midnight ET lands on the wrong day, and on Sunday night
   the wrong *week*. Distance runners log late. Consider an explicit "which day
   is this for?" affordance rather than only inferring from the clock.
2. **Week comment last-write-wins** (`src/app/coach/actions.ts:102`). Two
   coaches (or one stale tab) silently overwrite each other. Needs optimistic
   concurrency: send the loaded `updated_at`, reject on mismatch, tell the
   coach to reload. Matters now that there are genuinely two coaches.
3. **Goal % capped at 100** (`src/app/log/page.tsx:70`) hides over-mileage from
   both sides — a real injury-risk signal for a distance program.
4. **`readDate` rolls invalid dates over** (`src/lib/importer.ts:74`) instead of
   rejecting, unlike `fromISO`. A typed 2026-02-31 becomes March 3.

### Coach workflow
5. **Importer refuses the entire week** — workouts included — if any athlete in
   the Goals tab hasn't signed up yet (`src/app/coach/upload/uploader.tsx:296`).
   During onboarding that is most weeks. Should post the plan and report the
   unmatched athletes, or offer "post plan only".
6. **No handled/answered state on alerts** (`src/lib/queries.ts:303`). Sunday's
   strip still lists every flag dealt with on Tuesday. Needs a dismiss/handled
   marker — probably tied to `day_reviews`.
7. **Importer preview copy is wrong**: says athletes missing from the Goals tab
   "keep whatever goal they already had" — on a new week they get *no* goal
   (`src/app/coach/upload/actions.ts:97`).
8. **No past-week warning on upload** (`src/lib/importer.ts:131`) — the
   template ships a fixed default date, making that the likeliest coach error.
9. Coach can't see who hasn't signed up, or who hasn't logged, without reading
   210 cells.

### Athlete UX
10. **Nothing typed persists until Save** — tapping another day chip or
    backgrounding the phone discards the entry (`day-forms.tsx:115`).
11. **Sunday nudge shames new athletes** with an impossible count and a
    deadline the app doesn't enforce (`src/app/log/page.tsx:78`).
12. **"Coach sees this today" only appears after opting in** — the killer
    feature is invisible on day one.
13. **RPE + run-type chips ~27px** at 390px — below a reliable tap target.
14. Save sits below four optional fields, off-screen behind the keyboard.

### Visual system
15. Thirteen font sizes, two spellings of the same value, three near-identical
    weights; the athlete's two screens have different headers; `SignOutButton`
    ships a layout margin two callers cancel.
16. Grid rows 41px with no zebra beyond the new odd-row tint — re-check density
    once there are 30 real athletes.

### Phase 6 polish (unblocks real push)
17. Favicon (none — `/favicon.ico` 404s), page titles, PWA manifest + icons so
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
