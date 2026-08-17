-- HoosLog — closed signup roster (security, 2026-08-16)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- BEFORE: any @virginia.edu email could self-signup as an athlete.
-- AFTER : only emails on the roster below can create an account at all.
--         Coaches = staff_emails (Dunbar, Bradley, + one test account).
--         Everyone else on the roster = athlete_emails.
--
-- Existing accounts are unaffected (the trigger only runs on NEW signups).

-- ============================================================ athlete allowlist
create table if not exists public.athlete_emails (
  email text primary key check (email = lower(email)),
  name  text,
  note  text,
  added_at timestamptz not null default now()
);
alter table public.athlete_emails enable row level security;
drop policy if exists athlete_emails_read on public.athlete_emails;
create policy athlete_emails_read on public.athlete_emails
  for select using (public.is_coach());
-- writes: service role only (no policy) — same model as staff_emails.

-- ============================================================ the signup gate
-- Reject anyone not on the roster; role = coach iff in staff_emails.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  em text := lower(new.email);
  is_staff   boolean;
  is_athlete boolean;
begin
  select exists(select 1 from staff_emails   where email = em) into is_staff;
  select exists(select 1 from athlete_emails where email = em) into is_athlete;

  if not is_staff and not is_athlete then
    raise exception 'Not on the team roster — ask your coach to add you';
  end if;

  insert into public.profiles (id, email, name, role)
  values (
    new.id, em,
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when is_staff then 'coach' else 'athlete' end
  );
  return new;
end $$;
-- trigger on_auth_user_created (from 0001) already calls handle_new_user().

-- ============================================================ coaches
-- Only these can ever get a coach account. fnh4mv+coach = William's TEST coach,
-- kept for now, delete before go-live.
insert into public.staff_emails (email, note) values
  ('hfb5af@virginia.edu',        'Coach — Trevor Dunbar'),
  ('ndt4ve@virginia.edu',        'Coach — Sam Bradley'),
  ('fnh4mv+coach@virginia.edu',  'TEST coach (William) — delete before go-live')
on conflict (email) do update set note = excluded.note;

-- ============================================================ athletes (30)
insert into public.athlete_emails (email, name) values
  ('vwz2at@virginia.edu', 'Sam John Palmer'),
  ('dtw3fe@virginia.edu', 'Quinn Dulany Eliason'),
  ('atu4xv@virginia.edu', 'Shane Makana Brosnan'),
  ('wzz9ed@virginia.edu', 'Ciaran Donnacha Brosnan'),
  ('hju5az@virginia.edu', 'Philip David Cupial'),
  ('gyu5nm@virginia.edu', 'Trent W Daniels'),
  ('euu8xk@virginia.edu', 'Sean Warren Gray'),
  ('tsv8cu@virginia.edu', 'Luke William Hnatt'),
  ('qjp4nm@virginia.edu', 'Henry Trepagnier Birge'),
  ('nvv5qk@virginia.edu', 'Kayden Thomas Lightner'),
  ('dms7jc@virginia.edu', 'Henry Elijah Acorn'),
  ('fnh4mv@virginia.edu', 'William Hayden Sheets'),
  ('zwh3ga@virginia.edu', 'Brenden Michael McMahon'),
  ('zqu3wh@virginia.edu', 'Eric Moore'),
  ('mea6wq@virginia.edu', 'Jonathan Logan Seyfert'),
  ('nrk7dj@virginia.edu', 'Alexander J Valencia'),
  ('ghu7yg@virginia.edu', 'Charles Perry'),
  ('kna3ed@virginia.edu', 'Jimmy Wischusen'),
  ('hww4nw@virginia.edu', 'Adam Christopher Balewicz'),
  ('sen4zu@virginia.edu', 'Aidan Timothy Cox'),
  ('kxy2qc@virginia.edu', 'Alex Leath'),
  ('hub9fh@virginia.edu', 'Andrew Graham Jones'),
  ('qnp3nj@virginia.edu', 'Ben Isaac Godish'),
  ('kma8am@virginia.edu', 'Cayden Wayne Dyer'),
  ('cgd2va@virginia.edu', 'Cooper Davis Groat'),
  ('rwd8an@virginia.edu', 'James Joseph Donahue'),
  ('jbe9ns@virginia.edu', 'James Bruce Ford'),
  ('xrk9rs@virginia.edu', 'Pierce Conor Seigne'),
  ('jxm8cj@virginia.edu', 'Richard Charles Moreno'),
  ('ret8ve@virginia.edu', 'Tyler William Edson')
on conflict (email) do update set name = excluded.name;

-- ============================================================ verify
select 'coaches'          as list, string_agg(email, ', ' order by email) as detail from staff_emails
union all
select 'athletes (count)',        count(*)::text                           from athlete_emails;
-- Expect: coaches = hfb5af, ndt4ve, fnh4mv+coach ; athletes count = 30.
