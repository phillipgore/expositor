import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPasswordResetToken } from '$lib/server/verification';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { token } = await request.json();

		if (!token) {
			return json({ success: false, error: 'Token is required' }, { status: 400 });
		}

		const result = await verifyPasswordResetToken(token);

		if (result.success) {
			return json({ success: true, email: result.email });
		} else {
			return json({ success: false, error: result.error }, { status: 400 });
		}
	} catch (error) {
		console.error('Error validating reset token:', error);
		return json({ success: false, error: 'Failed to validate token' }, { status: 500 });
	}
};
