# Deployment Guide: Neon + Vercel

## Architecture

- **Database:** Neon Postgres (plain Postgres — Neon Auth is intentionally NOT used;
  the app has its own auth via Better Auth with `user`/`session`/`account` tables)
- **Hosting:** Vercel (SvelteKit via `@sveltejs/adapter-auto`, which resolves to the
  Vercel adapter automatically)
- **ORM/Migrations:** Drizzle

## Environment Files (local machine)

| File | Purpose | Committed? |
|---|---|---|
| `.env` | Local development (localhost Postgres) | No (gitignored) |
| `.env.production` | Neon credentials — used only for running migrations/one-off tasks against production from your machine | No (gitignored) |
| `.env.example` | Documentation template | Yes |

> **Vercel never reads these files.** Production values live in the Vercel dashboard.

## Running the compiled app locally

> ⚠️ **Plain `npm run build` targets PRODUCTION.** `vite build` runs in `production` mode, so
> Vite loads `.env.production` on top of `.env` and bakes its values (Neon `DATABASE_URL`,
> `BETTER_AUTH_URL=https://expositor.app`) into the build via `$env/static/private`. Previewing
> that build locally reads and writes the **production database**, your local dev users can't
> sign in, and the `https://` auth URL makes better-auth issue a `Secure` cookie that
> `http://localhost` drops — so sign-in appears to succeed and then fails.

To build and run against your **local** database:

```sh
npm run build:local     # vite build --mode development, BETTER_AUTH_URL=http://localhost:4173
npm run preview:local   # vite preview --mode development → http://localhost:4173
```

- `--mode development` makes Vite load `.env` (not `.env.production`). The output is still a
  minified production bundle (`NODE_ENV=production`).
- `BETTER_AUTH_URL` is overridden to the preview origin so cookies and auth URLs match.
  Email links in this build point at `localhost:4173`.
- `MANDRILL_KEY` is set empty (it is imported via `$env/static/private`, so the build fails if
  the key is missing entirely). With no key, verification/reset emails are **logged to the
  preview server's console** instead of sent — a local build never emails real users.
- SSL is only required for non-local databases (`src/lib/server/db/config.js`), so the local
  Postgres (SSL off) works with the production-mode server.
- If you previously signed in to a build with the wrong settings, clear cookies for
  `localhost:4173` (or use a private window).
- Env values are baked in at build time: rebuild after changing `.env`.

## Database Setup

The `app_settings` row is seeded in production (`signups_enabled = true`).

### Checking what production has applied

Because the hand-written migrations are not journaled (see the note below), nothing
records which of them have run. **Do not trust a written-down version number here —
it decays silently.** Probe for the objects the recent migrations create instead:

```sh
set -a; source .env.production; set +a
psql "$DATABASE_URL" -At -c "
  select 'auth_case:    ' || coalesce(string_agg(column_name, ','), 'NONE')
    from information_schema.columns
   where table_name='user' and column_name in ('email_verified','emailVerified')
  union all
  select 'app_settings: ' || count(*)::text
    from information_schema.tables where table_name='app_settings'
  union all
  select 'study_series: ' || count(*)::text
    from information_schema.tables where table_name='study_series';"
```

| Result | Means |
|---|---|
| `auth_case: email_verified` | `0045_fix_auth_column_case.sql` applied (camelCase ⇒ it is **not**, and login is broken) |
| `app_settings: 1` | `0044_add_app_settings.sql` applied |
| `study_series: 1` | `0046_add_study_series.sql` applied |

Extend the query with a new probe line as later migrations land.

### Running future migrations against Neon

```sh
set -a; source .env.production; set +a
npm run db:migrate
```

> **Note:** Only migrations `0000`–`0009` are tracked in `drizzle/meta/_journal.json`.
> The hand-written migrations (`0007_add_studies_panel_width.sql` and later) are not
> journaled, so `drizzle-kit migrate` won't run them automatically. Apply new
> hand-written SQL files with psql:
>
> ```sh
> psql "$DATABASE_URL" -f drizzle/00XX_your_migration.sql
> ```

## Vercel Setup

