-- Fix auth table column casing: the original journaled migration (0000) created
-- better-auth tables with camelCase column names, but schema.ts uses snake_case.
-- Renames are no-ops guarded by IF EXISTS checks via DO blocks so this is safe
-- to run on databases that already use snake_case.

DO $$
BEGIN
	-- user
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='emailVerified') THEN
		ALTER TABLE "user" RENAME COLUMN "emailVerified" TO "email_verified";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='createdAt') THEN
		ALTER TABLE "user" RENAME COLUMN "createdAt" TO "created_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='updatedAt') THEN
		ALTER TABLE "user" RENAME COLUMN "updatedAt" TO "updated_at";
	END IF;

	-- session
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session' AND column_name='expiresAt') THEN
		ALTER TABLE "session" RENAME COLUMN "expiresAt" TO "expires_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session' AND column_name='createdAt') THEN
		ALTER TABLE "session" RENAME COLUMN "createdAt" TO "created_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session' AND column_name='updatedAt') THEN
		ALTER TABLE "session" RENAME COLUMN "updatedAt" TO "updated_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session' AND column_name='ipAddress') THEN
		ALTER TABLE "session" RENAME COLUMN "ipAddress" TO "ip_address";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session' AND column_name='userAgent') THEN
		ALTER TABLE "session" RENAME COLUMN "userAgent" TO "user_agent";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='session' AND column_name='userId') THEN
		ALTER TABLE "session" RENAME COLUMN "userId" TO "user_id";
	END IF;

	-- account
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='accountId') THEN
		ALTER TABLE "account" RENAME COLUMN "accountId" TO "account_id";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='providerId') THEN
		ALTER TABLE "account" RENAME COLUMN "providerId" TO "provider_id";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='userId') THEN
		ALTER TABLE "account" RENAME COLUMN "userId" TO "user_id";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='accessToken') THEN
		ALTER TABLE "account" RENAME COLUMN "accessToken" TO "access_token";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='refreshToken') THEN
		ALTER TABLE "account" RENAME COLUMN "refreshToken" TO "refresh_token";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='idToken') THEN
		ALTER TABLE "account" RENAME COLUMN "idToken" TO "id_token";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='accessTokenExpiresAt') THEN
		ALTER TABLE "account" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='refreshTokenExpiresAt') THEN
		ALTER TABLE "account" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='createdAt') THEN
		ALTER TABLE "account" RENAME COLUMN "createdAt" TO "created_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='account' AND column_name='updatedAt') THEN
		ALTER TABLE "account" RENAME COLUMN "updatedAt" TO "updated_at";
	END IF;

	-- verification
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verification' AND column_name='expiresAt') THEN
		ALTER TABLE "verification" RENAME COLUMN "expiresAt" TO "expires_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verification' AND column_name='createdAt') THEN
		ALTER TABLE "verification" RENAME COLUMN "createdAt" TO "created_at";
	END IF;
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verification' AND column_name='updatedAt') THEN
		ALTER TABLE "verification" RENAME COLUMN "updatedAt" TO "updated_at";
	END IF;
END $$;
