#!/usr/bin/env bash
#
# Seed (or re-seed) a verified test login for local development.
#
# Why a shell script + HTTP signup?  The `user` table has NOT NULL
# `first_name` / `last_name` columns, but better-auth's sign-up insert only
# supplies `name` (the app fills the split names in a second step). Rather than
# reimplement better-auth's scrypt password hashing, we let the running dev
# server hash + insert the credential for us, briefly giving those two columns a
# DEFAULT so the insert succeeds, then we backfill the names, mark the email
# verified, and drop the temporary default again.
#
# Usage:
#   ./scripts/seed-test-user.sh           # uses defaults below
#   EMAIL=me@x.dev PASSWORD='Secret123!' ./scripts/seed-test-user.sh
#
# Requires: the dev server running on $BASE_URL and psql on PATH.

set -euo pipefail

EMAIL="${EMAIL:-test@expositor.dev}"
PASSWORD="${PASSWORD:-TestPass123!}"
FIRST_NAME="${FIRST_NAME:-Test}"
LAST_NAME="${LAST_NAME:-User}"
BASE_URL="${BASE_URL:-http://localhost:5173}"

# Pull DATABASE_URL out of .env if not already exported.
if [[ -z "${DATABASE_URL:-}" ]]; then
	DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
	echo "ERROR: DATABASE_URL not set and not found in .env" >&2
	exit 1
fi

psql_do() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"; }

echo "→ Seeding test user: $EMAIL"

# If the user already exists, just (re)ensure names + verified flag and exit.
EXISTING="$(psql_do "SELECT id FROM \"user\" WHERE email = '$EMAIL';" || true)"
if [[ -n "$EXISTING" ]]; then
	echo "  User already exists (id=$EXISTING); ensuring verified + names."
	psql_do "UPDATE \"user\" SET email_verified = true, first_name = '$FIRST_NAME', last_name = '$LAST_NAME' WHERE email = '$EMAIL';" >/dev/null
	echo "✓ Done. Sign in with: $EMAIL / $PASSWORD"
	exit 0
fi

# 1. Temporarily allow the better-auth insert to succeed.
echo "  Adding temporary column defaults…"
psql_do "ALTER TABLE \"user\" ALTER COLUMN first_name SET DEFAULT '';" >/dev/null
psql_do "ALTER TABLE \"user\" ALTER COLUMN last_name SET DEFAULT '';" >/dev/null

cleanup() {
	# 4. Always restore the original (no-default) schema.
	psql_do "ALTER TABLE \"user\" ALTER COLUMN first_name DROP DEFAULT;" >/dev/null 2>&1 || true
	psql_do "ALTER TABLE \"user\" ALTER COLUMN last_name DROP DEFAULT;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 2. Create the credential through the running server (handles password hashing
#    + the matching `account` row).
echo "  Registering via $BASE_URL/api/auth/sign-up/email…"
HTTP_CODE="$(curl -s -o /tmp/seed-signup.json -w '%{http_code}' \
	-X POST "$BASE_URL/api/auth/sign-up/email" \
	-H 'Content-Type: application/json' \
	-d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"$FIRST_NAME $LAST_NAME\"}")"

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
	echo "ERROR: sign-up failed (HTTP $HTTP_CODE):" >&2
	cat /tmp/seed-signup.json >&2; echo >&2
	exit 1
fi

# 3. Backfill names + verify the email so the account can sign in immediately.
echo "  Backfilling names + verifying email…"
psql_do "UPDATE \"user\" SET email_verified = true, first_name = '$FIRST_NAME', last_name = '$LAST_NAME' WHERE email = '$EMAIL';" >/dev/null

echo "✓ Done. Sign in with: $EMAIL / $PASSWORD"
