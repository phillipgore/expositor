import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import {
	study,
	passage,
	passageColumn,
	passageSection,
	passageSegment,
	segmentConnection
} from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, asc } from 'drizzle-orm';
import { fetchPassagesTextWithCache } from '$lib/server/bibleApi.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	// Get the current user from session (guaranteed by layout)
	const session = await auth.api.getSession({ headers: request.headers });
	const studyId = params.id;

	try {
		// Query the study by ID
		const studyResult = await db.select().from(study).where(eq(study.id, studyId)).limit(1);

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

		// Fetch passage text, preferring the per-passage cache. Passages whose
		// cache is empty (newly created, range changed, or legacy rows) are
		// fetched live and lazily backfilled into the DB so subsequent loads are
		// fast and don't re-hit the translation API.
		const translation = studyData.translation || 'esv';
		const passagesWithText = await fetchPassagesTextWithCache(passagesData, translation, {
			onFetched: async (passageRow, result) => {
				await db
					.update(passage)
					.set({ cachedText: result.text, textCachedAt: new Date() })
					.where(eq(passage.id, passageRow.id));
			}
		});

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

		// Query segment connections for this study
		const connections = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.studyId, studyId));

		return {
			study: studyData,
			passages: passagesData,
			passagesWithText: passagesWithStructure,
			connections,
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
