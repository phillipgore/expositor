import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import {
	studySeries,
	study,
	passage,
	passageColumn,
	passageSection,
	passageSegment,
	passageHeading
} from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { analyzeEdit } from '$lib/server/db/passageReconcile.js';
import { classifyExtent, formatExtentReference, projectExtent } from '$lib/utils/seriesExtent.js';
import { fingerprintParts, recomposePassages, diffSeams } from '$lib/utils/seriesSeams.js';
import { planSeriesParts } from '$lib/utils/seriesPlanning.js';
import { validatePassagesLimits } from '$lib/utils/translationLimits.js';

/**
 * Pre-commit impact analysis for editing a SERIES as a whole (SERIES_PLAN §5, §8).
 *
 * ## Why a series needs its own analysis
 *
 * `/api/studies/[id]/analyze-edit` reports what an edit does to ONE study's structure. A serialized
 * study's passages are spread across many parts, so the same edit asks a question that endpoint has
 * no way to express: a shrink does not merely narrow a range, it can remove whole parts.
 *
 * The two layers are kept distinct, in this order:
 *
 *   1. `classifyExtent()` decides WHICH parts are kept, narrowed or deleted. Asking this first is
 *      what stops a range change being mistaken for a re-division — the defect where shrinking
 *      Matthew 1–8 to 1–5 produced a *join* that silently kept chapters 6–8.
 *   2. `analyzeEdit()` then reports, per narrowed part, what happens to structure that would be
 *      orphaned — and lets the user choose Merge or Delete for each item.
 *
 * ## Nothing here decides; everything here reports
 *
 * Deleting a part destroys its columns, sections, segments, headings, notes and commentary, and
 * Q35 leaves no undo. So this endpoint counts what each doomed part contains and returns it. The
 * review page states it, the user confirms, and only then does the reserialize endpoint act. A
 * count gathered after the delete would be unrecoverable, and one merely estimated would be a
 * confident claim about the user's work — the failure §8's connection under-count records.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const seriesId = params.id;
		const {
			passages: desiredPassages,
			// The requested DIVISION, when the user moved the stepper. Absent means "leave the seams
			// alone", so a passage-only edit reports no division changes.
			chaptersPerPart = null,
			chaptersPerPassage = null
		} = (await request.json()) ?? {};

		if (!Array.isArray(desiredPassages)) {
			return json({ error: 'Invalid passages' }, { status: 400 });
		}

		// Scoped by userId so another user's series is indistinguishable from a missing one.
		const [series] = await db
			.select()
			.from(studySeries)
			.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, session.user.id)))
			.limit(1);

		if (!series) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		// The provider's per-request limits, checked up front so an over-limit range surfaces here
		// rather than at fetch time with the form already gone.
		const limitCheck = validatePassagesLimits(desiredPassages, series.translation || 'esv');
		if (!limitCheck.valid) {
			return json({ error: limitCheck.error }, { status: 400 });
		}

		const parts = await loadPartsWithPassages(db, seriesId, session.user.id);
		if (parts.length === 0) {
			return json({ error: 'This series has no parts' }, { status: 404 });
		}

		const extent = classifyExtent({ parts, desiredPassages });
		const passageReports = await reportNarrowings(db, extent);
		const deletedParts = await reportDeletions(db, extent);
		const divisionReport = describeDivision({
			parts,
			extent,
			translation: series.translation || 'esv',
			chaptersPerPart,
			chaptersPerPassage
		});

		const requiresReview =
			passageReports.some(
				(r) =>
					r.replace ||
					r.addStart ||
					r.addEnd ||
					(r.removeStart && r.removeStart.needsDecision) ||
					(r.removeEnd && r.removeEnd.needsDecision)
			) ||
			deletedParts.length > 0 ||
			extent.addedRanges.length > 0 ||
			extent.dissolves ||
			// A join DISCARDS the absorbed part's title (Q28), which is a loss the user must see
			// before it happens — so a division change alone is enough to require review.
			divisionReport.joins.length > 0 ||
			divisionReport.splits.length > 0;

		return json(
			{
				requiresReview,
				// `PassageReview` renders this shape unchanged.
				passages: passageReports,
				deletedParts,
				addedRanges: extent.addedRanges.map((range) => ({
					...range,
					reference: formatExtentReference(range)
				})),
				keptPartIds: extent.keptParts.map((p) => p.id),
				dissolves: extent.dissolves,
				division: divisionReport,
				// Pinned so the commit can refuse if the series changed while the user reviewed.
				partsFingerprint: fingerprintParts(parts)
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Series analyze-edit error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * What a requested re-division would do to the parts — including what it DISCARDS.
 *
 * ## Why this must be reported
 *
 * Q28: when two parts are joined, the earlier one keeps its title and the absorbed one's title is
 * gone. That is a real loss of something the user typed, and with no undo (Q35) it has to be stated
 * before it happens, not discovered afterwards in the Finder.
 *
 * Splits are reported too, though nothing is lost: the part count changes, and a preview that showed
 * only the destructive half would leave the user unable to check the shape they are about to get.
 *
 * ## Planned against the PROJECTED parts, exactly as the commit plans it
 *
 * `projectExtent()` gives the parts as they will be once the extent change lands, which is what the
 * commit's own division phase reasons about. Using the pre-edit rows here instead would let the
 * preview describe a different set of operations from the ones performed — the divergence §5 exists
 * to prevent ("the preview a user approves is the parting they get").
 */
