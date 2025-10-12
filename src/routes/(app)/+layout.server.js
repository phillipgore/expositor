import { db } from '$lib/server/db/index.js';
import { study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, desc } from 'drizzle-orm';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ request, depends }) {
	depends('app:studies');
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	// If not logged in, return empty studies array
	if (!session?.user?.id) {
		return {
			studies: []
		};
	}

	try {
		// Query all studies for the logged-in user with their passages
		const studiesData = await db
			.select({
				id: study.id,
				title: study.title,
				createdAt: study.createdAt,
				updatedAt: study.updatedAt,
				openedAt: study.openedAt
			})
			.from(study)
			.where(eq(study.userId, session.user.id))
			.orderBy(desc(study.updatedAt)); // Most recently updated first

		console.log('Loaded studies:', studiesData); // Debug log
		
		// For each study, load its passages
		const studiesWithPassages = await Promise.all(
			studiesData.map(async (s) => {
				const passages = await db
					.select()
					.from(passage)
					.where(eq(passage.studyId, s.id))
					.orderBy(passage.displayOrder);
				
				return {
					...s,
					passages
				};
			})
		);
		
		return {
			studies: studiesWithPassages
		};
	} catch (error) {
		console.error('Error loading studies:', error);
		return {
			studies: []
		};
	}
}
