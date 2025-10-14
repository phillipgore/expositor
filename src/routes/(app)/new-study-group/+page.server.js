import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ request }) {
	// Verify user is authenticated
	const session = await auth.api.getSession({ headers: request.headers });
	
	if (!session?.user?.id) {
		throw redirect(303, '/signin');
	}

	return {};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request }) => {
		try {
			// Get the current user from session
			const session = await auth.api.getSession({ headers: request.headers });
			
			if (!session?.user?.id) {
				return {
					success: false,
					error: 'Unauthorized'
				};
			}

			const data = await request.formData();
			const name = data.get('name');

			if (!name || typeof name !== 'string' || !name.trim()) {
				return {
					success: false,
					error: 'Group name is required'
				};
			}

			// Create the group using the internal API
			const url = new URL(request.url);
			const response = await fetch(`${url.origin}/api/groups`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Cookie': request.headers.get('cookie') || ''
				},
				body: JSON.stringify({ name: name.trim() })
			});

			if (response.ok) {
				// Redirect to the home page (which will show the studies panel)
				throw redirect(303, '/new-study');
			} else {
				const error = await response.json();
				return {
					success: false,
					error: error.error || 'Failed to create group'
				};
			}
		} catch (error) {
			if (error?.status === 303) {
				throw error; // Re-throw redirect
			}
			console.error('Create group error:', error);
			return {
				success: false,
				error: 'An unexpected error occurred'
			};
		}
	}
};
