-- HoosLog — off/cross-train days + run types (coach-requested, 2026-08-16)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- Two additions to `logs`:
--   kind      — what the day was: a run, an off day, or a cross-train day.
--   run_type  — for runs only: workout / long / aerobic (the everyday default).
--
-- Off and cross-train days carry no mileage but still carry a pain flag, a
-- question, and notes (an injured athlete cross-training may still hurt — that
-- must reach the coach same-day, same as any run).

alter table public.logs
  add column if not exists kind text not null default 'run'
    check (kind in ('run', 'off', 'cross')),
  add column if not exists run_type text
    check (run_type in ('workout', 'long', 'aerobic'));

-- Off/cross days log zero miles; run_type belongs to runs only. Enforced at
-- the table so the direct API can't create a "cross-train workout" or an
-- off day that somehow logged 8 miles.
alter table public.logs drop constraint if exists logs_kind_shape;
alter table public.logs add constraint logs_kind_shape check (
  (kind = 'run')
  or (kind in ('off', 'cross') and distance_mi = 0 and run_type is null)
);

-- Existing rows are all real runs; leave run_type null (unspecified) rather
-- than guessing a type for history logged before this existed.
