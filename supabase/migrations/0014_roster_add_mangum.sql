-- HoosLog — roster addition: Andrew Tyler Mangum (2026-09-15)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- WHY: the closed-signup roster loaded by 0005 was the August list (30 athletes).
-- Mangum joined after it and could not create an account at all — handle_new_user()
-- raises 'Not on the team roster' for any email not in athlete_emails, and GoTrue
-- reports that back as a generic failure. Adding the email is the whole fix; he
-- signs up normally afterwards and the trigger builds his profile.
--
-- NOTE: this row was already inserted on production via the service-role REST API
-- on 2026-09-15. This migration exists so a virgin replay of supabase/migrations/
-- produces the same roster. Re-running it is a no-op.

insert into public.athlete_emails (email, name, note) values
  ('utb5vp@virginia.edu', 'Andrew Tyler Mangum', 'Added 2026-09-15 — roster addition after the August load')
on conflict (email) do update set name = excluded.name, note = excluded.note;

-- ============================================================ verify
select 'athletes (count)' as list, count(*)::text as detail from public.athlete_emails
union all
select 'mangum', coalesce((select name from public.athlete_emails where email = 'utb5vp@virginia.edu'), 'MISSING');
-- Expect: athletes count = 31 ; mangum = Andrew Tyler Mangum.
