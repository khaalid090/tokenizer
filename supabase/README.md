# Supabase Setup

Tokenizer uses Supabase **only** for optional account + cloud sync of history
and dashboard stats. The compression pipeline never runs here — it always
executes locally in the browser or the desktop webview.

## 1. Apply the schema

Dashboard → **SQL Editor** → **New query**, paste the whole of
[`schema.sql`](./schema.sql), and click **Run**.

This creates:

| Object | Purpose |
| --- | --- |
| `public.optimizations` | One row per saved optimization, scoped to `user_id` |
| `optimizations_user_created_idx` | Index for the "newest first" history query |
| RLS policies | `select` / `insert` / `delete`, each limited to `auth.uid() = user_id` |
| `public.get_token_stats()` | Aggregate function returning your `SessionStats` shape |

Re-running the script is safe — it drops and recreates its own policies.

## 2. Environment variables

`.env.local` already exists for this checkout. For a fresh clone:

```bash
cp .env.example .env.local
```

Fill in from Dashboard → **Project Settings** → **API**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://ovvxrhzvaytytaelotic.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the "anon public" key>
```

These are **public** keys and are embedded in the browser/desktop bundle. That
is by design and safe: RLS guarantees the anon key can only ever read and write
rows belonging to the signed-in user.

> Never put the `service_role` key in `NEXT_PUBLIC_*`. It bypasses RLS and must
> only exist in a trusted server environment.

## 3. Enable Email sign-in

Dashboard → **Authentication** → **Providers** → **Email**: enable it. Turn
*Confirm email* on for real sign-ups, or off for instant accounts during
development.

## 4. Enable Google sign-in

Dashboard → **Authentication** → **Providers** → **Google**: enable it and
paste in the Client ID / Client Secret Google gives you.

Then add your authorised redirect URLs under
**Authentication → URL Configuration**:

- `http://localhost:3000/auth/callback`
- `https://<your-domain>/auth/callback`
- `http://localhost:1420/auth/callback` — Tauri dev origin
- `tauri://localhost/auth/callback` — packaged desktop app

## 5. Verify

1. `pnpm dev`, then open http://localhost:3000
2. Click **Sign in to sync** → **Create account**
3. Optimise a prompt, then check Dashboard → the badge should read
   **Supabase Synced**
4. In Dashboard → **Table editor**, confirm the row appears under
   `public.optimizations`
5. Try selecting a row as a different user — you should see zero results
   (RLS working)

### Automated end-to-end check

```bash
node scripts/test-supabase-e2e.mjs
```

This runs 10 assertions against your live project: sign-in, insert, RLS
auto-attaching `user_id`, read-back scoping, aggregate maths, and cleanup. The
test row is always deleted.

If you hit `email rate limit exceeded` (Supabase throttles signups per IP),
create the account once in the browser and reuse it instead:

```dotenv
# .env.local
E2E_EMAIL=you@gmail.com
E2E_PASSWORD=your-password
```

Nothing is then created, and only your own rows are touched.

## Data model notes

- **No separate stats table.** Totals are derived by `get_token_stats()`, so
  they can never drift out of sync with the underlying rows.
- **`user_id` is never sent by the client.** The insert policy forces it to
  `auth.uid()`, so a client cannot write into another account even if modified.
- **Deleting your Supabase user** cascades and removes all rows
  (`on delete cascade`).
- **Tokenizer stores no credentials.** There is no API key for any AI provider
  anywhere in this project.
