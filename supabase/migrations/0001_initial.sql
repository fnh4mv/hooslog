-- HoosLog — initial schema
-- Apply in Supabase: SQL Editor → paste → Run (or `supabase db push`).
-- Design source: docs/02 §1 + §8, CLAUDE.md locked decisions 10–22.
-- Conventions: RLS on everything, soft deletes (deleted_at), DATE not timestamp
-- for training days, week_start = Monday.

-- ============================================================ staff allowlist
-- Emails allowed to hold the coach role. Managed via SQL/service role only —
-- this is what makes coach access outlive any one person.
create table public.staff_emails (
  email text primary key check (email = lower(email)),
  note text,
  added_at timestamptz not null default now()
);

-- ============================================================ profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null unique check (email = lower(email)),
  role text not null default 'athlete' check (role in ('athlete','coach')),
  status text not null default 'active' check (status in ('active','injured','inactive','alum')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Signup gate + role assignment. UVA emails become athletes; allowlisted
-- emails become coaches; everyone else is rejected at the door.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  em text := lower(new.email);
  is_staff boolean;
begin
  select exists(select 1 from staff_emails where email = em) into is_staff;
  if not is_staff and em not like '%@virginia.edu' then
    raise exception 'Signup restricted to UVA email addresses';
  end if;
  insert into public.profiles (id, email, name, role)
  values (
    new.id, em,
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when is_staff then 'coach' else 'athlete' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helper for RLS policies (security definer avoids recursive RLS).
create or replace function public.is_coach()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from profiles
    where id = auth.uid() and role = 'coach' and deleted_at is null
  );
$$;

-- ============================================================ athlete_weeks
-- One row per (athlete, week): the digital sheet. mileage_goal comes from the
-- coach's Monday plan (per athlete). athlete_summary = the SUMMARY box.
create table public.athlete_weeks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id),
  week_start date not null,
  mileage_goal numeric(5,1),
  athlete_summary text,
  coach_comment text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint week_start_is_monday check (extract(isodow from week_start) = 1),
  unique (athlete_id, week_start)
);

-- ============================================================ week_plans
-- The coach's plan: one row per (week, day). Group-uniform for the trial
-- (per-athlete overrides are a later migration if Dunbar varies plans).
create table public.week_plans (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day smallint not null check (day between 0 and 6), -- 0 = Monday
  plan_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint plan_week_is_monday check (extract(isodow from week_start) = 1),
  unique (week_start, day)
);

-- ============================================================ logs
-- One logged run. Doubles = two rows (AM/PM). Distance required, pace optional
-- (locked 11 + sheet reality). Splits/HR/elevation live in notes (locked 19).
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id),
  log_date date not null,
  slot text not null default 'AM' check (slot in ('AM','PM')),
  distance_mi numeric(4,1) not null check (distance_mi >= 0),
  pace text,                                   -- e.g. '6:47' per mile, as typed
  rpe smallint check (rpe between 1 and 10),
  pain_flag boolean not null default false,    -- the killer feature
  pain_note text,
  question text,
  notes text,
  created_at timestamptz not null default now(),  -- entry timestamps also answer "who backfills"
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index logs_one_per_slot
  on public.logs (athlete_id, log_date, slot) where deleted_at is null;
create index logs_by_date on public.logs (log_date) where deleted_at is null;

-- ============================================================ day_reviews
-- Dunbar's red pen: per-day check + optional comment (locked 16). No scores.
create table public.day_reviews (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id),
  log_date date not null,
  checked boolean not null default true,
  comment text,
  coach_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (athlete_id, log_date)
);

-- ============================================================ updated_at upkeep
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['profiles','athlete_weeks','week_plans','logs','day_reviews'] loop
    execute format('create trigger touch_%I before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================ RLS
alter table public.staff_emails  enable row level security;
alter table public.profiles      enable row level security;
alter table public.athlete_weeks enable row level security;
alter table public.week_plans    enable row level security;
alter table public.logs          enable row level security;
alter table public.day_reviews   enable row level security;

-- staff_emails: coaches can read; writes only via service role (no policy).
create policy staff_read on public.staff_emails for select using (public.is_coach());

-- profiles: own row always; coaches see the roster. Own-name updates only.
create policy profiles_own_read  on public.profiles for select using (id = auth.uid());
create policy profiles_coach_read on public.profiles for select using (public.is_coach());
create policy profiles_own_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = 'athlete');
create policy profiles_coach_update on public.profiles for update
  using (public.is_coach()) with check (true);

-- athlete_weeks: athlete owns theirs (goal set by coach; summary by athlete —
-- column-level split enforced in app, row-level here). Coaches: everything.
create policy aw_own    on public.athlete_weeks for all
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy aw_coach  on public.athlete_weeks for all
  using (public.is_coach()) with check (public.is_coach());

-- week_plans: every signed-in user reads; only coaches write.
create policy plans_read  on public.week_plans for select using (auth.uid() is not null);
create policy plans_write on public.week_plans for insert with check (public.is_coach());
create policy plans_update on public.week_plans for update
  using (public.is_coach()) with check (public.is_coach());

-- logs: athletes own their rows entirely; coaches read all (same-day pain
-- flag visibility is exactly this select policy).
create policy logs_own   on public.logs for all
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy logs_coach_read on public.logs for select using (public.is_coach());

-- day_reviews: coaches write; athletes read their own (feedback feed).
create policy reviews_own_read on public.day_reviews for select using (athlete_id = auth.uid());
create policy reviews_coach   on public.day_reviews for all
  using (public.is_coach()) with check (public.is_coach());
