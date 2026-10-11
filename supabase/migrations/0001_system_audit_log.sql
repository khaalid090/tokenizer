-- ============================================================================
-- TokenTrim - system_audit_log migration
--
-- Apply this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query),
-- or with `supabase db push` if you use the Supabase CLI.
--
-- What this adds:
--   * system_audit_log table - records every operation on the system-side
--     history API (/api/history): reads (history_read), saves
--     (history_save) and clears (history_delete).
--
-- Security:
--   * The table is created with Row Level Security enabled but ZERO read/write
--     policies. This means the anon and authenticated roles CANNOT read or
--     modify it at all - only code holding the service_role key (the server
--     routes) can write to it.
--   * The table is never written from the browser, so the log itself cannot
--     be tampered with or viewed by normal users.
--
-- Viewing the log:
--   * Admin panel (service_role): the admin API routes can query this table
--     to see system-wide activity across all users.
--   * RLS: read-only in the admin panel, never exposed to normal users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. system_audit_log table
-- ---------------------------------------------------------------------------
create table if not exists public.system_audit_log (
  id            bigint generated always as identity primary key,
  user_id       uuid references auth.users (id) on delete cascade,
  action        text        not null,   -- 'history_read' | 'history_save' | 'history_delete'
  status        text        not null,   -- 'ok' | 'error'
  details       jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Newest-first index for the admin panel list view.
create index if not exists system_audit_log_user_created_idx
  on public.system_audit_log (user_id, created_at desc);

-- RLS enabled with no policies -> service_role only.
alter table public.system_audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Housekeeping
-- ---------------------------------------------------------------------------
comment on table public.system_audit_log is
  'System-side API audit log. One row per /api/history call; service_role-only, unmodifiable by clients.';
comment on column public.system_audit_log.details is
  'Context JSON: { limit, count, error } depending on the action.';
