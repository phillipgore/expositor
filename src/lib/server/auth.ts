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
  user: {
    // The `user` table requires first_name/last_name (NOT NULL). Declaring
    // them here makes better-auth accept the values from signUp.email() and
    // include them in the INSERT — without this the insert violates the NOT
    // NULL constraints and sign-up fails with "Failed to create user".
    additionalFields: {
      firstName: {
        type: 'string',
        required: true,
      },
      lastName: {
        type: 'string',
        required: true,
      },
    },
  },
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  // On Vercel, preview deployments are served from auto-generated URLs that
  // differ from BETTER_AUTH_URL. Trust the deployment's own origin so auth
  // requests from preview URLs are not rejected. VERCEL_URL is provided
  // automatically by Vercel at runtime (host only, no protocol).
  //
  // Locally (no VERCEL env), also trust the Vite dev server and `vite preview`
  // origins so sign-in works when testing the production build via
  // `npm run build && npm run preview`. These are never added on Vercel.
  trustedOrigins: [
    ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
    ...(!env.VERCEL
      ? ['http://localhost:4173', 'http://localhost:5173']
      : []),
  ],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
