-- HoosLog — per-coach week comments (two real coaches, 2026-08-20)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- With Dunbar AND Bradley both reviewing, the single athlete_weeks.coach_comment
-- column can't work: it's one shared textbox with no attribution, so one
-- coach's feedback replaces the other's. Each coach now gets their own row per
-- athlete-week; the athlete sees every comment, attributed; coaches see each
-- other's.
--
-- coach_name is denormalized at write time: athletes can't read coach profiles
-- (RLS, locked 20) but must see who said what.
--
-- athlete_weeks.coach_comment stays in place for history but the app no longer
-- writes it (zero live rows used it as of 2026-08-20). The reviewed_at stamp
-- stays on athlete_weeks and stays SHARED — "reviewed" is a team to-do state,
-- not a per-coach score (locked 7).

create table if not exists public.week_comments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  coach_name text not null,
  comment text not null check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (athlete_id, week_start, coach_id)
);

alter table public.week_comments enable row level security;

drop policy if exists wc_athlete_read on public.week_comments;
create policy wc_athlete_read on public.week_comments for select
  using (athlete_id = auth.uid());

drop policy if exists wc_coach_read on public.week_comments;
create policy wc_coach_read on public.week_comments for select
  using (public.is_coach());

drop policy if exists wc_coach_insert on public.week_comments;
create policy wc_coach_insert on public.week_comments for insert
  with check (public.is_coach() and coach_id = auth.uid());

-- Update covers edits AND soft-deletes (deleted_at) — each coach only ever
-- touches their own rows. No hard-DELETE policy on purpose.
drop policy if exists wc_coach_update on public.week_comments;
create policy wc_coach_update on public.week_comments for update
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

drop trigger if exists touch_week_comments on public.week_comments;
create trigger touch_week_comments before update on public.week_comments
  for each row execute function public.touch_updated_at();

grant select, insert, update on public.week_comments to authenticated;

-- Verify: table exists, RLS on, 4 policies.
select relrowsecurity as rls_on,
       (select count(*) from pg_policies where tablename = 'week_comments') as policies
  from pg_class where oid = 'public.week_comments'::regclass;
