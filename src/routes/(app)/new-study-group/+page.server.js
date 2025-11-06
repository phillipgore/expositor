import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import { db } from '$lib/server/db/index.js';
import { studyGroup } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ url, request }) {
	// Verify user is authenticated
	const session = await auth.api.getSession({ headers: request.headers });
	
	if (!session?.user?.id) {
		throw redirect(303, '/signin');
	}

	// Get parentGroupId from URL if provided
	const parentGroupId = url.searchParams.get('parentGroupId');
	let parentGroup = null;

	if (parentGroupId) {
		// Verify parent group exists and belongs to user
		const groups = await db
			.select()
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, parentGroupId),
				eq(studyGroup.userId, session.user.id)
			))
			.limit(1);

		parentGroup = groups[0] || null;
	}

	// Get all groups for duplicate name checking
	const groups = await db
		.select()
		.from(studyGroup)
		.where(eq(studyGroup.userId, session.user.id));

	return {
		groups,
		parentGroupId: parentGroup?.id || null,
		parentGroupName: parentGroup?.name || null
	};
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
			const subtitle = data.get('subtitle');
			const description = data.get('description');
			const parentGroupId = data.get('parentGroupId');

			if (!name || typeof name !== 'string' || !name.trim()) {
				return {
					success: false,
					error: 'Group name is required'
				};
			}

			// Build request body
			const requestBody = { name: name.trim() };
			if (subtitle && typeof subtitle === 'string' && subtitle.trim() !== '') {
				requestBody.subtitle = subtitle.trim();
			}
			if (description && typeof description === 'string' && description.trim() !== '') {
				requestBody.description = description.trim();
			}
			if (parentGroupId && typeof parentGroupId === 'string' && parentGroupId.trim() !== '') {
				requestBody.parentGroupId = parentGroupId;
			}

			// Create the group using the internal API
			const url = new URL(request.url);
			const response = await fetch(`${url.origin}/api/groups`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Cookie': request.headers.get('cookie') || ''
				},
				body: JSON.stringify(requestBody)
			});

			if (response.ok) {
				const result = await response.json();
				const newGroupId = result.group?.id;
				
				// Redirect to new study form with the new group's ID
				throw redirect(303, `/new-study?groupId=${newGroupId}`);
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
