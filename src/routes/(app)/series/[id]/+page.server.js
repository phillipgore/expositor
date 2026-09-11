import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { formatPassageReference } from '$lib/utils/passageFormatting.js';
import { eq, and, asc, inArray } from 'drizzle-orm';

/**
 * The series landing page (SERIES_PLAN §4, §6).
 *
 * ## Why a series needs a page of its own
 *
 * A series is selected in the Finder the way a group is, and a group click opens
 * `/study-group/[id]` — its OWN page, never one of its studies. The series row had no such
 * destination, so its click navigated to a PART instead. That made the part the active study,
 * which the Finder's auto-select effect then selected, so selecting a series always ended up
 * selecting a part and Edit acted on the part.
 *
 * Giving the series somewhere of its own to go removes that chain by construction, rather than
 * defending against it with a guard in the selection effect.
 *
 * ⚠️ This REVERSES Q18's "clicking the series title resumes the last-viewed part". The decision
 * is not discarded — `lastPartId` still records where the user was, and this page offers it as an
 * explicit "Continue reading" button. What changes is that resuming is now a choice the user
 * makes rather than a side effect of selecting the series, which is what let the selection leak
 * into a part in the first place.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ params, request, depends }) {
	depends('app:studies');

	const session = await auth.api.getSession({ headers: request.headers });
	const seriesId = params.id;

	try {
		// Scoped by userId so another user's series is indistinguishable from a missing one — the
		// same treatment every series endpoint gives it.
		const seriesResult = await db
			.select()
			.from(studySeries)
			.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, session.user.id)))
			.limit(1);

		if (seriesResult.length === 0) {
			throw error(404, 'Series not found');
		}

		const seriesData = seriesResult[0];

		// Parts in the USER'S order. §4 forbids re-deriving the sequence from canonical order.
		const partsData = await db
			.select()
			.from(study)
			.where(and(eq(study.seriesId, seriesId), eq(study.userId, session.user.id)))
			.orderBy(asc(study.seriesOrder));

		// ⚠️ ONE query over every part id, not one per part. A 150-part Psalms series must not
		// issue 150 queries to render a landing page.
		const passagesData =
			partsData.length > 0
				? await db
						.select()
						.from(passage)
						.where(
							inArray(
								passage.studyId,
								partsData.map((p) => p.id)
							)
						)
						.orderBy(asc(passage.displayOrder))
				: [];

		const passagesByStudy = new Map(partsData.map((p) => [p.id, []]));
		for (const row of passagesData) {
			passagesByStudy.get(row.studyId)?.push(row);
		}

		const parts = partsData.map((part) => ({
			...part,
			passages: passagesByStudy.get(part.id) ?? []
		}));

		// Q18's resume target, verified to still be a part of THIS series. `lastPartId` is
		// ON DELETE SET NULL, but a stale id would otherwise send the button somewhere outside the
		// series it belongs to. Falls back to part 1, which is what a null has always meant.
		const remembered = parts.find((p) => p.id === seriesData.lastPartId);
		const resumePart = remembered ?? parts[0] ?? null;

		// The resume button names the part by PASSAGE REFERENCE, the same way the Finder's part
		// rows do (`referenceAsTitle` in StudyItem.svelte). A part's title is derived from its
		// range at creation, so "Ephesians 1" is a lossy restatement of "Ephesians 1:1-23"; the
		// reference is the precise form and the one the user just saw in the sidebar. Falls back
		// to the title when a part somehow has no passages — a button labelled "Continue:" with
		// nothing after it is worse than a slightly vaguer one.
		const resumeReference =
			resumePart?.passages?.length > 0
				? resumePart.passages.map((p) => formatPassageReference(p)).join(', ')
				: (resumePart?.title ?? null);

		return {
			series: seriesData,
			parts,
			resumePartId: resumePart?.id ?? null,
			resumePartReference: resumeReference,
			resumePartTranslation: resumePart?.translation ?? null,
			invalidateStudies: true
		};
	} catch (err) {
		if (err.status) {
			throw err;
		}

		console.error('Error loading series:', err);
		throw error(500, 'Failed to load series');
	}
}
