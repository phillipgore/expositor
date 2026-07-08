import { redirect } from '@sveltejs/kit';
import { getSignupsEnabled } from '$lib/server/appSettings.js';

/**
 * Sign Up page guard.
 *
 * When the Back Office "New User Sign Ups" setting is off, the sign-up
 * page is hidden — visitors are redirected to sign in. (The sign-up API is
 * also blocked server-side, so this is purely the UX half of the block.)
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load() {
	const signupsEnabled = await getSignupsEnabled();

	if (!signupsEnabled) {
		throw redirect(303, '/signin');
	}

	return {};
}
