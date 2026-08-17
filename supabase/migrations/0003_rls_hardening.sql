-- HoosLog — RLS hardening + review fixes (live E2E + adversarial review, 2026-08-16)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- THE HEADLINE BUG (proved live against the real project): an athlete could
-- promote themself to coach with one PostgREST call:
--   PATCH /rest/v1/profiles?id=eq.<own id>  {"role":"coach"}
-- Why it worked: Postgres pools permissive policies with OR — an UPDATE's new
-- row passes if it satisfies the WITH CHECK of *any* policy for that command.
-- profiles_coach_update had WITH CHECK (true), so every athlete's rewrite of
-- their own row sailed through it, and the own-policy's role='athlete' check
-- never mattered. A test athlete account really did become a coach.
--
-- The review pass then confirmed two more holes in the same class (RLS is
-- row-level; nothing was column-level): athletes could rewrite their own
-- email/status (signup-blocking squats, vanishing off the coach grid), and
-- could set/erase coach-owned columns on their own athlete_weeks row — or
-- DELETE the row, taking the coach's comment with it.

-- ==================== 1. the policy fix ====================
drop policy profiles_coach_update on public.profiles;
create policy profiles_coach_update on public.profiles for update
  using (public.is_coach()) with check (public.is_coach());

-- ==================== 2. column guard on profiles ====================
-- Athletes may change their display name; email/role/status/deleted_at are
-- coach/admin-only. auth.uid() IS NULL = service role or the SQL editor —
-- trusted, skip.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_coach() then return new; end if;
  if new.email      is distinct from old.email
     or new.role       is distinct from old.role
     or new.status     is distinct from old.status
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Athletes can only change their display name';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- ==================== 3. athlete_weeks: no athlete DELETE, no coach-column writes ====================
-- aw_own was FOR ALL — athletes could hard-DELETE their week row (wiping the
-- coach's comment) and write coach-owned columns. Split into read/insert/
-- update only; coaches keep full access via aw_coach.
drop policy aw_own on public.athlete_weeks;
create policy aw_own_select on public.athlete_weeks for select
  using (athlete_id = auth.uid());
create policy aw_own_insert on public.athlete_weeks for insert
  with check (athlete_id = auth.uid());
create policy aw_own_update on public.athlete_weeks for update
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- And the column guard: athletes touch only athlete_summary.
create or replace function public.guard_athlete_week_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_coach() then return new; end if;
  if tg_op = 'INSERT' then
    if new.mileage_goal is not null
       or new.coach_comment is not null
       or new.reviewed_at is not null then
      raise exception 'Only coaches can set goals or reviews';
    end if;
  else
    if new.mileage_goal  is distinct from old.mileage_goal
       or new.coach_comment is distinct from old.coach_comment
       or new.reviewed_at   is distinct from old.reviewed_at then
      raise exception 'Only coaches can set goals or reviews';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_athlete_week_columns on public.athlete_weeks;
create trigger guard_athlete_week_columns
  before insert or update on public.athlete_weeks
  for each row execute function public.guard_athlete_week_columns();

-- ==================== 4. sanity bound on logs ====================
-- The app already rejects >40mi; the table only said >= 0. Direct-API graffiti
-- shouldn't be able to put a 999.9-mile day in the coach's grid.
alter table public.logs drop constraint if exists logs_distance_sane;
alter table public.logs add constraint logs_distance_sane
  check (distance_mi <= 40);

-- ==================== 5. import_week v2 ====================
-- Two review fixes: (a) the goals upsert now revives a soft-deleted week row
-- (the plans upsert already did — they were asymmetric, so a re-imported goal
-- could stay invisibly deleted); (b) goals only match athletes the coach grid
-- actually shows (active/injured) — a goal for an alum/inactive account now
-- errors by name instead of landing where nobody will ever see it.
create or replace function public.import_week(
  p_week_start date,
  p_plans text[],   -- exactly 7; index 1 = Monday
  p_goals jsonb     -- [{"email": "abc1de@virginia.edu", "goal": 70}, ...]
)
returns table (goals_set int, unknown_emails text[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  g jsonb;
  v_athlete uuid;
  v_set int := 0;
  v_unknown text[] := '{}';
  i int;
begin
  if not public.is_coach() then
    raise exception 'Only coaches can import a week plan';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  if coalesce(array_length(p_plans, 1), 0) <> 7 then
    raise exception 'Expected 7 day plans, got %', coalesce(array_length(p_plans, 1), 0);
  end if;

  for i in 1..7 loop
    insert into week_plans (week_start, day, plan_text)
    values (p_week_start, i - 1, coalesce(p_plans[i], ''))
    on conflict (week_start, day) do update
      set plan_text = excluded.plan_text,
          deleted_at = null;
  end loop;

  for g in select * from jsonb_array_elements(p_goals) loop
    select id into v_athlete
      from profiles
     where email = lower(g->>'email')
       and role = 'athlete'
       and status in ('active','injured')   -- match what the grid shows
       and deleted_at is null;

    if v_athlete is null then
      v_unknown := v_unknown || (g->>'email');
      continue;
    end if;

    insert into athlete_weeks (athlete_id, week_start, mileage_goal)
    values (v_athlete, p_week_start, (g->>'goal')::numeric)
    on conflict (athlete_id, week_start) do update
      set mileage_goal = excluded.mileage_goal,
          deleted_at = null;                 -- revive, same as plans
    v_set := v_set + 1;
  end loop;

  if array_length(v_unknown, 1) > 0 then
    raise exception 'No athlete account for: %', array_to_string(v_unknown, ', ');
  end if;

  return query select v_set, v_unknown;
end $$;

revoke all on function public.import_week(date, text[], jsonb) from public;
grant execute on function public.import_week(date, text[], jsonb) to authenticated;

-- ==================== 6. repair ====================
-- Demote the E2E fixture account that proved the escalation. Idempotent.
update public.profiles set role = 'athlete'
 where email = 'hooslog.test.brennan@virginia.edu' and role = 'coach';

-- ==================== did it work? ====================
select 'coach-update policy fixed' as check,
       (select count(*)::text from pg_policies
         where tablename = 'profiles' and policyname = 'profiles_coach_update'
           and with_check like '%is_coach%') as result
union all
select 'guard triggers installed',
       (select count(*)::text from pg_trigger
         where tgname in ('guard_profile_columns','guard_athlete_week_columns'))
union all
select 'athlete_weeks: no athlete delete policy',
       (select count(*)::text from pg_policies
         where tablename = 'athlete_weeks' and cmd = 'DELETE')
union all
select 'distance cap on logs',
       (select count(*)::text from pg_constraint where conname = 'logs_distance_sane')
union all
select 'coach roles now',
       (select string_agg(email, ', ') from public.profiles where role = 'coach');
-- Expect: 1, 2, 0, 1, and ONLY fnh4mv+coach@virginia.edu + hooslog.test.coach@example.com.
