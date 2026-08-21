-- HoosLog — per-coach DAY comments (coach request post-meeting, 2026-08-21)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- Same shape as 0008's week_comments, one level down: each coach gets their
-- own comment on each athlete-day, visible to the other coach and to the
-- athlete, attributed by name. Nobody steps on anybody's toes.
--
-- day_reviews stays: its `checked` is the shared team red-pen ✓ (either coach
-- checking a day checks it for the program — locked 7). Its old `comment`
-- column stops being written; any existing live comments are migrated into
-- day_comments below so nothing typed at the onboarding meeting is lost.

create table if not exists public.day_comments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  coach_name text not null,
  comment text not null check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (athlete_id, log_date, coach_id)
);

alter table public.day_comments enable row level security;

drop policy if exists dc_athlete_read on public.day_comments;
create policy dc_athlete_read on public.day_comments for select
  using (athlete_id = auth.uid());

drop policy if exists dc_coach_read on public.day_comments;
create policy dc_coach_read on public.day_comments for select
  using (public.is_coach());

drop policy if exists dc_coach_insert on public.day_comments;
create policy dc_coach_insert on public.day_comments for insert
  with check (public.is_coach() and coach_id = auth.uid());

-- Update covers edits and soft-deletes; each coach touches only their rows.
drop policy if exists dc_coach_update on public.day_comments;
create policy dc_coach_update on public.day_comments for update
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

drop trigger if exists touch_day_comments on public.day_comments;
create trigger touch_day_comments before update on public.day_comments
  for each row execute function public.touch_updated_at();

grant select, insert, update on public.day_comments to authenticated;

-- Carry over any live day_reviews comments (attributable ones only — rows
-- with a coach_id). As of 2026-08-21 there were zero, so this is a no-op
-- safety net rather than a data move.
insert into public.day_comments (athlete_id, log_date, coach_id, coach_name, comment)
select dr.athlete_id, dr.log_date, dr.coach_id,
       coalesce(nullif(trim(p.name), ''), 'Coach'), dr.comment
  from public.day_reviews dr
  left join public.profiles p on p.id = dr.coach_id
 where dr.comment is not null
   and dr.deleted_at is null
   and dr.coach_id is not null
on conflict (athlete_id, log_date, coach_id) do nothing;

-- Verify: table exists, RLS on, 4 policies.
select relrowsecurity as rls_on,
       (select count(*) from pg_policies where tablename = 'day_comments') as policies
  from pg_class where oid = 'public.day_comments'::regclass;
