import { seedAccounts } from '$lib/server/seedAccounts.js';

/**
 * Runs once when the server starts (SvelteKit `init` hook). Guarantees the
 * seed accounts (admin/dev) exist, are email-verified, and have the passwords
 * configured via environment variables.
 *
 * @type {import('@sveltejs/kit').ServerInit}
 */
export async function init() {
	await seedAccounts();
}
