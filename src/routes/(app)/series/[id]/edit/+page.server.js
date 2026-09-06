import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { recomposePassages, deriveChaptersPerPart } from '$lib/utils/seriesSeams.js';

/**
 * Edit a serialized study AS A WHOLE (SERIES_PLAN §5).
 *
 * ## Why this exists
 *
 * A series is a study the user divided; it is not N unrelated studies. They typed one passage list
 * ("Romans 1–16") and chose how to part it. Editing therefore has to present that same list back —
 * not part 3's fragment of it — or the form is answering a question the user never asked.
 *
 * `recomposePassages()` reconstitutes the original list by walking the parts in the USER'S order
 * and coalescing ranges that abut. A sixteen-part Romans series recomposes to one passage; Prison
 * Epistles recomposes to the four the user selected; a gap left by a part delete is preserved,
 * because those verses genuinely are no longer in the study.
 *
 * ⚠️ The recomposed passages carry NO `id`. They are not passage rows — several rows may have
 * merged into one range — so an id here would be a claim about identity that the merge destroyed.
 * The reserialize endpoint diffs SEAMS rather than passage ids, which is what lets an untouched
 * part keep its structure, notes and commentary.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ params, request, depends }) {
	depends('app:studies');

	const session = await auth.api.getSession({ headers: request.headers });
	const seriesId = params.id;

	try {
		const [seriesData] = await db
			.select()
			.from(studySeries)
			.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, session.user.id)))
			.limit(1);

		if (!seriesData) {
			throw error(404, 'Series not found');
		}

		// Parts in the user's order. §4 forbids re-deriving the sequence from canonical order, and
		// recomposition reads this order — so a series taught Philippians-first recomposes to
		// Philippians first, not to whatever canonical order would have produced.
		const partsData = await db
			.select()
			.from(study)
			.where(and(eq(study.seriesId, seriesId), eq(study.userId, session.user.id)))
			.orderBy(asc(study.seriesOrder));

		if (partsData.length === 0) {
			throw error(404, 'This series has no parts');
		}

		// One query for every part's passages, grouped in memory.
		const passageRows = await db
			.select()
			.from(passage)
			.where(
				inArray(
					passage.studyId,
					partsData.map((p) => p.id)
				)
			)
			.orderBy(asc(passage.displayOrder));

		const byStudy = new Map(partsData.map((p) => [p.id, []]));
		for (const row of passageRows) {
			byStudy.get(row.studyId)?.push(row);
		}

		const parts = partsData.map((part) => ({
			...part,
			passages: byStudy.get(part.id) ?? []
		}));

		// Studies for the duplicate-title check, excluding this series' own parts — their titles
		// are derived from the parting ("Romans 1–2"), so treating them as user-chosen titles would
		// make the series collide with itself.
		const partIds = new Set(parts.map((p) => p.id));
		const allStudies = (
			await db.select().from(study).where(eq(study.userId, session.user.id))
		).filter((s) => !partIds.has(s.id));

		// ⚠️ Synthetic ids, and they are NOT passage row ids.
		//
		// `PassageSelector` keys its rows by `id`, so the recomposed ranges need one. But a
		// recomposed range may be several passage rows merged into one (a 28-part Matthew becomes a
		// single "Matthew 1:1–28:20"), so there is no single row it corresponds to. Handing back a
		// real row id would be a claim about identity that the merge destroyed, and the save path
		// would then diff against the wrong row.
		//
		// Nothing downstream matches on these: the reserialize endpoint works out which rows to
		// touch from RANGES via `classifyExtent()`, never from ids sent by the client.
		const recomposed = recomposePassages(parts).map((range, index) => ({
			id: `recomposed-${index}`,
			testament: range.testament,
			book: range.book,
			bookName: range.bookName,
			fromChapter: range.fromChapter,
			fromVerse: range.fromVerse,
			toChapter: range.toChapter,
			toVerse: range.toVerse
		}));

		return {
			series: {
				id: seriesData.id,
				title: seriesData.name,
				subtitle: seriesData.subtitle,
				translation: seriesData.translation,
				passages: recomposed,
				// The division the series ACTUALLY has, so Manage Serialization opens showing it
				// rather than a default that would propose re-dividing everything on sight. `null`
				// for a hand-shaped series with no single chapters-per-part — the form then leaves
				// the stepper at its own default and only acts if the user moves it.
				chaptersPerPart: deriveChaptersPerPart(parts),
				partCount: parts.length
			},
			parts,
			studies: allStudies
		};
	} catch (err) {
		if (err.status) {
			throw err;
		}

		console.error('Error loading series for edit:', err);
		throw error(500, 'Failed to load series');
	}
}
