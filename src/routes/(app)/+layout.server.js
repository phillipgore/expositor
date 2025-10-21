import { db } from '$lib/server/db/index.js';
import { study, passage, studyGroup, user } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, asc } from 'drizzle-orm';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ request, depends }) {
	depends('app:studies');
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	// If not logged in, return empty arrays
	if (!session?.user?.id) {
		return {
			groups: [],
			ungroupedStudies: [],
			studies: [],
			studiesPanelWidth: 300
		};
	}

	try {
		// Get user preferences
		const userData = await db
			.select({ studiesPanelWidth: user.studiesPanelWidth })
			.from(user)
			.where(eq(user.id, session.user.id))
			.limit(1);
		
		const studiesPanelWidth = userData[0]?.studiesPanelWidth || 300;
		
		// Query all groups for the logged-in user
		const groupsData = await db
			.select()
			.from(studyGroup)
			.where(eq(studyGroup.userId, session.user.id))
			.orderBy(asc(studyGroup.displayOrder));

		// Query all studies for the logged-in user
		const studiesData = await db
			.select({
				id: study.id,
				title: study.title,
				groupId: study.groupId
			})
			.from(study)
			.where(eq(study.userId, session.user.id))
			.orderBy(asc(study.title));

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
		
		// Organize studies by group
		const groupsWithStudies = groupsData.map(group => ({
			...group,
			studies: studiesWithPassages
				.filter(s => s.groupId === group.id)
				.sort((a, b) => a.title.localeCompare(b.title))
		}));

		// Get ungrouped studies
		const ungroupedStudies = studiesWithPassages
			.filter(s => !s.groupId)
			.sort((a, b) => a.title.localeCompare(b.title));
		
		return {
			groups: groupsWithStudies,
			ungroupedStudies,
			studies: studiesWithPassages, // Keep for backwards compatibility
			studiesPanelWidth
		};
	} catch (error) {
		console.error('Error loading studies:', error);
		return {
			groups: [],
			ungroupedStudies: [],
			studies: []
		};
	}
}
