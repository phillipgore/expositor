import { createAuthClient } from "better-auth/svelte"
import { inferAdditionalFields } from "better-auth/client/plugins"
// Type-only import (erased at build time, so the server-only module is never
// bundled into client code) used to infer the user additionalFields config.
import type { auth } from "$lib/server/auth"

// Derive the auth base URL from the current origin in the browser so the client
// keeps working no matter which port the dev server lands on (Vite falls back to
// 5174, 5175, 5176… when 5173 is taken). Hardcoding a port caused auth/session
// calls to hit a different origin than the page, silently breaking sign-in.
// On the server (no `window`) we fall back to the conventional dev port.
const baseURL =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173"

export const authClient = createAuthClient({
    baseURL,
    // Mirror the server's user.additionalFields so signUp.email() accepts and
    // forwards firstName/lastName (NOT NULL columns on the user table).
    plugins: [inferAdditionalFields<typeof auth>()]
})

