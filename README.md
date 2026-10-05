# Tokenizer

> **Same meaning. Fewer tokens.**
> An open prompt-token optimization tool that compresses prompts and conversation histories to cut token usage and cost by roughly 20%–35% on typical prompts (more on very verbose ones) without altering code, intent, numerical constants, or safety constraints.
>
> Tokenizer runs **entirely on your machine**. There is no API key field, no account required, and no call to any AI provider — you compress, copy the optimized prompt, and paste it wherever you want.
>
> An optional [Supabase](supabase/README.md) account adds cloud sync of your history and dashboard across devices. It is never required for compression.

---

## Run Modes (one codebase, four commands)

| Mode | Command | What you get |
| --- | --- | --- |
| **Web — dev** | `pnpm dev` | Next.js dev server at [http://localhost:3000](http://localhost:3000) |
| **Web — production** | `pnpm build` → `pnpm start` | Deployable to Vercel or any Node host. History/stats persisted through `/api/history` (SQLite) |
| **Desktop — dev** | `pnpm tauri:dev` | Native window (Tauri) loading the dev server with hot reload |
| **Desktop — build** | `pnpm tauri:build` | Installers under `src-tauri/target/release/bundle/`: `.dmg` / `.app` (macOS), `.exe` / `.msi` (Windows), `.AppImage` / `.deb` (Linux) |

Desktop builds need the [Rust toolchain](https://rustup.rs) plus the platform prerequisites (Xcode command line tools on macOS, WebView2 on Windows, `libwebkit2gtk` on Linux).

### Shared codebase

- **One UI, one pipeline.** `app/`, `components/` and `lib/optimizer/*` are shared by both targets; the compression runs 100% client-side in each.
- **Web mode**: the Node server hosts the app (and, on the legacy path, SQLite history). It never sees compression logic and never talks to an AI provider.
- **Desktop mode**: `pnpm build:desktop` statically exports the same UI to `out/` (route handlers are set aside for that build only, then restored) and Tauri serves it from the native webview.
- **No drift**: the optimizer, tokenizer and diff logic live in `lib/` and are imported unchanged by both builds.

### Where your data lives

| Build | Signed in | Signed out / offline |
| --- | --- | --- |
| Web | Supabase (cloud, per-account) | SQLite via `/api/history`, else localStorage |
| Desktop | Supabase (cloud, per-account) | localStorage |

The compressor never touches any of these stores — it runs in memory, and only
the finished result is written down.

---

## Supabase (optional)

Accounts and cloud sync of history/dashboard stats are powered by Supabase.
Compression never requires an account and never leaves the device.

1. Apply the schema: paste [`supabase/schema.sql`](supabase/schema.sql) into the Supabase **SQL Editor** and run it.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Enable **Email** and **Google** under *Authentication → Providers*, and add your redirect URLs.

Full walkthrough, RLS notes and a verification checklist: **[supabase/README.md](supabase/README.md)**.

> Only the public **anon** key ever reaches the browser or the desktop bundle.
> Every table is protected by Row Level Security, so it can only read the
> signed-in user's own rows. Never use `service_role` in a `NEXT_PUBLIC_*` var.

---

## Architecture Overview

```
[ User / Developer Prompt ]
            +
            v
+-------------------------------------------------------------+
|                 Tokenizer Optimization Agent                |
|                                                             |
|  Stage 1: Protected Span Extraction                         |
|           (```code```, `inline`, URLs, paths, numbers,       |
|            dates, quotes, variables, constraint sentences)   |
|                                                             |
|  Stage 2: Normalize & Clean                                 |
|           (pleasantries, hedging, filler words, whitespace)  |
|                                                             |
|  Stage 3: Deduplicate                                       |
|           (exact match & Jaccard semantic similarity)        |
|                                                             |
|  Stage 4: Restructure                                       |
|           (Task / Context / Constraints / Output format)     |
|                                                             |
|  Stage 5: Output Requirement Trimming                       |
|           (prune generic non-constraint fluff)               |
|                                                             |
|  Stage 6: Protected Span Restoration                        |
|           (unpack protected tokens deterministically)        |
|                                                             |
|  Stage 7: Safety Validation Gate                            |
|           (assert 100% protected spans & constraints kept;   |
|            automatic fallback to safe baseline if violated)  |
+-------------------------------------------------------------+
            +
            v
[ Word-Level Diff & Savings Analytics (< 30ms, fully local) ]
            +
            v
[ "Copy Optimized Prompt" -> paste into any AI tool you use ]

         Persistence (optional, never required for compression)
   web:      /api/history -> SQLite (data/tokentrim.db)
   desktop:  localStorage
```

---

## Features

- **True Tokenizer Counting**: Powered by `js-tiktoken` (standard `cl100k_base` encoding) with real-time cost estimation at your own price per 1M tokens.
- **Zero AI Calls, Zero Keys**: the app never asks for an API key and never sends prompts anywhere. The primary call to action is a prominent **Copy Optimized Prompt** button.
- **7-Stage Protected Preservation Engine**:
  - Code blocks (` ```...``` `) and inline code (` `...` `) are 100% preserved.
  - Numbers, currencies (`$`, `€`), percentages (`%`), dates, and file paths are never modified.
  - Constraints with keywords (`must`, `never`, `always`, `only`, `exactly`, `at least`, `at most`, `do not`) are isolated and kept intact.
- **Safety Validation with Automatic Fallback**: If any protected span or constraint keyword is altered, Tokenizer immediately falls back to a lossless baseline and displays a warning banner.
- **3 Compression Modes**:
  - `Lossless`: Safe whitespace and polite filler removal only.
  - `Balanced` (Default): Structural reorganization, deduplication, and output fluff trimming.
  - `Aggressive`: Maximum token savings with strict imperative phrasing.
- **Interactive Word-Level Diff**: Visualizes removals (red strikethrough) and additions/rewrites (emerald highlight) in real-time.
- **Savings Dashboard**: Cumulative tokens saved, estimated cost savings, compression ratio, and query history (SQLite-backed on web, local on desktop).
- **Web + Desktop from One Codebase**: the same Next.js UI ships as a website and as a native Tauri app with installers for macOS, Windows and Linux.
- **Appearance Themes**: dark glassmorphism (default) or light, switchable in Settings.
- **Celebratory Feedback**: Confetti and sparkle bursts when prompt savings reach or exceed 30%.


---

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Desktop shell**: Tauri 2 (Rust) — serves the statically exported UI
- **Styling**: Tailwind CSS (theme-aware palette) + Glassmorphism + Neon Mesh
- **Animations**: Pure CSS entrance animations + Canvas Confetti
- **Tokenizer**: `js-tiktoken` (cl100k_base)
- **Diff Engine**: `diff`
- **Persistence**: `node:sqlite` via API routes (web) / `localStorage` (desktop)
- **Testing**: `vitest`

---

## Quick Start

### Prerequisites
- Node.js >= 18.18 (22+ recommended — the web history API uses built-in `node:sqlite`)
- pnpm (or npm/yarn)
- Desktop builds only: [Rust toolchain](https://rustup.rs) + platform prerequisites

### 1. Web — development
```bash
pnpm install
pnpm dev            # http://localhost:3000
```

### 2. Web — production build
```bash
pnpm build
pnpm start          # http://localhost:3000, served by the Node server
```
Deploy `pnpm build` behind `pnpm start` on Vercel or any Node host. SQLite data lives in `data/` (add it to `.gitignore` or mount a volume).

### 3. Desktop — development
```bash
pnpm tauri:dev
```
Starts the Next.js dev server and opens the native window pointed at it (hot reload included).

### 4. Desktop — installers
```bash
pnpm tauri:build
```
Builds the static UI (`pnpm build:desktop` → `out/`) and packages it with Tauri:
- macOS: `src-tauri/target/release/bundle/dmg/*.dmg` and `.../macos/Tokenizer.app`
- Windows: `.../bundle/msi/*.msi` and `.../nsis/*.exe`
- Linux: `.../bundle/appimage/*.AppImage` and `.../deb/*.deb`

No server is required at runtime: compression runs in-process and history is stored locally.

### 5. Tests
```bash
pnpm test
```

### Icons
`pnpm icons` regenerates every icon from the printed logo mark — `src-tauri/app-icon.png` (1024px source you can feed to `pnpm exec tauri icon`), the fallback set in `src-tauri/icons/`, plus `public/favicon.ico` and `public/logo.svg`.

### Pointing the "Download" links somewhere real
`lib/platform.ts` holds two constants used by the cross-promo widget: `DESKTOP_RELEASES_URL` (web build → "Download Desktop App") and `WEB_APP_URL` (desktop build → "also available on web"). Update them to your own release page and deployment URL.

---

## Project Structure

```
app/                    Next.js App Router UI + API routes (web-only persistence)
  api/history/          SQLite-backed history + stats endpoint (web build)
  api/optimize/         Optional local compression endpoint for scripts
components/             Workspace, Word Diff, Pipeline visualizer, Dashboard, Settings...
lib/
  optimizer/            7-stage compression pipeline (shared by web + desktop)
  tokens.ts             Tokenizer + cost estimation
  persistence.ts        Server-first history layer with local fallback
  settings.ts           Settings (default mode, price per 1M tokens, theme)
  platform.ts           Tauri runtime detection + download/web URLs
scripts/
  next-build-tauri.mjs  Static export build for the desktop bundle
  generate-icons.mjs    Pure-Node icon generator (PNG / ICO / ICNS / SVG)
src-tauri/              Tauri 2 desktop shell (Rust + config + icons)
__tests__/              Vitest suite for the optimizer pipeline
```

### Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Web app — dev server |
| `pnpm build` | Web app — production build |
| `pnpm start` | Serve the production web build |
| `pnpm test` | Run the vitest suite |
| `pnpm tauri:dev` | Desktop app in dev (native window + hot reload) |
| `pnpm tauri:build` | Desktop app installers for the current OS |
| `pnpm build:desktop` | Static export only (`out/`) — used by `tauri:build` |
| `pnpm icons` | Regenerate all app icons from the logo mark |


---

## Benchmark Demos (Before vs After)

### Benchmark 1: Verbose Python Code Review
- **Original Tokens**: 206 tokens
- **Optimized Tokens**: 150 tokens
- **Tokens Saved**: 56 tokens (**27.2% saved** in Balanced, **30.1%** in Aggressive)
- **Protected Items Preserved**: 4 (Python code block, constraints, negative instructions)

#### Before:
````text
Hello there! I hope you are having a wonderful day today. Could you please kindly take a look at my code snippet below and give me some detailed feedback? I am really hoping to make sure that it runs efficiently and doesn't run into performance bottlenecks. As a matter of fact, it would be wonderful if you could also check for security flaws.

Here is the exact code block that I want you to inspect:
```python
def process_user_data(users):
    results = []
    for user in users:
        if user.get("status") == "active":
            results.append({"id": user["id"], "score": user["points"] * 1.5})
    return results
```

You must never expose the raw user object in the returned results.
The function must return at least 1 record if active users exist.
Do not import any third-party external libraries like pandas or numpy.
Please explain in great detail and provide a very thorough analysis with comprehensive explanations. Thanks so much for your help!
````

#### After:
````text
take a look at my code snippet below Be concise. Constraints:
- make sure that it runs efficiently and doesn't run into performance bottlenecks.
- check for security flaws.
- Here is the exact code block that inspect:
```python
def process_user_data(users):
    results = []
    for user in users:
        if user.get("status") == "active":
            results.append({"id": user["id"], "score": user["points"] * 1.5})
    return results
```
You must never expose the raw user object in the returned results.
The function must return at least 1 record if active users exist.
Do not import any third-party external libraries like pandas or numpy.
Analyze performance and security.
````


---

### Benchmark 2: Enterprise Architecture Query
- **Original Tokens**: 185 tokens
- **Optimized Tokens**: 130 tokens
- **Tokens Saved**: 55 tokens (**29.7% saved** in Balanced, **32.4%** in Aggressive)
- **Protected Items Preserved**: 7 (date `2026-11-15`, number `50,000`, `120ms`, file path `/etc/cloud/prod.conf`, constraint keywords)

#### Before:
````text
Good morning! I was wondering if you could possibly help me design a cloud infrastructure on AWS for our new product launch on 2026-11-15. In my humble opinion, scalability is super crucial.

Basically, what we need is an architecture diagram and configuration description. We need an API gateway that routes traffic to Lambda functions, and we need an RDS PostgreSQL cluster for storing transaction records.
We need an API gateway that routes traffic to Lambda functions, and we need an RDS PostgreSQL cluster for storing transaction records.

The system must handle at least 50,000 requests per second.
The API response latency must always remain under 120ms.
You must never use unencrypted S3 buckets.
Only use Terraform for infrastructure as code.
Config path must be `/etc/cloud/prod.conf`.

Could you kindly walk me through the entire thought process step by step and give an exhaustive summary? Thank you kindly!
````

#### After:
````text
help me design a cloud infrastructure on AWS for our new product launch on 2026-11-15. scalability is super crucial. what we need is an architecture diagram and configuration description. We need an API gateway that routes traffic to Lambda functions, and we need an RDS PostgreSQL cluster for storing transaction records. Constraints:
- The system must handle at least 50,000 requests per second.
- The API response latency must always remain under 120ms.
- You must never use unencrypted S3 buckets.
- Only use Terraform for infrastructure as code.
- Config path must be `/etc/cloud/prod.conf`.
Summarize the architecture.
````

---

### Benchmark 3: SQL Data Pipeline Analysis
- **Original Tokens**: 145 tokens
- **Optimized Tokens**: 113 tokens (Aggressive)
- **Tokens Saved**: 32 tokens (**22.1% saved**)
- **Protected Items Preserved**: 10 (table name, column names in inline code, date `2026-01-01`, constraint directives)

---

## Security & Privacy

1. **No API keys, anywhere.** There is no key field in the UI, no key in storage, and no code path that accepts one. Historic `apiKey` entries from older versions are stripped by `sanitizeSettings()` on load.
2. **No outbound AI-provider calls.** Every provider adapter was removed together with the old "Chat & Forward" tab. Verify with:
   ```bash
   grep -rn "api.openai.com\|api.anthropic.com\|api.moonshot" app components lib || echo "clean"
   ```
3. **Local-first processing.** Prompt compression, tokenization and diffing happen on your machine (browser or desktop webview). The only network calls the app can make are same-origin `/api/*` requests in the web build.
4. **Offline-capable desktop.** The desktop build needs no server at all: history is stored locally and the compressor keeps working with the network unplugged.
5. **Lossless Fallback Guarantee.** If any protected span is compromised during compression, the system falls back to a 100% safe baseline.

---

## License

MIT License. Free for personal and commercial token optimization.

