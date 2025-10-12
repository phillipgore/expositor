import { json } from '@sveltejs/kit';
import { createPasswordResetToken, sendPasswordResetEmail } from '$lib/server/verification.js';
import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import messages from '$lib/data/messages.json';

/**
 * Request password reset endpoint
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const { email } = await request.json();

		if (!email) {
			return json({ success: false, error: messages.errors.emailRequired }, { status: 400 });
		}

		// Check if user exists (but don't reveal if they don't for security)
		const users = await db.select().from(user).where(eq(user.email, email)).limit(1);

		if (users.length > 0) {
			// Generate password reset token
			const token = await createPasswordResetToken(email);

			// Send password reset email (mock in development, real with Mandrill)
			await sendPasswordResetEmail(email, token);
		}

		// Always return success to prevent email enumeration
		return json({ success: true });
	} catch (error) {
		console.error('Error requesting password reset:', error);
		return json({ success: false, error: messages.errors.failedToProcessRequest }, { status: 500 });
	}
};
