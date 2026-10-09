import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';

/**
 * Returns the page a freshly signed-in user should land on.
 * The seeded admin goes to the Back Office; everyone else to the dashboard.
 * Decided server-side so the admin email never reaches client code.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const adminEmail = env.SEED_ADMIN_EMAIL || 'admin@expositor.app';
	const isAdmin = session.user.email?.toLowerCase() === adminEmail.toLowerCase();

	return json({ isAdmin, path: isAdmin ? '/back-office' : '/dashboard' });
}
