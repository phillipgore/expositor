import { redirect } from '@sveltejs/kit';

/**
 * /back-office redirects to the default Back Office page (Settings).
 * The admin guard lives in the Back Office layout.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load() {
	throw redirect(303, '/back-office/settings');
}
