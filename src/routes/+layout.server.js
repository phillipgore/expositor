import { getSignupsEnabled, getPasswordResetEnabled } from '$lib/server/appSettings.js';

/**
 * Root layout server load.
 *
 * Exposes app-wide settings needed by shared UI — currently whether new user
 * sign-ups and password reset are allowed, which drive the visibility of the
 * Sign Up and Password buttons in the auth toolbar.
 *
 * @type {import('./$types').LayoutServerLoad}
 */
export async function load() {
	const [signupsEnabled, passwordResetEnabled] = await Promise.all([
		getSignupsEnabled(),
		getPasswordResetEnabled()
	]);

	return { signupsEnabled, passwordResetEnabled };
}
