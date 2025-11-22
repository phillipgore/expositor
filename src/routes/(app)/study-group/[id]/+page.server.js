import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studyGroup, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	
	// Get the current user from session (guaranteed by layout)
	const session = await auth.api.getSession({ headers: request.headers });
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
			throw error(403, 'You do not have permission to view this study group');
		}

		// Query all studies in this group
		const studiesData = await db
			.select()
			.from(study)
			.where(eq(study.groupId, groupId))
			.orderBy(study.createdAt);

		// For each study, get its passages
		const studiesWithPassages = await Promise.all(
			studiesData.map(async (studyItem) => {
				const passagesData = await db
					.select()
					.from(passage)
					.where(eq(passage.studyId, studyItem.id))
					.orderBy(passage.displayOrder);

				return {
					...studyItem,
					passages: passagesData
				};
			})
		);

		return {
			group: groupData,
			studies: studiesWithPassages,
			invalidateStudies: true
		};
	} catch (err) {
		// Re-throw error responses
		if (err.status) {
			throw err;
		}
		
		console.error('Error loading study group:', err);
		throw error(500, 'Failed to load study group');
	}
}
