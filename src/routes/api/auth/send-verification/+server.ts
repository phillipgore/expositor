import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEmailVerificationToken, sendVerificationEmail } from '$lib/server/verification';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import messages from '$lib/data/messages.json';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email } = await request.json();

		if (!email) {
			return json({ success: false, error: messages.errors.emailRequired }, { status: 400 });
		}

		// Check if user exists
		const users = await db.select().from(user).where(eq(user.email, email)).limit(1);

		if (users.length === 0) {
			return json({ success: false, error: messages.errors.userNotFound }, { status: 404 });
		}

		// Generate verification token
		const token = await createEmailVerificationToken(email);

		// Send verification email (mock in development, real with Mandrill)
		await sendVerificationEmail(email, token);

		return json({ success: true });
	} catch (error) {
		console.error('Error sending verification email:', error);
		return json({ success: false, error: messages.errors.failedToSendVerification }, { status: 500 });
	}
};
