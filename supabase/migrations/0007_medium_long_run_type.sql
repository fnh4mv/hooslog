-- HoosLog — add the "medium long" run type (coach request, 2026-08-20)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- Run types become: workout / long / medium / aerobic (shown as "Training
-- run"). Stored value is 'medium'; the UI says "Medium long". 0004 created
-- run_type with an inline CHECK whose auto-generated name is
-- logs_run_type_check — drop it by that name and re-add with the new value.
-- logs_kind_shape (off/cross ⇒ no run_type) is untouched.

alter table public.logs drop constraint if exists logs_run_type_check;
alter table public.logs add constraint logs_run_type_check
  check (run_type in ('workout', 'long', 'medium', 'aerobic'));

-- Verify: the definition below should list all four values.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.logs'::regclass
   and conname = 'logs_run_type_check';
