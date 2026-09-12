import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import {
	study,
	studySeries,
	passage,
	passageColumn,
	passageSection,
	passageSegment,
	passageHeading,
	segmentConnection
} from '$lib/server/db/schema.js';


import { auth } from '$lib/server/auth.js';
import { eq, asc, inArray, sql, or } from 'drizzle-orm';
import { fetchPassagesTextWithCache } from '$lib/server/bibleApi.js';
import { getBoundaryDisabledReason } from '$lib/utils/seriesRuns.js';
import { selectPrefetchTarget } from '$lib/utils/seriesPrefetch.js';
import { warmAdjacentPart } from '$lib/server/db/seriesPrefetchRunner.js';
import { enforceCacheLimit } from '$lib/server/db/cacheEvictionRunner.js';
import { resolveStructureOwners } from '$lib/server/db/structureOwners.js';



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

		// ── Series context ───────────────────────────────────────────────
		//
		// In-part navigation was removed: readers move between parts from the Finder, so no
		// prev/next control ships with the study header. What remains is consumed by the
		// Structure menu's cross-part boundary reasoning (§8, §11) and the whole-series export
		// check (§10), both of which need the sibling parts and their ranges.
		//
		// Kept in the LIGHT phase deliberately: the menus read it as soon as the shell renders.
		//
		// Two small indexed queries, and only for parts: a standalone study pays nothing.
		let seriesContext = null;
		// Resolved inside the series branch below, consumed after the shell is sent. Declared here so
		// the fire-and-forget call sits outside the branch, where it is visible rather than buried.
		let prefetchTarget = null;

		if (studyData.seriesId) {
			const [seriesRow] = await db
				.select()
				.from(studySeries)
				.where(eq(studySeries.id, studyData.seriesId))
				.limit(1);

			// Ordered by seriesOrder, not canonical passage order: §2 settled that seriesOrder is
			// explicit and user-editable, so it is the only thing that may decide what "next" means.
			const parts = await db
				.select({
					id: study.id,
					title: study.title,
					seriesOrder: study.seriesOrder
				})
				.from(study)
				.where(eq(study.seriesId, studyData.seriesId))
				.orderBy(asc(study.seriesOrder));

			// Passage ranges for every sibling, so the seams around this part can be classified.
			// §11 option (1) requires an INELIGIBLE cross-part command to be disabled *with a
			// reason*, and `getBoundaryDisabledReason` cannot tell an eligible seam from a
			// permanently dead one without the ranges. One indexed query, and only for parts.
			// `id` and a cached-text presence flag ride along for adjacent-part prefetch (§11): the
			// decision needs to know which passages are cold, and `id` is what the warm-up then
			// updates. Deliberately NOT `cachedText` itself — the column holds the full processed
			// HTML of a passage, so selecting it for every sibling would pull an entire series'
			// text into memory on every part load to answer a yes/no question.
			const siblingPassages =
				parts.length > 0
					? await db
							.select({
								id: passage.id,
								studyId: passage.studyId,
								testament: passage.testament,
								bookId: passage.bookId,
								bookName: passage.bookName,
								fromChapter: passage.fromChapter,
								fromVerse: passage.fromVerse,
								toChapter: passage.toChapter,
								toVerse: passage.toVerse,
								hasCachedText: sql`${passage.cachedText} IS NOT NULL`
							})
							.from(passage)
							.where(
								inArray(
									passage.studyId,
									parts.map((part) => part.id)
								)
							)
							.orderBy(passage.displayOrder)
					: [];

			// classifyBoundary reads `part.passages`, so group the rows onto their parts rather
			// than passing bare ranges.
			const partsWithPassages = parts.map((part) => ({
				...part,
				passages: siblingPassages.filter((row) => row.studyId === part.id)
			}));

			const index = parts.findIndex((part) => part.id === studyId);

			// Q18: remember THIS part as the series' resume target.
			//
			// This is the only writer that matters. Creation seeds `lastPartId` to part 1, but a
			// seed is not a memory: without this the series title in the Finder would resume part 1
			// forever, permanently serving the fallback and making the column decorative. Writing
			// it here rather than in the nav component covers every way into a part — the prev/next
			// arrows, the "Part N of M" jump menu, a Finder click, a deep link, `⌥←`/`⌥→`, and a
			// plain reload — because they all come through this load. A writer per entry point
			// would be five chances to forget one (trap 17: an authoritative column whose writer
			// misses the case it exists for).
			//
			// Guarded on inequality so a reload or an `invalidate('app:studies')` is not a write,
			// and deliberately NOT awaited: the resume target is a convenience, so it must not add
			// latency to the shell or fail the page if it fails. `updatedAt` is left alone — merely
			// looking at a part is not editing the series.
			if (seriesRow && index !== -1 && seriesRow.lastPartId !== studyId) {
				db
					.update(studySeries)
					.set({ lastPartId: studyId })
					.where(eq(studySeries.id, studyData.seriesId))
					.catch((err) => {
						console.error('Failed to record last-viewed part:', err);
					});
			}

			// A series row that has vanished, or a part missing from its own sibling list, means
			// something is wrong upstream; send no context rather than render "Part 0 of 3".
			if (seriesRow && index !== -1) {

				seriesContext = {
					id: seriesRow.id,
					name: seriesRow.name,
					// The two lines of a part's study header (§7): a part is titled by the series it
					// belongs to, not by its own generated name, and the series owns the subtitle
					// beneath it too. `study.subtitle` is left untouched in the database — it is
					// simply not what a part displays.
					subtitle: seriesRow.subtitle ?? null,
					// ⚠️ `partsWithPassages`, not the bare `parts` rows.
					//
					// The whole-series export check (§10, Q32) aggregates every part's ranges, and a part
					// arriving without `passages` contributes zero verses — so handing over the bare rows
					// would make a whole-book series look compliant. That is precisely the silent
					// under-report §10 says this check exists to prevent, so the shape that carries ranges
					// is the one that travels. The rows are already loaded above for boundary reasons; this
					// costs nothing extra.
					parts: partsWithPassages,
					// 1-based for display ("Part 3 of 16"); the index stays available via parts.
					position: index + 1,
					total: parts.length,
					// Why the five cross-part commands are dead at each edge of THIS part — or null,
					// which means EITHER the seam is eligible OR there is no neighbour to be dead
					// against (§11 option 1, §8).
					//
					// ⚠️ That double meaning is load-bearing and has bitten once: consumers must not
					// read `null` as "go ahead" on its own. `crossPartCommands.js` pairs it with
					// `position`/`total`, which is what distinguishes the two cases.
					//
					// Two edges, not one, and they can disagree: in Prison Epistles, Ephesians →
					// Philippians is permanently ineligible while a Romans 8 → 9 seam is fully
					// usable. Resolving both here keeps the classification out of the menu, which
					// has no access to passage ranges.
					boundaryBefore:
						index > 0
							? getBoundaryDisabledReason(
									partsWithPassages[index - 1],
									partsWithPassages[index]
								)
							: null,
					boundaryAfter:
						index < parts.length - 1
							? getBoundaryDisabledReason(
									partsWithPassages[index],
									partsWithPassages[index + 1]
								)
							: null
				};

			}

			// ── Adjacent-part prefetch (§11, phase 2) ────────────────────────
			//
			// Navigating a series is the one place where the next thing the user opens is predictable:
			// the Finder lists the parts in order and readers move through a series in order. Warming
			// the next part's `cachedText` now makes that first visit as fast as a second one.
			//
			// ⚠️ Deliberately NOT awaited, and deliberately outside the streamed content promise. It is
			// an optimisation for the NEXT page, so making the current one wait for it — or fail with it
			// — would trade a real cost for a speculative gain. Errors are swallowed with a log for the
			// same reason: the provider being down must slow nothing and break nothing here.
			//
			// It runs after the shell is resolved and competes for the same rate limit as the page the
			// user is reading, which is why `selectPrefetchTarget` warms at most ONE part and skips any
			// part that is even partially cached.
			prefetchTarget = selectPrefetchTarget({
				parts: partsWithPassages,
				currentPartId: studyId,
				direction: 'next',
				// Passed so the selector can decline to store text speculatively under a translation with a
				// local-storage cap (COMPLIANCE.md §5 item 1). ESV has one; NET does not.
				translationId: studyData.translation || 'esv'
			});
		}

		const translation = studyData.translation || 'esv';
		endShell();

		// Kicked off without `await`: the page does not depend on it, and a slow provider must not delay
		// the response. `void` marks that the floating promise is intentional rather than forgotten.
		if (prefetchTarget) {
			// The user id travels with it so the runner can re-check the storage cap after warming
			// (COMPLIANCE.md §5 item 1).
			void warmAdjacentPart(prefetchTarget, translation, session.user.id);
		}


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
			let cacheFilled = false;
			const passagesWithText = await fetchPassagesTextWithCache(passagesData, translation, {
				onFetched: async (passageRow, result) => {
					await db
						.update(passage)
						.set({ cachedText: result.text, textCachedAt: new Date() })
						.where(eq(passage.id, passageRow.id));
					cacheFilled = true;
				}
			});
			endText();

			// ── Enforce the local-storage cap (COMPLIANCE.md §5 item 1) ──────
			//
			// This is the load-bearing wire for that item: `passage.cachedText` persisted fetched ESV text
			// "indefinitely and without bound", which COMPLIANCE.md called the one genuine licence
			// violation. The cap is enforced HERE, immediately after the write that could exceed it,
			// because a cap checked anywhere else is a cap with a window during which the app is in breach.
			//
			// ⚠️ Triggered only when a fill actually happened. Running it on every study load would issue a
			// query per page view to re-answer a question whose inputs did not change — and §11.1's rule
			// against spending unmeasured cost on unmeasured problems applies to compliance code too.
			//
			// ⚠️ NOT awaited, and errors are swallowed inside the runner. The user's own text is already
			// fetched and rendered by this point; eviction corrects what is STORED, so making the page wait
			// for it would trade a real delay for no visible benefit. Eviction never removes text this page
			// is displaying — the clause governs storage, not display, and an evicted row re-fetches on
			// demand.
			if (cacheFilled) {
				void enforceCacheLimit(session.user.id);
			}

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


			// Query segment connections.
			//
			// ── Widened to the SERIES for edge stubs (§8 strategy (c), phase 3) ──
			//
			// `where(studyId = …)` is correct for a standalone study and WRONG for a part, in the specific
			// way §8 predicts: a connection whose other endpoint moved to an adjacent part still names only
			// one study, so the part at the far end holds no row referring to it and the link vanishes from
			// that page. Under phase 2 the row was deleted outright, so nothing was lost invisibly; now that
			// it survives, both parts must be able to see it.
			//
			// Selecting by `seriesId` returns rows belonging to OTHER pairs of parts too, which is exactly
			// why `classifyConnections()` has a third `foreign` outcome — those are dropped rather than
			// drawn as stubs on every part. A standalone study has no seriesId and takes the original path,
			// so nothing changes for it.
			const endConnections = perfTimer(`  └ connections query`);
			const connections = studyData.seriesId
				? await db
						.select()
						.from(segmentConnection)
						.where(
							or(
								eq(segmentConnection.studyId, studyId),
								eq(segmentConnection.seriesId, studyData.seriesId)
							)
						)
				: await db
						.select()
						.from(segmentConnection)
						.where(eq(segmentConnection.studyId, studyId));
			endConnections();

			// ── Ownership index for edge-stub labels (§8 (c), phase 3) ──────────
			//
			// A stub knows only the id of its absent endpoint; naming the part it lives in needs the
			// reverse lookup. Built only when a connection actually reaches outside this study, so a
			// series with no cross-part links pays nothing.
			//
			// ⚠️ Three id columns, not one. `segment_connection` carries six endpoint FKs across three
			// types (§8's Q42 note), so resolving only segment ids would leave a cross-COLUMN link — the
			// case §3's "genuine overlap" paragraph anticipates — with no label and therefore no stub.
			let structureOwnership = null;
			if (studyData.seriesId) {
				// Built from `allColumns` / `allSections` / `allSegments` — the flat rows already fetched
				// above — rather than from `passagesWithStructure`. Those rows are unambiguously this
				// study's structure, whereas the assembled list carries a union type (a passage whose row
				// went missing is returned without a `structure` key), so walking it would need a cast to
				// say something the flat rows already state plainly.
				const localIds = new Set([
					...allColumns.map((c) => c.id),
					...allSections.map((s) => s.id),
					...allSegments.map((s) => s.id)
				]);

				// Every endpoint id on every row, regardless of type: a row may legitimately carry a
				// non-null id in a column its own type does not use, and collecting a few extra ids is
				// harmless here — they simply resolve to nothing.
				const foreignIds = new Set();
				for (const conn of connections) {
					for (const id of [
						conn.fromSegmentId,
						conn.toSegmentId,
						conn.fromSectionId,
						conn.toSectionId,
						conn.fromColumnId,
						conn.toColumnId
					]) {
						if (id && !localIds.has(id)) foreignIds.add(id);
					}
				}

				if (foreignIds.size > 0) {
					structureOwnership = await resolveStructureOwners(db, [...foreignIds]);
				}
			}

			endContent();

			return {
				passagesWithText: passagesWithStructure,
				connections,
				structureOwnership
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
			// null for a standalone study — nothing series-aware activates at all.
			seriesContext,

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
