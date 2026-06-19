import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import {
	study,
	passage,
	passageColumn,
	passageSection,
	passageSegment,
	passageHeading,
	segmentConnection
} from '$lib/server/db/schema.js';

import { auth } from '$lib/server/auth.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { fetchPassagesTextWithCache } from '$lib/server/bibleApi.js';


/**
 * Lightweight perf timer. Enabled when the PERF_LOG env var is truthy
 * (e.g. `PERF_LOG=1 npm run dev`), otherwise a no-op so it costs nothing in
 * normal/production runs. Logs are prefixed with `[perf]` for easy grepping
 * and removal once the audit is complete.
 * @param {string} label
 * @returns {() => void} call to stop the timer and log the elapsed time
 */
function perfTimer(label) {
	const enabled = !!process.env.PERF_LOG;
	const start = enabled ? performance.now() : 0;
	return () => {
		if (!enabled) return;
		const ms = (performance.now() - start).toFixed(1);
		console.log(`[perf] ${label}: ${ms}ms`);
	};
}

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	const endShell = perfTimer(`study ${params.id} shell (light queries)`);
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
		endShell();

		// ── Heavy work (STREAMED, not awaited) ───────────────────────────────

		// Passage text (which on a cache miss hits the external translation API),
		// the per-passage column/section/segment structure, and the study's
		// connections are the slow parts. We DON'T await this promise here — we
		// hand it back nested under `streamed` so SvelteKit streams it to the
		// client. The page renders its shell instantly and shows a Spinner until
		// this resolves. This is the key win for large studies on slow connections.
		const contentPromise = (async () => {
			const endContent = perfTimer(
				`study ${studyId} content (${passagesData.length} passages)`
			);
			// Fetch passage text, preferring the per-passage cache. Passages whose
			// cache is empty (newly created, range changed, or legacy rows) are
			// fetched live and lazily backfilled into the DB so subsequent loads are
			// fast and don't re-hit the translation API.
			const endText = perfTimer(`  └ passage text fetch`);
			const passagesWithText = await fetchPassagesTextWithCache(passagesData, translation, {
				onFetched: async (passageRow, result) => {
					await db
						.update(passage)
						.set({ cachedText: result.text, textCachedAt: new Date() })
						.where(eq(passage.id, passageRow.id));
				}
			});
			endText();

			// Fetch structure (columns, sections, segments) for ALL passages using
			// three batched queries (one per level) instead of the previous N+1
			// pattern (one query per column + one per section). The rows are then
			// grouped in memory. This keeps the number of DB round-trips constant
			// (3) regardless of how large the study is, which matters most against a
			// remote DB where each round-trip carries real latency.
			const endStructure = perfTimer(`  └ structure queries (batched)`);

			const passageIds = passagesData.map((p) => p.id);

			// 1. All columns across every passage in this study.
			const allColumns = passageIds.length
				? await db
						.select()
						.from(passageColumn)
						.where(inArray(passageColumn.passageId, passageIds))
						.orderBy(asc(passageColumn.startingWordId))
				: [];

			// 2. All sections belonging to those columns.
			const columnIds = allColumns.map((c) => c.id);
			const allSections = columnIds.length
				? await db
						.select()
						.from(passageSection)
						.where(inArray(passageSection.passageColumnId, columnIds))
						.orderBy(asc(passageSection.startingWordId))
				: [];

			// 3. All segments belonging to those sections.
			const sectionIds = allSections.map((s) => s.id);
			const allSegments = sectionIds.length
				? await db
						.select()
						.from(passageSegment)
						.where(inArray(passageSegment.passageSectionId, sectionIds))
						.orderBy(asc(passageSegment.startingWordId))
				: [];

			// 4. All headings belonging to those segments. Headings live in their
			// own table (passage_heading) but are projected back onto each segment
			// object below as headingOne/Two/Three (text) plus matching
			// headingOneId/Two/Three (row id) and a headings[] array carrying each
			// heading's commentary. This keeps the large display/merge code paths
			// working with the familiar segment.headingX shape while the storage is
			// normalized.
			const segmentIds = allSegments.map((s) => s.id);
			const allHeadings = segmentIds.length
				? await db
						.select()
						.from(passageHeading)
						.where(inArray(passageHeading.passageSegmentId, segmentIds))
				: [];

			const headingsBySegment = new Map();
			for (const heading of allHeadings) {
				const list = headingsBySegment.get(heading.passageSegmentId);
				if (list) list.push(heading);
				else headingsBySegment.set(heading.passageSegmentId, [heading]);
			}

			// Project heading rows onto each segment under the legacy field names.
			const projectedSegments = allSegments.map((segment) => {
				const headings = headingsBySegment.get(segment.id) ?? [];
				const byType = { one: null, two: null, three: null };
				for (const h of headings) byType[h.headingType] = h;
				return {
					...segment,
					headingOne: byType.one?.text ?? null,
					headingTwo: byType.two?.text ?? null,
					headingThree: byType.three?.text ?? null,
					headingOneId: byType.one?.id ?? null,
					headingTwoId: byType.two?.id ?? null,
					headingThreeId: byType.three?.id ?? null,
					headings
				};
			});

			// Group children by parent id for O(1) lookups while assembling.
			// (`orderBy` above means each group preserves startingWordId order.)
			const segmentsBySection = new Map();
			for (const segment of projectedSegments) {
				const list = segmentsBySection.get(segment.passageSectionId);
				if (list) list.push(segment);
				else segmentsBySection.set(segment.passageSectionId, [segment]);
			}


			const sectionsByColumn = new Map();
			for (const section of allSections) {
				const sectionWithSegments = {
					...section,
					segments: segmentsBySection.get(section.id) ?? []
				};
				const list = sectionsByColumn.get(section.passageColumnId);
				if (list) list.push(sectionWithSegments);
				else sectionsByColumn.set(section.passageColumnId, [sectionWithSegments]);
			}

			const columnsByPassage = new Map();
			for (const col of allColumns) {
				const columnWithSections = {
					...col,
					sections: sectionsByColumn.get(col.id) ?? []
				};
				const list = columnsByPassage.get(col.passageId);
				if (list) list.push(columnWithSections);
				else columnsByPassage.set(col.passageId, [columnWithSections]);
			}

			// Stitch the assembled structure back onto each passage's text payload,
			// preserving the original passage order.
			const passagesWithStructure = passagesWithText.map((passageText, index) => {
				const passageData = passagesData[index];
				if (!passageData) {
					return passageText; // Return without structure if passage not found
				}
				return {
					...passageText,
					structure: {
						passageId: passageData.id,
						columns: columnsByPassage.get(passageData.id) ?? []
					}
				};
			});
			endStructure();


			// Query segment connections for this study
			const endConnections = perfTimer(`  └ connections query`);
			const connections = await db
				.select()
				.from(segmentConnection)
				.where(eq(segmentConnection.studyId, studyId));
			endConnections();
			endContent();

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
