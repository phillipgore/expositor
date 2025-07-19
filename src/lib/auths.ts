import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from "$env/static/private";
import { db } from "./db/index";

export const auth = betterAuth({
    secret: BETTER_AUTH_SECRET,
    url: BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
});