1. Import the GitHub repo (`phillipgore/expositor`) at https://vercel.com/new
2. Framework preset: **SvelteKit** (auto-detected)
3. Add these Environment Variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (host contains `-pooler`, ends `?sslmode=require`) |
| `BETTER_AUTH_SECRET` | Fresh secret: `openssl rand -base64 32` (do not reuse dev secret) |
| `BETTER_AUTH_URL` | Your production URL, e.g. `https://expositor.app` |
| `MANDRILL_KEY` | Mailchimp Transactional (Mandrill) API key |
| `ESV_API_TOKEN` | ESV API token |
| `ESV_API_BASE_URL` | `https://api.esv.org/v3/passage` |
| `NET_API_BASE_URL` | `https://labs.bible.org/api/` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | (Optional) auto-created admin account |
| `SEED_DEV_EMAIL` / `SEED_DEV_PASSWORD` | (Optional) auto-created dev account |

4. Deploy.

## Staging / Test Pipeline

Vercel automatically builds a **Preview Deployment** for every push to any branch
other than `main`. Production only updates when `main` is pushed/merged. This project
uses a dedicated `staging` branch as a stable test environment on top of that.

### Workflow

```
feature branch ──merge──▶ staging ──(auto deploy)──▶ https://staging URL  ← test here
                             │
                             └─(looks good?)─▶ merge into main ──▶ production
```

### One-time setup (dashboards)

**Neon — create a staging database branch:**

1. Neon console → your project → **Branches** → **Create branch** (parent: `main`/production).
   Neon branches are copy-on-write clones — instant, free, and resettable from
   production at any time.
2. Copy the staging branch's **pooled** connection string (host contains `-pooler`,
   ends `?sslmode=require`).

**Vercel — give `staging` a fixed domain:**

1. Vercel project → **Settings → Domains** → Add (e.g. `staging.expositor.app`, or use
   the free `<project>-staging.vercel.app` style) → assign it to the **`staging`** git branch.

**Vercel — scope environment variables:**

1. **Settings → Environment Variables.** Audit existing vars: production values must be
   scoped to **Production only** (⚠️ if `DATABASE_URL` is also checked for *Preview*,
   preview builds write to the production database).
2. Add **Preview**-scoped values:

| Variable | Preview value |
|---|---|
| `DATABASE_URL` | Neon **staging branch** pooled connection string |
| `BETTER_AUTH_SECRET` | A separate secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | The staging domain, e.g. `https://staging.expositor.app` |
| `MANDRILL_KEY` | Same key, or a Mandrill test key to avoid sending real email |
| `ESV_API_TOKEN`, `ESV_API_BASE_URL`, `NET_API_BASE_URL` | Same as production |

> Because env vars are baked in at build time, changing them requires a redeploy of
> the affected environment.

### Day-to-day usage

```sh
git checkout staging
git merge my-feature        # or commit directly for small changes
git push                    # Vercel auto-deploys to the staging domain
# ...test at the staging URL...
git checkout main
git merge staging
git push                    # Vercel deploys to production
```

### Migrations with staging

Apply new migrations to the **Neon staging branch first**, verify the app against it,
then apply to production before merging to `main`:

```sh
# staging
psql "$STAGING_DATABASE_URL" -f drizzle/00XX_your_migration.sql
# after verification, production
set -a; source .env.production; set +a
psql "$DATABASE_URL" -f drizzle/00XX_your_migration.sql
```

To refresh staging data, use Neon's **Reset from parent** on the staging branch.

### Notes on ad-hoc preview URLs

Feature branches other than `staging` also get preview deployments at random URLs.
They share the *Preview* env vars (staging database). Auth on those random URLs is
tolerated via `trustedOrigins` in `src/lib/server/auth.ts` (uses `VERCEL_URL`), but
email verification/reset links will still point at `BETTER_AUTH_URL` (the staging
domain) — full auth testing should happen on the `staging` branch.

### Important notes

- `DATABASE_URL` is imported via `$env/static/private`, so it is **baked in at build
  time** — changing any env var in the dashboard requires a **redeploy** to take effect.
- Always use Neon's **pooled** connection string on Vercel (serverless functions open
  many short-lived connections). The app's production DB config already sets
  `ssl: 'require'` and `prepare: false`, which is correct for Neon's pooler (PgBouncer).
- After the first deploy, verify: sign-up/sign-in flow, and that `BETTER_AUTH_URL`
  matches the deployed domain exactly (protocol + host), or auth callbacks will fail.

## Post-deploy checklist

- [ ] Visit the site, create an account, sign in/out
- [ ] Create a study and confirm DB writes reach Neon
- [ ] If sign-ups should be closed, flip `signups_enabled` in Back Office (app_settings)
- [ ] Rotate any tokens that may have leaked (e.g. remove embedded PAT from git remote:
      `git remote set-url origin https://github.com/phillipgore/expositor.git` and use
      a credential helper)
