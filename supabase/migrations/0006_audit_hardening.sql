-- HoosLog — audit hardening (2026-08-17 audit, findings 11-14)
-- Apply in Supabase: SQL Editor → paste → Run. Safe to re-run.
--
-- Four confirmed issues from the audit, all lower-severity than the coach
-- impersonation hole but all real:
--   1. Removing someone from staff_emails did NOT revoke their coach access.
--   2. Any coach could rewrite any profile's role — mint coaches, demote the
--      head coach, or soft-delete him.
--   3. Athletes could hard-DELETE a log the coach had already read (including
--      a pain flag), and could forge created_at.
--   4. Athletes could soft-delete their own athlete_weeks row, after which the
--      coach's week comment saved "successfully" into a row nobody can see.

-- ============================================================ 1. revocation
-- is_coach() read profiles.role and nothing else, so deleting the staff_emails
-- row left the account fully privileged — exactly the documented go-live step
-- for removing the test coach. Now coach access requires BOTH the role and
-- current membership in staff_emails, so removing the row revokes immediately.
create or replace function public.is_coach()
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists(
    select 1
      from profiles p
      join staff_emails s on s.email = p.email
     where p.id = auth.uid()
       and p.role = 'coach'
       and p.deleted_at is null
  );
$$;

-- ============================================================ 2. role is admin-only
-- Coaches keep full read/write on athlete data, but role/email/status/soft-delete
-- on ANY profile now require the service role (auth.uid() is null). A coach
-- cannot promote a friend or demote the head coach from the app.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / SQL editor

  if new.role is distinct from old.role then
    raise exception 'Roles are managed by the team admin, not in the app';
  end if;

  -- Coaches may correct an athlete's status (e.g. mark injured) and name.
  if public.is_coach() then
    if new.email is distinct from old.email
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Email and account removal are managed by the team admin';
    end if;
    return new;
  end if;

  -- Athletes: display name only.
  if new.email      is distinct from old.email
     or new.status     is distinct from old.status
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Athletes can only change their display name';
  end if;
  return new;
end $$;

-- ============================================================ 3. logs: no hard delete, no forged timestamps
-- logs_own was FOR ALL, which included DELETE. The app only ever soft-deletes
-- (deleteLog sets deleted_at), so removing DELETE costs nothing and stops an
-- athlete erasing a pain flag the coach already acted on.
drop policy if exists logs_own on public.logs;
create policy logs_own_select on public.logs for select
  using (athlete_id = auth.uid());
create policy logs_own_insert on public.logs for insert
  with check (athlete_id = auth.uid());
create policy logs_own_update on public.logs for update
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
-- (no delete policy → hard DELETE denied for athletes; coaches never had one)

-- created_at is evidence of when a run was actually entered ("who backfills",
-- per the 0001 comment). Pin it so it can't be forged from the API.
create or replace function public.pin_log_created_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_at := now();
    else new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pin_log_created_at on public.logs;
create trigger pin_log_created_at
  before insert or update on public.logs
  for each row execute function public.pin_log_created_at();

-- ============================================================ 4. athlete_weeks soft-delete
-- An athlete soft-deleting their week row made the coach's comment write into
-- a row no query returns — a silent black hole for feedback.
create or replace function public.guard_athlete_week_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Weeks cannot be removed';
    end if;
  end if;
  return new;
end $$;

-- ============================================================ search_path hygiene
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end $$;

-- ============================================================ verify
select 'is_coach requires staff_emails' as check,
       (select count(*)::text from pg_proc
         where proname = 'is_coach' and prosrc like '%staff_emails%') as result
union all
select 'logs has no athlete DELETE policy',
       (select count(*)::text from pg_policies where tablename = 'logs' and cmd = 'DELETE')
union all
select 'created_at pin trigger',
       (select count(*)::text from pg_trigger where tgname = 'pin_log_created_at')
union all
select 'coach accounts (should be only real coaches)',
       (select coalesce(string_agg(p.email, ', '), '(none)') from profiles p where p.role = 'coach');
-- Expect: 1, 0, 1, and only intended coach emails.
