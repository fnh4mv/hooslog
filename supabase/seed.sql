-- HoosLog seed — run AFTER 0001_initial.sql, in the Supabase SQL Editor.
-- Edit the emails below before running. This is the ONLY place coach access
-- is granted; app code never writes staff_emails.

-- 1. Coach allowlist.
--    William: replace with the trial's fake-coach email (an inbox you control)
--    and, when he's ready, Coach Dunbar's real email. Remove the trial email
--    at trial end — that's the "outlives William" step.
insert into public.staff_emails (email, note) values
  ('trial.coach.email@example.com', 'TRIAL ONLY — remove after trial week'),
  -- ('dunbar@virginia.edu', 'Head coach'),
  -- ('assistant@virginia.edu', 'Assistant coach'),
  ('placeholder@example.com', 'delete me')
on conflict (email) do nothing;

delete from public.staff_emails where email = 'placeholder@example.com';

-- 2. Nothing else to seed: athletes create their own accounts (UVA email gate),
--    plans arrive via the coach portal, weeks are created on first log.
