-- HoosLog — atomic week import (Phase 4, docs/12)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- Why a function instead of two upserts from the app: the importer must be
-- all-or-nothing (docs/12 Phase 4 acceptance). PostgREST sends one statement
-- per call, so an app-side "plans then goals" import can leave the plan
-- written and the goals missing. A function body is one transaction — any
-- raise below rolls the whole import back.
--
-- security invoker (the default, stated for the record): RLS still applies as
-- the calling coach, so this grants no authority the coach doesn't already
-- have. The is_coach() gate is a clearer error, not the security boundary.

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

  -- ---- the week's plan, one row per day (0 = Monday) ----
  for i in 1..7 loop
    insert into week_plans (week_start, day, plan_text)
    values (p_week_start, i - 1, coalesce(p_plans[i], ''))
    on conflict (week_start, day) do update
      set plan_text = excluded.plan_text,
          deleted_at = null;
  end loop;

  -- ---- per-athlete mileage goals ----
  -- An unmatched email aborts the whole import: a goal silently dropped is a
  -- runner who never sees a target (docs/12 Phase 4 — "never silent drops").
  for g in select * from jsonb_array_elements(p_goals) loop
    select id into v_athlete
      from profiles
     where email = lower(g->>'email')
       and role = 'athlete'
       and deleted_at is null;

    if v_athlete is null then
      v_unknown := v_unknown || (g->>'email');
      continue;
    end if;

    insert into athlete_weeks (athlete_id, week_start, mileage_goal)
    values (v_athlete, p_week_start, (g->>'goal')::numeric)
    on conflict (athlete_id, week_start) do update
      set mileage_goal = excluded.mileage_goal;
    v_set := v_set + 1;
  end loop;

  if array_length(v_unknown, 1) > 0 then
    raise exception 'No athlete account for: %', array_to_string(v_unknown, ', ');
  end if;

  return query select v_set, v_unknown;
end $$;

revoke all on function public.import_week(date, text[], jsonb) from public;
grant execute on function public.import_week(date, text[], jsonb) to authenticated;
