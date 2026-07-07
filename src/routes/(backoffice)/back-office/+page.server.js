import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth.js';

/**
 * Back Office page guard.
 *
 * Only the seeded admin account may view the Back Office. Unauthenticated
 * visitors are sent to sign in; authenticated non-admins are sent back to
 * the app dashboard.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		throw redirect(303, '/signin');
	}

	const adminEmail = env.SEED_ADMIN_EMAIL || 'admin@expositor.app';
	const isAdmin = session.user.email?.toLowerCase() === adminEmail.toLowerCase();

	if (!isAdmin) {
		throw redirect(303, '/dashboard');
	}

	return {};
}
