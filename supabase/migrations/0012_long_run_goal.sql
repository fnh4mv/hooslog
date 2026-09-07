-- HoosLog — long run goal alongside the weekly mileage goal (William, 2026-09-07)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- Locked 18 said the coach sets ONE number per athlete per week: total miles.
-- He now sets two, side by side in the week file: the weekly total, and how
-- long the long run should be. Both are per athlete, both are display targets;
-- only the weekly number drives the progress bar (locked 28).
--
-- Same shape as 0010's goal_label: long_run_goal is the tracked number
-- (midpoint of a range, floor of a minimum) and long_run_label is what the
-- coach actually typed ("14-16", "16+"), so athletes read it as written.

-- ==================== 1. the two columns ====================
alter table public.athlete_weeks
  add column if not exists long_run_goal numeric(4,1);

alter table public.athlete_weeks
  add column if not exists long_run_label text;

do $$ begin
  alter table public.athlete_weeks
    add constraint athlete_weeks_long_run_goal_check
    check (long_run_goal is null or (long_run_goal > 0 and long_run_goal <= 40));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.athlete_weeks
    add constraint athlete_weeks_long_run_label_check
    check (long_run_label is null or char_length(long_run_label) <= 20);
exception when duplicate_object then null; end $$;
-- 40 matches the per-log cap set in 0003 (logs_distance_sane): a single run
-- longer than that is a typo on either side of the app.

-- ==================== 2. close the goal-editing hole ====================
-- RLS is row-level, not column-level: an athlete can PATCH their own
-- athlete_weeks row, and only the columns named in this guard stop them. It
-- has listed mileage_goal since 0003 — but goal_label was added in 0010 and
-- never added here, so an athlete could rewrite the goal he SEES ("55-60" →
-- "20-25") while the number underneath stayed put. Same bug class as the
-- training_group hole 0011 closed. Fixed here, along with the two new columns.
create or replace function public.guard_athlete_week_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or public.is_coach() then return new; end if;
  if tg_op = 'INSERT' then
    if new.mileage_goal   is not null
       or new.goal_label     is not null
       or new.long_run_goal  is not null
       or new.long_run_label is not null
       or new.coach_comment  is not null
       or new.reviewed_at    is not null then
      raise exception 'Only coaches can set goals or reviews';
    end if;
  else
    if new.mileage_goal   is distinct from old.mileage_goal
       or new.goal_label     is distinct from old.goal_label
       or new.long_run_goal  is distinct from old.long_run_goal
       or new.long_run_label is distinct from old.long_run_label
       or new.coach_comment  is distinct from old.coach_comment
       or new.reviewed_at    is distinct from old.reviewed_at then
      raise exception 'Only coaches can set goals or reviews';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Weeks cannot be removed';
    end if;
  end if;
  return new;
end $$;

-- ==================== 3. import_week v5 ====================
-- SAME 4-arg signature as v4 (0011) — body only. Goals entries may now carry
-- "long_run" and "long_run_label"; a file that doesn't send them behaves
-- exactly as before, so a deployment still running the 0011 code keeps
-- working and simply never sets a long run.
--
-- Two behaviours worth reading before changing anything here:
--
--   (a) Each goal is independent. A blank weekly cell no longer means "skip
--       the whole athlete" — it means "leave HIS WEEKLY number alone", and the
--       same for a blank long-run cell. That is what lets a coach fill only
--       the long-run column mid-week without wiping thirty weekly goals.
--   (b) A label travels with its number. Set the number, set its label (null
--       when it was a plain figure). Never leave a stale "55-60" sitting over
--       a new 58.
--
-- Also restores `deleted_at = null` on the goals upsert. 0003 added it so an
-- imported goal revives a soft-deleted week row instead of landing invisibly;
-- 0010 and 0011 both rewrote this function without it. That is a live bug on
-- prod today, fixed here.
create or replace function public.import_week(
  p_week_start      date,
  p_plans_distance  text[],   -- exactly 7; index 1 = Monday
  p_plans_mid       text[],   -- exactly 7; index 1 = Monday
  p_goals           jsonb     -- [{"email":"a@x","goal":57.5,"label":"55-60",
                              --   "long_run":15,"long_run_label":"14-16",
                              --   "group":"mid"}, ...]
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
  v_goal    numeric;
  v_long    numeric;
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

  -- ---- per-athlete group + goals ----
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

    v_goal := nullif(g->>'goal', '')::numeric;
    v_long := nullif(g->>'long_run', '')::numeric;

    if v_goal is not null or v_long is not null then
      insert into athlete_weeks (
        athlete_id, week_start, mileage_goal, goal_label, long_run_goal, long_run_label
      )
      values (
        v_athlete, p_week_start,
        v_goal, nullif(g->>'label', ''),
        v_long, nullif(g->>'long_run_label', '')
      )
      on conflict (athlete_id, week_start) do update
        set mileage_goal = case when v_goal is not null
                                then excluded.mileage_goal
                                else athlete_weeks.mileage_goal end,
            goal_label   = case when v_goal is not null
                                then excluded.goal_label
                                else athlete_weeks.goal_label end,
            long_run_goal = case when v_long is not null
                                 then excluded.long_run_goal
                                 else athlete_weeks.long_run_goal end,
            long_run_label = case when v_long is not null
                                  then excluded.long_run_label
                                  else athlete_weeks.long_run_label end,
            deleted_at = null;              -- revive, same as plans
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

-- The 3-arg v3 shim from 0011 is unchanged: it delegates to the function above,
-- so it picks up all of this for free and still posts a distance-only week.

-- ==================== verify ====================
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='athlete_weeks'
      and column_name='long_run_goal')                                   as long_run_col,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='athlete_weeks'
      and column_name='long_run_label')                                  as long_run_label_col,
  position('long_run_label' in pg_get_functiondef(
    'public.guard_athlete_week_columns()'::regprocedure)) > 0            as guard_ok,
  position('long_run_label' in pg_get_functiondef(
    'public.import_week(date, text[], text[], jsonb)'::regprocedure)) > 0 as import_v5_ok,
  position('deleted_at = null' in pg_get_functiondef(
    'public.import_week(date, text[], text[], jsonb)'::regprocedure)) > 0 as revive_ok;
-- Expect: 1, 1, true, true, true.
