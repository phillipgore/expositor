import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage, studyGroup, user } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, asc } from 'drizzle-orm';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ request, depends }) {
	depends('app:studies');
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	// Redirect to login if not authenticated
	if (!session?.user?.id) {
		throw redirect(303, '/signin');
	}

	try {
		// Get user preferences
		const userData = await db
			.select({ 
				studiesPanelWidth: user.studiesPanelWidth,
				studiesPanelOpen: user.studiesPanelOpen,
				commentaryPanelWidth: user.commentaryPanelWidth,
				commentaryPanelOpen: user.commentaryPanelOpen
			})
			.from(user)
			.where(eq(user.id, session.user.id))
			.limit(1);
		
		const studiesPanelWidth = userData[0]?.studiesPanelWidth || 300;
		const studiesPanelOpen = userData[0]?.studiesPanelOpen ?? true;
		const commentaryPanelWidth = userData[0]?.commentaryPanelWidth || 300;
		const commentaryPanelOpen = userData[0]?.commentaryPanelOpen ?? false;
		
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
				groupId: study.groupId,
				translation: study.translation
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
		
		// Build hierarchical group tree
		function buildGroupTree(groups, parentId = null, depth = 0) {
			return groups
				.filter(g => g.parentGroupId === parentId)
				.sort((a, b) => a.displayOrder - b.displayOrder)
				.map(group => ({
					...group,
					depth,
					subgroups: buildGroupTree(groups, group.id, depth + 1),
					studies: studiesWithPassages
						.filter(s => s.groupId === group.id)
						.sort((a, b) => a.title.localeCompare(b.title))
				}));
		}
		
		const groupsWithStudies = buildGroupTree(groupsData);

		// Get ungrouped studies
		const ungroupedStudies = studiesWithPassages
			.filter(s => !s.groupId)
			.sort((a, b) => a.title.localeCompare(b.title));
		
		return {
			groups: groupsWithStudies,
			ungroupedStudies,
			studies: studiesWithPassages, // Keep for backwards compatibility
			studiesPanelWidth,
			studiesPanelOpen,
			commentaryPanelWidth,
			commentaryPanelOpen
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
