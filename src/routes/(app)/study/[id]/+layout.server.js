import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage, passageColumn, passageSplit, passageSegment } from '$lib/server/db/schema.js';
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

		// Fetch structure (columns, splits, segments) for each passage
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

				// For each column, get its splits
				const columnsWithSplits = await Promise.all(
					columns.map(async (col) => {
						const splits = await db
							.select()
							.from(passageSplit)
							.where(eq(passageSplit.passageColumnId, col.id))
							.orderBy(asc(passageSplit.startingWordId));

						// For each split, get its segments
						const splitsWithSegments = await Promise.all(
							splits.map(async (split) => {
								const segments = await db
									.select()
									.from(passageSegment)
									.where(eq(passageSegment.passageSplitId, split.id))
									.orderBy(asc(passageSegment.startingWordId));

								return { ...split, segments };
							})
						);

						return { ...col, splits: splitsWithSegments };
					})
				);

				return {
					...passageText,
					structure: {
						passageId: passageData.id,
						columns: columnsWithSplits
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
