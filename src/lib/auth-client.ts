import { createAuthClient } from "better-auth/svelte"

// Derive the auth base URL from the current origin in the browser so the client
// keeps working no matter which port the dev server lands on (Vite falls back to
// 5174, 5175, 5176… when 5173 is taken). Hardcoding a port caused auth/session
// calls to hit a different origin than the page, silently breaking sign-in.
// On the server (no `window`) we fall back to the conventional dev port.
const baseURL =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173"

export const authClient = createAuthClient({
    baseURL
})

