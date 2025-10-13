import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		throw error(401, 'You must be logged in to view studies');
	}

	const studyId = params.id;

	try {
		// Query the study by ID
		const studyResult = await db
			.select()
			.from(study)
			.where(eq(study.id, studyId))
			.limit(1);

		if (studyResult.length === 0) {
			throw error(404, 'Study not found');
		}

		const studyData = studyResult[0];

		// Verify the study belongs to the logged-in user
		if (studyData.userId !== session.user.id) {
			throw error(403, 'You do not have permission to view this study');
		}

		// Query the passages for this study
		const passagesData = await db
			.select()
			.from(passage)
			.where(eq(passage.studyId, studyId))
			.orderBy(passage.displayOrder);

		return {
			study: studyData,
			passages: passagesData,
			invalidateStudies: true
		};
	} catch (err) {
		// Re-throw error responses
		if (err.status) {
			throw err;
		}
		
		console.error('Error loading study:', err);
		throw error(500, 'Failed to load study');
	}
}
