import { createAuthClient } from "better-auth/svelte" // make sure to import from better-auth/svelte
 
export const authClient = createAuthClient({
    baseURL: "http://localhost:5174" // This should match your dev server URL
})
