import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPasswordResetToken, deletePasswordResetToken } from '$lib/server/verification';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import messages from '$lib/data/messages.json';

export const POST: RequestHandler = async ({ request }) => {
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

		// Hash the new password
		const hashedPassword = await bcrypt.hash(newPassword, 10);

		// Update the password in the account table
		await db
			.update(account)
			.set({ 
				password: hashedPassword,
				updatedAt: new Date()
			})
			.where(eq(account.accountId, result.email));

		// Delete the used token
		await deletePasswordResetToken(token);

		return json({ success: true });
	} catch (error) {
		console.error('Error resetting password:', error);
		return json({ success: false, error: messages.errors.failedToResetPassword }, { status: 500 });
	}
};
