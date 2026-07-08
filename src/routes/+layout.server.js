import { getSignupsEnabled } from '$lib/server/appSettings.js';

/**
 * Root layout server load.
 *
 * Exposes app-wide settings needed by shared UI — currently whether new user
 * sign-ups are allowed, which drives the visibility of the Sign Up button in
 * the auth toolbar.
 *
 * @type {import('./$types').LayoutServerLoad}
 */
export async function load() {
	const signupsEnabled = await getSignupsEnabled();

	return { signupsEnabled };
}
