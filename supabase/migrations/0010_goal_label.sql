-- HoosLog — show goals AS WRITTEN ("55-60", "60+"), not just the tracked
-- number (William's request, 2026-08-24). Apply: SQL Editor → paste → Run.
-- Safe to re-run.
--
-- mileage_goal stays numeric — it drives the progress-bar math (midpoint of a
-- range, floor of a minimum). goal_label carries the coach's original text so
-- every display can say "55-60" while the bar quietly tracks 57.5. Null label
-- = a plain number; displays fall back to the numeric.

alter table public.athlete_weeks
  add column if not exists goal_label text
    check (goal_label is null or char_length(goal_label) <= 20);

-- import_week v3: goals entries may carry "label". Same signature; body
-- replaced. Still one transaction, still security invoker (RLS applies as
-- the calling coach).
create or replace function public.import_week(
  p_week_start date,
  p_plans text[],   -- exactly 7; index 1 = Monday
  p_goals jsonb     -- [{"email":"a@x","goal":57.5,"label":"55-60"}, ...]
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
       and deleted_at is null;

    if v_athlete is null then
      v_unknown := v_unknown || (g->>'email');
      continue;
    end if;

    insert into athlete_weeks (athlete_id, week_start, mileage_goal, goal_label)
    values (v_athlete, p_week_start, (g->>'goal')::numeric, nullif(g->>'label', ''))
    on conflict (athlete_id, week_start) do update
      set mileage_goal = excluded.mileage_goal,
          goal_label = excluded.goal_label;
    v_set := v_set + 1;
  end loop;

  if array_length(v_unknown, 1) > 0 then
    raise exception 'No athlete account for: %', array_to_string(v_unknown, ', ');
  end if;

  return query select v_set, v_unknown;
end $$;

revoke all on function public.import_week(date, text[], jsonb) from public;
grant execute on function public.import_week(date, text[], jsonb) to authenticated;

-- Verify: column exists; function mentions goal_label.
select
  exists(select 1 from information_schema.columns
          where table_name = 'athlete_weeks' and column_name = 'goal_label') as column_ok,
  position('goal_label' in pg_get_functiondef('public.import_week(date, text[], jsonb)'::regprocedure)) > 0 as fn_ok;
