import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studyGroup } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		throw error(401, 'You must be logged in to edit study groups');
	}

	const groupId = params.id;

	try {
		// Query the study group by ID
		const groupResult = await db
			.select()
			.from(studyGroup)
			.where(eq(studyGroup.id, groupId))
			.limit(1);

		if (groupResult.length === 0) {
			throw error(404, 'Study group not found');
		}

		const groupData = groupResult[0];

		// Verify the group belongs to the logged-in user
		if (groupData.userId !== session.user.id) {
			throw error(403, 'You do not have permission to edit this study group');
		}

		// Get all groups for duplicate checking
		const allGroups = await db
			.select()
			.from(studyGroup)
			.where(eq(studyGroup.userId, session.user.id));

		return {
			group: {
				id: groupData.id,
				name: groupData.name
			},
			groups: allGroups
		};
	} catch (err) {
		// Re-throw error responses
		if (err.status) {
			throw err;
		}
		
		console.error('Error loading study group for edit:', err);
		throw error(500, 'Failed to load study group');
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request, params }) => {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return fail(401, { error: 'You must be logged in to edit a study group' });
		}

		const groupId = params.id;

		try {
			// Verify group exists and belongs to user
			const groupResult = await db
				.select()
				.from(studyGroup)
				.where(eq(studyGroup.id, groupId))
				.limit(1);

			if (groupResult.length === 0) {
				return fail(404, { error: 'Study group not found' });
			}

			if (groupResult[0].userId !== session.user.id) {
				return fail(403, { error: 'You do not have permission to edit this study group' });
			}

			const formData = await request.formData();
			const name = formData.get('name');

			// Validate name
			if (!name || typeof name !== 'string' || name.trim() === '') {
				return fail(400, { 
					error: 'Group name is required',
					name: name || ''
				});
			}

			const now = new Date();

			// Update group
			await db
				.update(studyGroup)
				.set({
					name: name.toString().trim(),
					updatedAt: now
				})
				.where(eq(studyGroup.id, groupId));

			// Redirect to the study group view page
			throw redirect(303, `/study-group/${groupId}`);

		} catch (error) {
			// If it's a redirect, re-throw it
			if (error?.status === 303) {
				throw error;
			}

			console.error('Error updating study group:', error);
			return fail(500, { 
				error: 'Failed to update study group. Please try again.'
			});
		}
	}
};
