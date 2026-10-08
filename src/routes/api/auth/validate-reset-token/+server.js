import { json } from '@sveltejs/kit';
import { getPasswordResetEnabled } from '$lib/server/appSettings.js';
import { verifyPasswordResetToken } from '$lib/server/verification.js';
import messages from '$lib/data/messages.json';

/**
 * Validate reset token endpoint
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
		const { token } = await request.json();

		if (!token) {
			return json({ success: false, error: messages.errors.tokenRequired }, { status: 400 });
		}

		const result = await verifyPasswordResetToken(token);

		if (result.success) {
			return json({ success: true, email: result.email });
		} else {
			return json({ success: false, error: result.error }, { status: 400 });
		}
	} catch (error) {
		console.error('Error validating reset token:', error);
		return json({ success: false, error: messages.errors.failedToValidateToken }, { status: 500 });
	}
};
