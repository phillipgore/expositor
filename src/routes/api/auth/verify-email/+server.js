import { json } from '@sveltejs/kit';
import { verifyEmailToken } from '$lib/server/verification.js';
import messages from '$lib/data/messages.json';

/**
 * Verify email endpoint
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const { token } = await request.json();

		if (!token) {
			return json({ success: false, error: messages.errors.tokenRequired }, { status: 400 });
		}

		const result = await verifyEmailToken(token);

		if (result.success) {
			return json({ success: true, email: result.email });
		} else {
			return json({ success: false, error: result.error }, { status: 400 });
		}
	} catch (error) {
		console.error('Error verifying email:', error);
		return json({ success: false, error: messages.errors.failedToVerifyEmail }, { status: 500 });
	}
};
