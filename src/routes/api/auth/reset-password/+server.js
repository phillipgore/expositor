import { json } from '@sveltejs/kit';
import { getPasswordResetEnabled } from '$lib/server/appSettings.js';
import { verifyPasswordResetToken, deletePasswordResetToken } from '$lib/server/verification.js';
import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema.js';
import { setUserPassword } from '$lib/server/passwords.js';
import { eq } from 'drizzle-orm';
import messages from '$lib/data/messages.json';

/**
 * Reset password endpoint
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	// Enforce the Back Office "Password Reset" setting at the API level.
	if (!(await getPasswordResetEnabled())) {
		return json(
			{ success: false, error: 'Password reset is currently disabled.' },
			{ status: 403 }
		);
	}

	try {
		const { token, newPassword } = await request.json();

		if (!token || !newPassword) {
			return json({ success: false, error: messages.errors.passwordRequired }, { status: 400 });
		}

		if (newPassword.length < 6) {
			return json({ success: false, error: messages.validation.passwordTooShort }, { status: 400 });
		}

		// Verify the reset token
		const result = await verifyPasswordResetToken(token);

		if (!result.success || !result.email) {
			return json({ success: false, error: result.error || 'Invalid token' }, { status: 400 });
		}

		// Look up the user by email (credential accounts are keyed by user id,
		// not email).
		const users = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, result.email))
			.limit(1);

		if (users.length === 0) {
			return json({ success: false, error: 'Invalid token' }, { status: 400 });
		}

		// Hash with better-auth's hasher (so sign-in works) and sign the user out
		// everywhere, since their credentials changed.
		await setUserPassword(users[0].id, newPassword, { revokeSessions: true });

		// Delete the used token
		await deletePasswordResetToken(token);

		return json({ success: true });
	} catch (error) {
		console.error('Error resetting password:', error);
		return json({ success: false, error: messages.errors.failedToResetPassword }, { status: 500 });
	}
};
