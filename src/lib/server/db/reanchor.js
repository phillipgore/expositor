/**
 * # Keeping container anchors honest after a boundary move (SERIES_PLAN §8)
 *
 * A column and a section each carry a `startingWordId`, and so does every segment. When a cross-part
 * Join or Move Text shifts the boundary between two parts, the *segments* are handled explicitly by
 * those commands — but the containers above them are not, and they can be left pointing at a word that
 * now belongs to the other part, or at a word ahead of the segment they contain.
 *
 * ## ⚠️ The bug this was extracted to fix
 *
 * Nothing renders wrongly when an anchor drifts — extent is implicit, so a container is defined by the
 * segments inside it. The damage showed up one command later, in `insertSegment()`:
 *
 *     if (section.startingWordId === insertionWordId)
 *         throw new Error('Cannot insert segment at the beginning of a section');
 *
 * After a cross-part move, a section's anchor could equal the anchor of a segment that is NOT its
 * first, so the first legitimate insertion point inside that segment was misread as the section's own
 * start. Users saw "Cannot insert segment at the beginning of a section" on text they had just moved
 * or joined, with no way to proceed.
 *
 * `crossPartJoin.js` already had a private `reanchorFirstOf()` doing half of this, but it ran on the
 * **donor** passage only — never the receiver, which is the part that GREW and therefore the one the
 * user is most likely to edit next. `crossPartMove.js` had nothing at all. Extracted here so both
 * commands share one rule and it cannot drift again.
 *
 * ## The invariant, stated once
 *
 * For each passage: its leading column and leading section begin exactly where its first segment
 * begins. That is the state every passage is BORN in — `createDefaultPassageStructure()` creates
 * column, section and segment on one `firstWordId` — so this restores a normal condition rather than
 * imposing a new one.
 *
 * ⚠️ **Segments are never re-anchored here.** A segment's anchor is content: it is where the user put
 * a boundary. A container's anchor is bookkeeping, derived from what it holds. Moving a segment to
 * satisfy a container would silently relocate the user's own structural decision, and after a join it
 * would extend a segment over verses the other part now owns.
 *
 * @module reanchor
 */

import { passageColumn, passageSection, passageSegment } from './schema.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { compareWordIds } from '$lib/utils/wordIds.js';

/**
 * Re-anchor one passage's leading column and section onto its first segment.
 *
 * Safe to call when nothing has drifted: each update is issued only when the anchor actually differs,
 * so the common case costs reads and no writes.
 *
 * @param {Object} tx - Transaction (or db) handle
 * @param {string} passageId
 * @returns {Promise<{ columnMoved: boolean, sectionMoved: boolean }>}
 */
export async function reanchorContainers(tx, passageId) {
	const unchanged = { columnMoved: false, sectionMoved: false };

	const columns = await tx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));

	if (columns.length === 0) return unchanged;

	// ⚠️ Ordered by `compareWordIds`, not by the SQL ordering above. `startingWordId` is a padded
	// string so lexical order usually agrees with canonical order — but "usually" is not a guarantee
	// worth resting an anchor rewrite on, and every other site here compares the same way.
	const leadingColumn = columns.reduce((lowest, candidate) =>
		compareWordIds(candidate.startingWordId, lowest.startingWordId) < 0 ? candidate : lowest
	);

	const sections = await tx
		.select()
		.from(passageSection)
		.where(
			inArray(
				passageSection.passageColumnId,
				columns.map((column) => column.id)
			)
		);

	if (sections.length === 0) return unchanged;

	const segments = await tx
		.select()
		.from(passageSegment)
		.where(
			inArray(
				passageSegment.passageSectionId,
				sections.map((section) => section.id)
			)
		);

	if (segments.length === 0) return unchanged;

	// Where this passage's structure actually begins, per the user's own segment boundaries.
	const firstSegment = segments.reduce((lowest, candidate) =>
		compareWordIds(candidate.startingWordId, lowest.startingWordId) < 0 ? candidate : lowest
	);
	const firstWordId = firstSegment.startingWordId;

	const sectionsOfLeadingColumn = sections.filter(
		(section) => section.passageColumnId === leadingColumn.id
	);
	if (sectionsOfLeadingColumn.length === 0) return unchanged;

	const leadingSection = sectionsOfLeadingColumn.reduce((lowest, candidate) =>
		compareWordIds(candidate.startingWordId, lowest.startingWordId) < 0 ? candidate : lowest
	);

	const now = new Date();
	let columnMoved = false;
	let sectionMoved = false;

	// Rewritten in EITHER direction, which is the part `reanchorFirstOf()` got half-right.
	//
	// A join leaves the donor's containers anchored BEFORE the passage now starts; a Move Text Down
	// pulls the receiver's first segment backwards so its containers are left AFTER it. Only correcting
	// the "precedes" case — as the original did — fixes joins and leaves moves broken.
	if (leadingColumn.startingWordId !== firstWordId) {
		await tx
			.update(passageColumn)
			.set({ startingWordId: firstWordId, updatedAt: now })
			.where(eq(passageColumn.id, leadingColumn.id));
		columnMoved = true;
	}

	if (leadingSection.startingWordId !== firstWordId) {
		await tx
			.update(passageSection)
			.set({ startingWordId: firstWordId, updatedAt: now })
			.where(eq(passageSection.id, leadingSection.id));
		sectionMoved = true;
	}

	return { columnMoved, sectionMoved };
}

/**
 * Re-anchor several passages in one call.
 *
 * Both sides of a boundary move need this — the donor and the receiver — and forgetting the receiver
 * was the original defect, so the two are requested together rather than one call at a time.
 *
 * @param {Object} tx
 * @param {Array<string|null|undefined>} passageIds - Duplicates and nullish entries are ignored
 * @returns {Promise<void>}
 */
export async function reanchorPassages(tx, passageIds) {
	for (const passageId of new Set((passageIds ?? []).filter(Boolean))) {
		await reanchorContainers(tx, passageId);
	}
}
