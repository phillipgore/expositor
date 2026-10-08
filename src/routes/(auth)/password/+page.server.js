import { redirect } from '@sveltejs/kit';
import { getPasswordResetEnabled } from '$lib/server/appSettings.js';

/**
 * Password page guard.
 *
 * When the Back Office "Password Reset" setting is off, the password reset
 * pages are hidden — visitors are redirected to sign in. (The password reset
 * APIs are also blocked server-side, so this is purely the UX half of the block.)
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load() {
	const passwordResetEnabled = await getPasswordResetEnabled();

	if (!passwordResetEnabled) {
		throw redirect(303, '/signin');
	}

	return {};
}