function describeDivision({ parts, extent, translation, chaptersPerPart, chaptersPerPassage }) {
	const empty = { splits: [], joins: [], refusals: [] };

	const wanted = Number(chaptersPerPart);
	if (!Number.isFinite(wanted) || wanted < 1) return empty;

	const projected = projectExtent(parts, extent);
	if (projected.length === 0) return empty;

	const plan = planSeriesParts({
		passages: recomposePassages(projected),
		chaptersPerPart: wanted,
		chaptersPerPassage: Array.isArray(chaptersPerPassage) ? chaptersPerPassage : [],
		translationId: translation,
		baseTitle: ''
	});

	const diff = diffSeams({ parts: projected, plannedParts: plan.parts });
	const titleOf = (id) => projected.find((p) => p.id === id)?.title ?? 'a part';

	return {
		splits: diff.splits.map((split) => ({
			partId: split.partId,
			title: titleOf(split.partId),
			// One division yields two parts, so N chapters named means N+1 parts result.
			intoParts: split.afterChapters.length + 1
		})),
		joins: diff.joins.map((join) => ({
			keepId: join.keepId,
			keepTitle: titleOf(join.keepId),
			// ⚠️ The titles that will be LOST. `planPartJoin()` reports these as `discards`; named
			// here from the same projected parts so the preview and the commit agree about which
			// ones go.
			discardedTitles: join.absorbIds.map(titleOf)
		})),
		refusals: diff.refusals
	};
}

/**
 * What each narrowed part loses, per the SAME analysis a single-study edit runs.
 *
 * Delegated to `analyzeEdit()` rather than reimplemented, so the Merge/Delete choices a series edit
 * offers are the ones a study edit offers. A parallel implementation would be free to disagree about
 * what counts as content worth saving.
 */
async function reportNarrowings(dbx, extent) {
	const reports = [];

	for (const narrowed of extent.narrowedParts) {
		const oldRows = narrowed.part.passages;

		// `analyzeEdit` diffs by passage id, so each proposed row must carry the id of the row it
		// replaces. These are narrowings of existing rows, never new ones.
		const next = narrowed.changes.map((change) => ({
			id: rowIdFor(oldRows, change.old),
			testament: change.next.testament,
			book: change.next.book,
			fromChapter: change.next.fromChapter,
			fromVerse: change.next.fromVerse,
			toChapter: change.next.toChapter,
			toVerse: change.next.toVerse
		}));

		const report = await analyzeEdit(dbx, narrowed.part.id, oldRows, next);

		for (const entry of report.passages) {
			// Tagged with the owning part: the review lists several parts at once, and a bare
			// passage reference would not say which part's structure is at stake.
			reports.push({ ...entry, partId: narrowed.part.id, partTitle: narrowed.part.title });
		}
	}

	return reports;
}

