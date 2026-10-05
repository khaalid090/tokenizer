-- ============================================================================
-- TokenTrim - Supabase schema
--
-- Apply this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query),
-- or with `supabase db push` if you use the Supabase CLI.
--
-- Design notes
--   * The compression pipeline NEVER runs here. This database only stores the
--     results a user chose to sync. No prompt leaves the device unless the user
--     is signed in and explicitly saves to their account.
--   * There is no separate `stats` table: totals are derived with a SQL
--     aggregate, so they can never drift out of sync with the rows.
--   * Row Level Security is enabled and every policy is scoped to
--     `auth.uid() = user_id`, so a user can only ever read/write their own rows.
-- ============================================================================

create table if not exists public.optimizations (
  id                    bigint generated always as identity primary key,
  -- DEFAULT auth.uid() is essential: the client never sends user_id, so the
  -- database must fill it in from the caller's JWT. Without this default an
  -- insert from the app fails with a not-null violation. RLS only *validates*
  -- the value, it does not populate it.
  user_id               uuid        not null default auth.uid()
                                  references auth.users (id) on delete cascade,
  original_prompt       text        not null,
  optimized_prompt      text        not null,
  mode                  text        not null default 'balanced'
                                  check (mode in ('lossless', 'balanced', 'aggressive')),
  original_tokens       integer     not null default 0,
  optimized_tokens      integer     not null default 0,
  tokens_saved          integer     not null default 0,
  percent_saved         real        not null default 0,
  cost_saved_usd        real        not null default 0,
  protected_spans_count integer     not null default 0,
  validation_passed     boolean     not null default true,
  warning               text,
  stages                jsonb       not null default '[]'::jsonb,
  optimize_ms           integer,
  created_at            timestamptz not null default now()
);

-- History list: newest first for the current user.
create index if not exists optimizations_user_created_idx
  on public.optimizations (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.optimizations enable row level security;

-- Drop first so this script is safe to re-run.
drop policy if exists "own rows: select" on public.optimizations;
drop policy if exists "own rows: insert" on public.optimizations;
drop policy if exists "own rows: delete" on public.optimizations;

create policy "own rows: select"
  on public.optimizations for select
  using (auth.uid() = user_id);

create policy "own rows: insert"
  on public.optimizations for insert
  with check (auth.uid() = user_id);

create policy "own rows: delete"
  on public.optimizations for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Aggregate stats
--
-- Returns the same shape as the app's `SessionStats` type. `coalesce` keeps
-- every numeric field at 0 for a brand-new account instead of returning null.
-- ---------------------------------------------------------------------------
create or replace function public.get_token_stats()
returns table (
  total_tokens_saved         bigint,
  total_cost_saved_usd       real,
  total_tokens_original      bigint,
  total_tokens_optimized     bigint,
  average_compression_ratio  real,
  optimizations_count        bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(tokens_saved), 0)::bigint                       as total_tokens_saved,
    coalesce(sum(cost_saved_usd), 0)::real                       as total_cost_saved_usd,
    coalesce(sum(original_tokens), 0)::bigint                    as total_tokens_original,
    coalesce(sum(optimized_tokens), 0)::bigint                  as total_tokens_optimized,
    case
      when coalesce(sum(original_tokens), 0) = 0 then 0
      else round(
        (sum(tokens_saved)::numeric / sum(original_tokens) * 100)::numeric, 1
      )::real
    end                                                           as average_compression_ratio,
    count(*)::bigint                                             as optimizations_count
  from public.optimizations
  where user_id = auth.uid();
$$;

grant execute on function public.get_token_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Upgrade an existing table
--
-- `create table if not exists` above is a no-op once the table exists, so an
-- already-deployed table would keep its original (default-less) user_id and
-- every save from the app would fail with a not-null violation. This brings an
-- existing table up to date. Safe to re-run.
-- ---------------------------------------------------------------------------
alter table public.optimizations
  alter column user_id set default auth.uid();

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
comment on table public.optimizations is
  'TokenTrim optimization history. Compressed locally; synced here only when a user saves it.';
comment on column public.optimizations.stages is
  'Per-stage pipeline visualizer data (token counts before/after each stage).';
