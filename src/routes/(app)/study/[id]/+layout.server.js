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
		// ── Fast, lightweight queries (awaited) ──────────────────────────────
		// These resolve quickly and are needed to render the page shell (title,
		// header, references) immediately, so we await them and return them at the
		// top level. The browser gets these as soon as they're ready.
		const studyResult = await db.select().from(study).where(eq(study.id, studyId)).limit(1);

		if (studyResult.length === 0) {
			throw error(404, 'Study not found');
		}

		const studyData = studyResult[0];

		// Verify the study belongs to the logged-in user
		if (studyData.userId !== session.user.id) {
			throw error(403, 'You do not have permission to view this study');
		}

		// Query the passages for this study (light: no text/structure yet)
		const passagesData = await db
			.select()
			.from(passage)
			.where(eq(passage.studyId, studyId))
			.orderBy(passage.displayOrder);

		const translation = studyData.translation || 'esv';

		// ── Heavy work (STREAMED, not awaited) ───────────────────────────────
		// Passage text (which on a cache miss hits the external translation API),
		// the per-passage column/section/segment structure, and the study's
		// connections are the slow parts. We DON'T await this promise here — we
		// hand it back nested under `streamed` so SvelteKit streams it to the
		// client. The page renders its shell instantly and shows a Spinner until
		// this resolves. This is the key win for large studies on slow connections.
		const contentPromise = (async () => {
			// Fetch passage text, preferring the per-passage cache. Passages whose
			// cache is empty (newly created, range changed, or legacy rows) are
			// fetched live and lazily backfilled into the DB so subsequent loads are
			// fast and don't re-hit the translation API.
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
				passagesWithText: passagesWithStructure,
				connections
			};
		})();

		// Surface any rejection from the streamed promise as a proper error on the
		// client instead of an unhandled rejection. The catch below only handles
		// synchronous failures (the light queries); the streamed promise carries
		// its own error to the client via SvelteKit's streaming.
		contentPromise.catch((err) => {
			console.error('Error streaming study content:', err);
		});

		return {
			study: studyData,
			passages: passagesData,
			// Nested promise → SvelteKit streams this to the client.
			streamed: {
				content: contentPromise
			},
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
