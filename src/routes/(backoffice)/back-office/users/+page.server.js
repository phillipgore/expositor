import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';
import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema.js';

/**
 * Back Office — Users page.
 *
 * Lists all user accounts with their email-verification status and exposes
 * an action that lets the admin verify a user directly (no verification
 * email involved). The admin guard for viewing lives in the Back Office
 * layout, but actions re-verify the admin session themselves (layout loads
 * don't protect actions).
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
	const users = await db
		.select({
			id: user.id,
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt
		})
		.from(user)
		.orderBy(user.lastName, user.firstName);

	return { users };
}

/** @type {import('./$types').Actions} */
export const actions = {
	/**
	 * Mark a user's email as verified without sending a verification email.
	 * Expects form data: `userId` = the user's id.
	 */
	verifyUser: async ({ request }) => {
		const isAdmin = await requireAdmin(request);
		if (!isAdmin) {
			return fail(403, { error: 'Not authorized.' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId');

		if (typeof userId !== 'string' || !userId) {
			return fail(400, { error: 'Missing user id.' });
		}

		try {
			const updated = await db
				.update(user)
				.set({ emailVerified: true, updatedAt: new Date() })
				.where(eq(user.id, userId))
				.returning({ id: user.id });

			if (updated.length === 0) {
				return fail(404, { error: 'User not found.' });
			}
		} catch (error) {
			console.error('❌ Error verifying user:', error);
			return fail(500, { error: 'Failed to verify user.' });
		}

		return { success: true };
	}
};
