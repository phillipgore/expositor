import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';
import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema.js';
import { setUserPassword } from '$lib/server/passwords.js';

/**
 * Back Office — Users page.
 *
 * Lists all user accounts with their email-verification status and exposes
 * an action that lets the admin verify a user directly (no verification
 * email involved), plus actions to create new (pre-verified) users and to
 * reset a user's password.
 * The admin guard for viewing lives in the Back Office
 * layout, but actions re-verify the admin session themselves (layout loads
 * don't protect actions).
 */

/** The seeded admin account's email (lowercased). */
function getAdminEmail() {
	return (env.SEED_ADMIN_EMAIL || 'admin@expositor.app').toLowerCase();
}

/** @param {Request} request */
async function requireAdmin(request) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) return false;

	return session.user.email?.toLowerCase() === getAdminEmail();
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

	// Flag the admin account so its password can't be reset from the table
	// (it is managed via SEED_ADMIN_PASSWORD and re-synced on server start).
	const adminEmail = getAdminEmail();

	return {
		users: users.map((u) => ({ ...u, isAdmin: u.email.toLowerCase() === adminEmail }))
	};
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
	},

	/**
	 * Create a new user account on behalf of the admin. Runs server-side so
	 * the admin's own session is untouched, and bypasses the "New User Sign
	 * Ups" setting. Created users are marked as verified immediately.
	 * Expects form data: firstName, lastName, email, password.
	 */
	createUser: async ({ request }) => {
		const isAdmin = await requireAdmin(request);
		if (!isAdmin) {
			return fail(403, { error: 'Not authorized.' });
		}

		const formData = await request.formData();
		const firstName = String(formData.get('firstName') ?? '').trim();
		const lastName = String(formData.get('lastName') ?? '').trim();
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(formData.get('password') ?? '');

		if (!firstName || !lastName || !email || !password) {
			return fail(400, { error: 'All fields are required.' });
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.' });
		}
		if (password.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters.' });
		}

		const existing = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);
		if (existing.length > 0) {
			return fail(409, { error: 'A user with that email already exists.' });
		}

		try {
			const result = await auth.api.signUpEmail({
				body: { name: `${firstName} ${lastName}`, firstName, lastName, email, password }
			});

			await db
				.update(user)
				.set({ emailVerified: true, updatedAt: new Date() })
				.where(eq(user.id, result.user.id));
		} catch (error) {
			console.error('❌ Error creating user:', error);
			// better-auth APIErrors carry a user-facing message and HTTP status
			// (e.g. 400 "Password too short") — surface them instead of a generic error.
			const apiMessage = error?.body?.message;
			const apiStatus = error?.statusCode;
			if (typeof apiMessage === 'string' && apiStatus >= 400 && apiStatus < 500) {
				return fail(apiStatus, { error: apiMessage });
			}
			return fail(500, { error: 'Failed to create user.' });
		}

		return { success: true, created: email };
	},

	/**
	 * Set a new password for a user and sign them out of all devices.
	 * Expects form data: `userId`, `newPassword`.
	 */
	resetPassword: async ({ request }) => {
		const isAdmin = await requireAdmin(request);
		if (!isAdmin) {
			return fail(403, { error: 'Not authorized.' });
		}

		const formData = await request.formData();
		const userId = formData.get('userId');
		const newPassword = String(formData.get('newPassword') ?? '');

		if (typeof userId !== 'string' || !userId) {
			return fail(400, { error: 'Missing user id.' });
		}
		if (newPassword.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters.' });
		}

		const existing = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		if (existing.length === 0) {
			return fail(404, { error: 'User not found.' });
		}
		if (existing[0].email.toLowerCase() === getAdminEmail()) {
			return fail(403, {
				error: 'The admin password is managed by SEED_ADMIN_PASSWORD and cannot be reset here.'
			});
		}

		try {
			await setUserPassword(userId, newPassword, { revokeSessions: true });
		} catch (error) {
			console.error('❌ Error resetting user password:', error);
			return fail(500, { error: 'Failed to reset password.' });
		}

		return { success: true };
	}
};