/** What each deleted part contains, gathered BEFORE anything is destroyed. */
async function reportDeletions(dbx, extent) {
	const deleted = [];

	for (const doomed of extent.deletedParts) {
		deleted.push({
			partId: doomed.part.id,
			title: doomed.part.title,
			reference: doomed.reference,
			contents: await countPartContents(dbx, doomed.part.id)
		});
	}

	return deleted;
}

/**
 * Which existing passage row does this narrowing apply to?
 *
 * Matched on the ORIGINAL bounds, which `classifyExtent()` carries through as `change.old`. Matching
 * on the narrowed bounds would find nothing, and silently falling back to "the first row" would
 * apply the user's decision to a different passage than the one they were shown.
 */
function rowIdFor(rows, original) {
	const match = rows.find(
		(row) =>
			(row.bookId ?? row.book) === original.book &&
			row.testament === original.testament &&
			row.fromChapter === original.fromChapter &&
			row.fromVerse === original.fromVerse &&
			row.toChapter === original.toChapter &&
			row.toVerse === original.toVerse
	);
	return match?.id ?? rows[0]?.id ?? null;
}

/**
 * Count the authored work inside a part, so the review can name what a delete destroys.
 *
 * Counts CONTENT, not just containers: an empty column is not something a user would mourn, but a
 * note is. `segmentHasContent()` in `passageReconcile.js` draws the same line for the same reason.
 */
async function countPartContents(dbx, studyId) {
	const columns = await dbx
		.select({ id: passageColumn.id })
		.from(passageColumn)
		.innerJoin(passage, eq(passageColumn.passageId, passage.id))
		.where(eq(passage.studyId, studyId));

	if (columns.length === 0) {
		return { columns: 0, sections: 0, segments: 0, headings: 0, notes: 0, commentary: 0 };
	}

	const sections = await dbx
		.select({ id: passageSection.id })
		.from(passageSection)
		.where(
			inArray(
				passageSection.passageColumnId,
				columns.map((c) => c.id)
			)
		);

	const segments = sections.length
		? await dbx
				.select()
				.from(passageSegment)
				.where(
					inArray(
						passageSegment.passageSectionId,
						sections.map((s) => s.id)
					)
				)
		: [];

	// ⚠️ Headings live in their OWN table and are queried separately.
	//
	// `segmentHasContent()` reads `seg.headingOne/Two/Three`, which look like columns but are a
	// PROJECTION that `loadTree()` builds by joining `passage_heading` and pivoting on
	// `headingType`. Reading them off a raw `passage_segment` row yields `undefined` for every
	// segment, so a heading count taken that way would be permanently zero — telling the user their
	// headings are safe at the exact moment a delete is about to destroy them. Written the wrong way
	// first, and caught only by checking the schema.
	const headingRows = segments.length
		? await dbx
				.select({ id: passageHeading.id })
				.from(passageHeading)
				.where(
					inArray(
						passageHeading.passageSegmentId,
						segments.map((s) => s.id)
					)
				)
		: [];

	let notes = 0;
	let commentary = 0;
	for (const segment of segments) {
		if (segment.note) notes += 1;
		if (segment.commentary) commentary += 1;
	}
	const headings = headingRows.length;

	return {
		columns: columns.length,
		sections: sections.length,
		segments: segments.length,
		headings,
		notes,
		commentary
	};
}

/**
 * Load every part of a series with its passages attached.
 *
 * ⚠️ `inArray` over EVERY part id, not `eq` on the first — the under-count trap recorded in
 * `api/series/[id]/join/+server.js`, where a per-part omission made every seam look like a gap.
 */
async function loadPartsWithPassages(dbx, seriesId, userId) {
	const parts = await dbx
		.select()
		.from(study)
		.where(and(eq(study.seriesId, seriesId), eq(study.userId, userId)))
		.orderBy(asc(study.seriesOrder));

	if (parts.length === 0) return [];

	const rows = await dbx
		.select()
		.from(passage)
		.where(
			inArray(
				passage.studyId,
				parts.map((p) => p.id)
			)
		)
		.orderBy(asc(passage.displayOrder));

	const byStudy = new Map(parts.map((p) => [p.id, []]));
	for (const row of rows) {
		byStudy.get(row.studyId)?.push(row);
	}

	return parts.map((part) => ({ ...part, passages: byStudy.get(part.id) ?? [] }));
}
