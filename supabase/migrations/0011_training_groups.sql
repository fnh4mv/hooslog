-- HoosLog — two training groups: distance + mid-distance (locked 24–27)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- The program runs TWO schedules, not one. Everyone still gets a weekly
-- mileage number (locked 18 is unchanged); the group only decides which of the
-- two workout columns an athlete sees.
--
-- Group lives on the ATHLETE and is sticky (locked 25): once a guy is marked
-- mid-D he stays mid-D every week until the coach changes that cell. A blank
-- group cell in the upload means "leave him where he is" — never a silent
-- reset to distance.

-- ==================== 1. the group, on the athlete ====================
alter table public.profiles
  add column if not exists training_group text not null default 'distance';

do $$ begin
  alter table public.profiles
    add constraint profiles_training_group_check
    check (training_group in ('distance','mid'));
exception when duplicate_object then null; end $$;

-- ==================== 2. the group, on the plan ====================
-- Existing rows default to 'distance', which is correct: every week posted
-- before today WAS the distance schedule.
alter table public.week_plans
  add column if not exists training_group text not null default 'distance';

do $$ begin
  alter table public.week_plans
    add constraint week_plans_training_group_check
    check (training_group in ('distance','mid'));
exception when duplicate_object then null; end $$;

-- Re-key: one plan row per (week, GROUP, day) instead of per (week, day).
-- Without this the mid-D Monday would collide with the distance Monday and
-- one of them would silently overwrite the other.
alter table public.week_plans
  drop constraint if exists week_plans_week_start_day_key;
do $$ begin
  alter table public.week_plans
    add constraint week_plans_week_group_day_key
    unique (week_start, training_group, day);
exception when duplicate_table | duplicate_object then null; end $$;

-- ==================== 3. close the squad-switching hole ====================
-- 0003 added this guard because RLS is row-level, not column-level: an athlete
-- can PATCH their own profile row, and only the columns named here stop them.
-- training_group is coach-owned — without this line an athlete could move
-- himself onto the other squad's schedule. Same bug class as the
-- role='coach' escalation 0003 was written to close.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_coach() then return new; end if;
  if new.email          is distinct from old.email
     or new.role           is distinct from old.role
     or new.status         is distinct from old.status
     or new.training_group is distinct from old.training_group
     or new.deleted_at     is distinct from old.deleted_at then
    raise exception 'Athletes can only change their display name';
  end if;
  return new;
end $$;

-- ==================== 4. import_week v4 ====================
-- New signature: two plan arrays instead of one, and goals entries may carry
-- "group". The v3 3-arg function is deliberately LEFT IN PLACE so a deploy
-- that lands before this migration is pasted keeps importing distance weeks
-- instead of hard-failing; drop it in a later cleanup once v4 is live.
--
-- Still one transaction (docs/12 Phase 4 — no partial writes), still
-- security invoker: RLS applies as the calling coach, and the guard trigger
-- above returns early for coaches, which is what authorizes the profile write.
create or replace function public.import_week(
  p_week_start      date,
  p_plans_distance  text[],   -- exactly 7; index 1 = Monday
  p_plans_mid       text[],   -- exactly 7; index 1 = Monday
  p_goals           jsonb     -- [{"email":"a@x","goal":57.5,"label":"55-60","group":"mid"}, ...]
)
returns table (goals_set int, moved_to_mid text[], moved_to_distance text[], unknown_emails text[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  g jsonb;
  v_athlete uuid;
  v_current text;
  v_want    text;
  v_set int := 0;
  v_to_mid  text[] := '{}';
  v_to_dist text[] := '{}';
  v_unknown text[] := '{}';
  i int;
begin
  if not public.is_coach() then
    raise exception 'Only coaches can import a week plan';
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  if coalesce(array_length(p_plans_distance, 1), 0) <> 7 then
    raise exception 'Expected 7 distance day plans, got %',
      coalesce(array_length(p_plans_distance, 1), 0);
  end if;
  if coalesce(array_length(p_plans_mid, 1), 0) <> 7 then
    raise exception 'Expected 7 mid-distance day plans, got %',
      coalesce(array_length(p_plans_mid, 1), 0);
  end if;

  -- ---- both schedules, one row per (group, day) ----
  for i in 1..7 loop
    insert into week_plans (week_start, training_group, day, plan_text)
    values (p_week_start, 'distance', i - 1, coalesce(p_plans_distance[i], ''))
    on conflict (week_start, training_group, day) do update
      set plan_text = excluded.plan_text,
          deleted_at = null;

    insert into week_plans (week_start, training_group, day, plan_text)
    values (p_week_start, 'mid', i - 1, coalesce(p_plans_mid[i], ''))
    on conflict (week_start, training_group, day) do update
      set plan_text = excluded.plan_text,
          deleted_at = null;
  end loop;

  -- ---- per-athlete group + mileage goal ----
  for g in select * from jsonb_array_elements(p_goals) loop
    select id, training_group into v_athlete, v_current
      from profiles
     where email = lower(g->>'email')
       and role = 'athlete'
       and status in ('active','injured')   -- match what the grid shows
       and deleted_at is null;

    if v_athlete is null then
      v_unknown := v_unknown || (g->>'email');
      continue;
    end if;

    -- A null/absent group means "leave him where he is" (locked 25). Only an
    -- explicit value moves an athlete, and only a real change is written —
    -- so a re-upload of the same file doesn't churn every profile's
    -- updated_at, and the moved-lists stay an honest record of what changed.
    v_want := nullif(g->>'group', '');
    if v_want is not null and v_want is distinct from v_current then
      if v_want not in ('distance','mid') then
        raise exception 'Unknown training group "%" for %', v_want, g->>'email';
      end if;
      update profiles set training_group = v_want where id = v_athlete;
      if v_want = 'mid' then
        v_to_mid := v_to_mid || (g->>'email');
      else
        v_to_dist := v_to_dist || (g->>'email');
      end if;
    end if;

    -- A goal is optional: a row can carry a group change and no mileage.
    if (g->>'goal') is not null then
      insert into athlete_weeks (athlete_id, week_start, mileage_goal, goal_label)
      values (v_athlete, p_week_start, (g->>'goal')::numeric, nullif(g->>'label', ''))
      on conflict (athlete_id, week_start) do update
        set mileage_goal = excluded.mileage_goal,
            goal_label   = excluded.goal_label;
      v_set := v_set + 1;
    end if;
  end loop;

  if array_length(v_unknown, 1) > 0 then
    raise exception 'No athlete account for: %', array_to_string(v_unknown, ', ');
  end if;

  return query select v_set, v_to_mid, v_to_dist, v_unknown;
end $$;

revoke all on function public.import_week(date, text[], text[], jsonb) from public;
grant execute on function public.import_week(date, text[], text[], jsonb) to authenticated;

-- ==================== verify ====================
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='training_group')                                as profiles_col,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='week_plans'
      and column_name='training_group')                                as plans_col,
  (select count(*) from pg_constraint
    where conname='week_plans_week_group_day_key')                     as new_unique,
  (select count(*) from pg_constraint
    where conname='week_plans_week_start_day_key')                     as old_unique_gone,
  position('training_group' in pg_get_functiondef(
    'public.guard_profile_columns()'::regprocedure)) > 0               as guard_ok,
  position('p_plans_mid' in pg_get_functiondef(
    'public.import_week(date, text[], text[], jsonb)'::regprocedure)) > 0 as import_v4_ok;
-- Expect: 1, 1, 1, 0, true, true.
