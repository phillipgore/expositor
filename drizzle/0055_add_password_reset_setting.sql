-- Migration: Back Office "Password Reset" toggle. Written by hand (see note in 0046).
--
-- Additive only and idempotent (IF NOT EXISTS): safe to re-run. Defaults to true so
-- password reset stays available until an admin turns it off.

ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "password_reset_enabled" boolean DEFAULT true NOT NULL;
