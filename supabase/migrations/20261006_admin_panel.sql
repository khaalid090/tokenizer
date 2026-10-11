-- ============================================================================
-- TokenTrim Admin Panel migration
--
-- Apply this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement below uses DROP ... IF EXISTS / CREATE TABLE
-- IF NOT EXISTS patterns, or is idempotent.
--
-- What this adds:
--   * profiles table (is_admin, banned) keyed to auth.users, created by a trigger
--     on every new signup.
--   * Row Level Security so a user can READ their own is_admin flag but can
--     NEVER write it from the client. Server-side admin actions use the
--     service_role key (NEXT_PUBLIC_ never touches the browser).
--   * benchmark_prompts table for the homepage rotating example chips.
--   * platform_settings singleton (default mode, price, maintenance flag).
--   * admin_audit_log table for every sensitive admin action.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid        not null primary key references auth.users (id) on delete cascade,
  email       text,
  is_admin    boolean     not null default false,
  banned      boolean     not null default false,
  store_previews boolean   not null default false,
  total_optimizations bigint not null default 0,
  total_tokens_saved  bigint not null default 0,
  total_cost_saved_usd real not null default 0,
  last_active_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Backfill email + is_admin for users that predate this table.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Trigger: create a profile row automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Keep updated_at fresh.
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();
-- ---------------------------------------------------------------------------
-- 2. Row Level Security on profiles
--    A user can read their own row. There is NO insert/update policy from the
--    client, so is_admin / banned / store_previews can only be changed by the
--    service_role key (server routes) or directly in the dashboard.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

-- Service-role bypasses RLS entirely, so the policies above are the ONLY
-- client-side gate. No "profiles: write own" policy exists on purpose.
-- ---------------------------------------------------------------------------
-- 3. benchmark_prompts
--    The homepage "Benchmark Prompts" chips. Admins can add/edit/reorder/deactivate.
--    The homepage reads only is_active = true rows ordered by sort_order.
-- ---------------------------------------------------------------------------
create table if not exists public.benchmark_prompts (
  id               uuid        not null default gen_random_uuid() primary key,
  label            text        not null,
  sample_prompt    text        not null,
  savings_range_label text     not null,
  sort_order       integer     not null default 0,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists benchmark_prompts_active_sort_idx
  on public.benchmark_prompts (is_active, sort_order);

alter table public.benchmark_prompts enable row level security;

-- Public read: anyone (signed in or not) can read active benchmark prompts.
drop policy if exists "benchmark_prompts: public read" on public.benchmark_prompts;
create policy "benchmark_prompts: public read"
  on public.benchmark_prompts for select
  using (is_active = true);

-- Admin-only write (enforced server-side via service_role; the anon client
-- cannot insert/update/delete because there is no policy granting it).
drop policy if exists "benchmark_prompts: admin full" on public.benchmark_prompts;
create policy "benchmark_prompts: admin full"
  on public.benchmark_prompts for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

create or replace function public.set_benchmark_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists benchmark_prompts_set_updated_at on public.benchmark_prompts;
create trigger benchmark_prompts_set_updated_at
  before update on public.benchmark_prompts
  for each row
  execute function public.set_benchmark_updated_at();
-- ---------------------------------------------------------------------------
-- 4. platform_settings (singleton, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id                       integer     not null primary key check (id = 1),
  default_compression_mode text        not null default 'balanced'
                            check (default_compression_mode in ('lossless','balanced','aggressive','lossy')),
  default_price_per_1m     real        not null default 2.5,
  maintenance_mode         boolean     not null default false,
  maintenance_message      text,
  updated_at               timestamptz not null default now(),
  updated_by               uuid
);

-- Seed the singleton row so reads never come back empty.
insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Public read (so the homepage can show a maintenance banner).
drop policy if exists "platform_settings: public read" on public.platform_settings;
create policy "platform_settings: public read"
  on public.platform_settings for select
  using (true);

-- Admin write only.
drop policy if exists "platform_settings: admin write" on public.platform_settings;
create policy "platform_settings: admin write"
  on public.platform_settings for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

create or replace function public.set_platform_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row
  execute function public.set_platform_updated_at();
-- ---------------------------------------------------------------------------
-- 5. admin_audit_log
--    Every sensitive admin action writes a row here from the server route that
--    performs it. Read-only in the UI, paginated, newest first.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id            bigint      generated always as identity primary key,
  admin_user_id uuid        not null references auth.users (id) on delete cascade,
  action        text        not null,
  target_user_id uuid,
  details       jsonb       not null default ''{}''::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

-- No client policy: only the service_role key can read/write here.
-- (RLS is enabled, and with zero policies the anon/authenticated roles
--  cannot touch the table at all.)

-- ---------------------------------------------------------------------------
-- 6. Server-side helpers (called via service_role, bypassing RLS)
-- ---------------------------------------------------------------------------

-- Returns the number of rows in public.profiles where is_admin = true.
-- Used by admin routes to refuse the "delete the last admin" case.
create or replace function public.count_admins()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.profiles where is_admin = true;
$$;

-- True when the caller (by id) is banned. Used by server routes to reject
-- the session before it can do anything.
create or replace function public.is_banned(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(banned, false) from public.profiles where id = user_id;
$$;
