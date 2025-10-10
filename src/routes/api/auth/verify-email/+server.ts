import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyEmailToken } from '$lib/server/verification';
import messages from '$lib/data/messages.json';

export const POST: RequestHandler = async ({ request }) => {
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
