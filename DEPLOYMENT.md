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

## Database Setup (already completed)

The Neon database schema is fully migrated (through `0044_add_app_settings.sql`)
and the `app_settings` row is seeded (`signups_enabled = true`).

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
