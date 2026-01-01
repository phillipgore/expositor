import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage, passageColumn, passageSection, passageSegment } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, asc } from 'drizzle-orm';
import { fetchPassagesText } from '$lib/server/bibleApi.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	// Get the current user from session (guaranteed by layout)
	const session = await auth.api.getSession({ headers: request.headers });
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

		// Fetch passage text from the appropriate API
		const translation = studyData.translation || 'esv';
		const passagesWithText = await fetchPassagesText(passagesData, translation);

		// Fetch structure (columns, sections, segments) for each passage
		const passagesWithStructure = await Promise.all(
			passagesWithText.map(async (passageText, index) => {
				// Get the matching passage data by index
				const passageData = passagesData[index];
				
				if (!passageData) {
					return passageText; // Return without structure if passage not found
				}

				// Query columns for this passage
				const columns = await db
					.select()
					.from(passageColumn)
					.where(eq(passageColumn.passageId, passageData.id))
					.orderBy(asc(passageColumn.startingWordId));

				// For each column, get its sections
				const columnsWithSections = await Promise.all(
					columns.map(async (col) => {
						const sections = await db
							.select()
							.from(passageSection)
							.where(eq(passageSection.passageColumnId, col.id))
							.orderBy(asc(passageSection.startingWordId));

						// For each section, get its segments
						const sectionsWithSegments = await Promise.all(
							sections.map(async (section) => {
								const segments = await db
									.select()
									.from(passageSegment)
									.where(eq(passageSegment.passageSectionId, section.id))
									.orderBy(asc(passageSegment.startingWordId));

								return { ...section, segments };
							})
						);

						return { ...col, sections: sectionsWithSegments };
					})
				);

				return {
					...passageText,
					structure: {
						passageId: passageData.id,
						columns: columnsWithSections
					}
				};
			})
		);

		return {
			study: studyData,
			passages: passagesData,
			passagesWithText: passagesWithStructure,
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
