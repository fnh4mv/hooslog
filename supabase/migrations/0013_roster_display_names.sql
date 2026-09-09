-- HoosLog — every athlete on the coach portal reads "F. Lastname" (coach
-- request via William, 2026-09-09). Apply: SQL Editor → paste → Run. Re-runnable.
--
-- The formatter was never the problem. src/lib/names.ts has produced
-- "initial + last token" since 2026-08-21 and still does. The problem is that
-- five athletes typed a single word into the name box at signup, and one word
-- has no last name to take:
--
--     Trent  ·  Cayden  ·  Jon  ·  Ben        -> render as themselves
--     alex valencia                            -> renders "a. valencia"
--
-- athlete_emails.name already holds the roster's full name for all thirty
-- guys, so the surname was sitting one table over the whole time. This
-- backfills from it AND stops it happening again: three rostered athletes
-- (Ford, Moreno, Edson) still have not signed up, and every one of them gets
-- the same name box.
--
-- Capitalisation is deliberately NOT fixed here. "alex valencia" is a display
-- concern, handled in names.ts, because rewriting what a guy typed about his
-- own name is worse than rendering it properly.

-- ==================== 1. the rule, in one place ====================
-- Two or more words = the athlete's own preference, kept as typed. Palmer
-- signed up "Samson Palmer" while the roster says "Sam John Palmer"; he goes
-- by Samson and the coach reads "S. Palmer" either way, so there is no reason
-- to overrule him. Fewer than two words is not a preference, it is an
-- incomplete form, and the roster fills it in.
create or replace function public.resolve_display_name(p_email text, p_typed text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when array_length(
           regexp_split_to_array(btrim(coalesce(p_typed, '')), '\s+'), 1
         ) >= 2
      then btrim(p_typed)
    else coalesce(
      nullif(btrim((select name from athlete_emails
                     where email = lower(p_email))), ''),
      btrim(coalesce(p_typed, ''))
    )
  end
$$;

-- ==================== 2. enforce it on the way in ====================
-- A BEFORE trigger rather than a fix inside handle_new_user, because signup is
-- not the only door: athletes may edit their own display name (that is the one
-- column guard_profile_columns lets them touch), so "Ben" can come back an
-- hour after this migration runs. One rule, applied wherever the row is
-- written. Coaches are left alone — their names are typed by adults who are
-- not on athlete_emails, and shortName is an athlete-grid format.
create or replace function public.normalize_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'athlete' then
    new.name := public.resolve_display_name(new.email, new.name);
  end if;
  return new;
end $$;

drop trigger if exists normalize_profile_name on public.profiles;
create trigger normalize_profile_name
  before insert or update on public.profiles
  for each row execute function public.normalize_profile_name();

-- ==================== 3. backfill the five who are already in ====================
-- Written as a no-op-safe update: the WHERE clause means re-running this
-- migration touches zero rows and churns nobody's updated_at.
update public.profiles p
   set name = public.resolve_display_name(p.email, p.name)
 where p.role = 'athlete'
   and p.deleted_at is null
   and public.resolve_display_name(p.email, p.name) is distinct from p.name;

-- ==================== verify ====================
-- Expect one_word_names = 0, and the five rows below to show full names.
select
  (select count(*) from profiles
    where role = 'athlete' and deleted_at is null
      and array_length(regexp_split_to_array(btrim(name), '\s+'), 1) < 2
  ) as one_word_names,
  (select count(*) from pg_trigger
    where tgname = 'normalize_profile_name') as trigger_installed;

select email, name from public.profiles
 where email in ('gyu5nm@virginia.edu','kma8am@virginia.edu','mea6wq@virginia.edu',
                 'qnp3nj@virginia.edu','nrk7dj@virginia.edu')
 order by email;
