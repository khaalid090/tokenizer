-- ============================================================================
-- MAKE ME ADMIN — Run this in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/ovvxrhzvaytytaelotic/sql/new
-- ============================================================================

-- 1. Ensure profiles table exists (from migration)
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

-- 2. Enable RLS
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

-- 3. Make sure your user has a profile row
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 4. BACKFILL: Set is_admin = true for ALL existing users (first user becomes admin)
--    Change the email below to YOUR email if you want only yourself to be admin:
update public.profiles
set is_admin = true
where email = 'khalidandsacad@gmail.com';

-- OR: make the FIRST user admin (whichever matches):
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users order by created_at asc limit 1);

-- 5. Verify
select id, email, is_admin, banned from public.profiles order by created_at;
