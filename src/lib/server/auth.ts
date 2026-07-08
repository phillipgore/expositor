import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$env/static/private';
import { env } from '$env/dynamic/private';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  // On Vercel, preview deployments are served from auto-generated URLs that
  // differ from BETTER_AUTH_URL. Trust the deployment's own origin so auth
  // requests from preview URLs are not rejected. VERCEL_URL is provided
  // automatically by Vercel at runtime (host only, no protocol).
  trustedOrigins: env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : [],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
