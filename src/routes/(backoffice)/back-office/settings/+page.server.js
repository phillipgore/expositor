import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth.js';
import {
	getSignupsEnabled,
	setSignupsEnabled,
	getPasswordResetEnabled,
	setPasswordResetEnabled
} from '$lib/server/appSettings.js';

/**
 * Back Office — Settings page.
 *
 * Loads current application settings and exposes actions to update them.
 * The admin guard for viewing lives in the Back Office layout, but actions
 * re-verify the admin session themselves (layout loads don't protect actions).
 */

/** @param {Request} request */
async function requireAdmin(request) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) return false;

	const adminEmail = env.SEED_ADMIN_EMAIL || 'admin@expositor.app';
	return session.user.email?.toLowerCase() === adminEmail.toLowerCase();
}

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	const [signupsEnabled, passwordResetEnabled] = await Promise.all([
		getSignupsEnabled(),
		getPasswordResetEnabled()
	]);

	return { signupsEnabled, passwordResetEnabled };
}

/** @type {import('./$types').Actions} */
export const actions = {
	/**
	 * Toggle whether new user sign-ups are allowed.
	 * Expects form data: `signupsEnabled` = 'true' | 'false'.
	 */
	updateSignups: async ({ request }) => {
		const isAdmin = await requireAdmin(request);
		if (!isAdmin) {
			return fail(403, { error: 'Not authorized.' });
		}

		const formData = await request.formData();
		const enabled = formData.get('signupsEnabled') === 'true';

		try {
			await setSignupsEnabled(enabled);
		} catch (error) {
			console.error('❌ Error updating signupsEnabled setting:', error);
			return fail(500, { error: 'Failed to update setting.' });
		}

		return { success: true, signupsEnabled: enabled };
	},

	/**
	 * Toggle whether password reset is allowed.
	 * Expects form data: `passwordResetEnabled` = 'true' | 'false'.
	 */
	updatePasswordReset: async ({ request }) => {
		const isAdmin = await requireAdmin(request);
		if (!isAdmin) {
			return fail(403, { error: 'Not authorized.' });
		}

		const formData = await request.formData();
		const enabled = formData.get('passwordResetEnabled') === 'true';

		try {
			await setPasswordResetEnabled(enabled);
		} catch (error) {
			console.error('❌ Error updating passwordResetEnabled setting:', error);
			return fail(500, { error: 'Failed to update setting.' });
		}

		return { success: true, passwordResetEnabled: enabled };
	}
};
