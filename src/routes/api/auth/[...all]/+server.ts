import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth.js';
import { getSignupsEnabled } from '$lib/server/appSettings.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async (event) => {
	return auth.handler(event.request);
};

export const POST: RequestHandler = async (event) => {
	// Enforce the Back Office "New User Sign Ups" setting at the API level
	// so sign-ups are blocked even if someone posts directly to the endpoint.
	// The seeded admin/dev accounts are exempt so system account creation can
	// never be locked out.
	if (event.url.pathname.startsWith('/api/auth/sign-up')) {
		const signupsEnabled = await getSignupsEnabled();

		if (!signupsEnabled) {
			// Clone so better-auth can still consume the original request body.
			let email = '';
			try {
				const body = await event.request.clone().json();
				email = String(body?.email ?? '').toLowerCase();
			} catch {
				// Unparseable body — treat as a normal (blocked) signup attempt.
			}

			const exemptEmails = [env.SEED_ADMIN_EMAIL, env.SEED_DEV_EMAIL]
				.filter(Boolean)
				.map((e) => String(e).toLowerCase());

			if (!email || !exemptEmails.includes(email)) {
				return json(
					{ message: 'New user sign ups are currently disabled.' },
					{ status: 403 }
				);
			}
		}
	}

	return auth.handler(event.request);
};
