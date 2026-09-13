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
 * For each passage: every section begins where its first segment begins, every column begins where its
 * first live section's first segment begins, and **no container is childless**. That is the state
 * every passage is BORN in — `createDefaultPassageStructure()` creates column, section and segment on
 * one `firstWordId` — so this restores a normal condition rather than imposing a new one.
 *
 * ## ⚠️ The second bug: a childless column renders as a GAP
 *
 * A cross-part command re-parents a section or segment into the other part's container. If the row it
 * left behind was its parent's last child, that parent survives with no children. `passageJoin.js`
 * deletes such rows via `reanchorAndPrune()` after every within-passage join; the cross-part paths
 * called only this module, which used to re-anchor and never prune. Because `analyze/+page.svelte`
 * emits the `.column` div for every row before guarding `{#if column.sections.length > 0}`, and
 * `.column` has a fixed width, a childless column draws as a blank full-width slot between real
 * columns. Pruning therefore belongs here, beside the anchor rule, not in a caller.
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
 * Re-anchor EVERY column and section in a passage onto its own first child, and delete any container
 * left without children.
 *
 * ## ⚠️ Two defects this replaced, both user-visible
 *
 * **1. Childless containers survived a cross-part command, and rendered as a gap.** The within-passage
 * joins in `passageJoin.js` have always finished with `reanchorAndPrune()`, which deletes a section
 * with no segments and a column with no live sections. The cross-part paths called only
 * `reanchorPassages()`, which re-anchored and never pruned — so when a Join Down re-parented the last
 * section out of its column, that column stayed behind. `analyze/+page.svelte` emits the `.column` div
 * for every row and only then guards `{#if column.sections.length > 0}`, and `.column` carries a fixed
 * `width: 27.8rem`, so a childless column draws as a full-width blank slot between real columns.
 *
 * **2. The leading anchor was derived from the wrong column.** The previous implementation took the
 * lowest `startingWordId` across ALL of the passage's segments and stamped it onto the leading column
 * and that column's leading section. When the passage's earliest segment lived in a *different*
 * column — entirely possible mid-way through a boundary move — it wrote one column's word id onto
 * another column's anchor, corrupting the `compareWordIds` ordering that `loadPassageTree()` uses to
 * sort columns. Every container is now anchored to its OWN first child, which is what
 * `reanchorAndPrune()` does and what the invariant actually says.
 *
 * ## The invariant, stated once
 *
 * Every section begins where its first segment begins; every column begins where its first live
 * section's first segment begins; and no container is childless.
 *
 * Idempotent, and safe to call when nothing has drifted: each update is issued only when the anchor
 * actually differs, so the common case costs reads and no writes.
 *
 * @param {Object} tx - Transaction (or db) handle
 * @param {string} passageId
 * @returns {Promise<{ columnsReanchored: number, sectionsReanchored: number, columnsDeleted: number, sectionsDeleted: number }>}
 */
export async function reanchorContainers(tx, passageId) {
	const result = {
		columnsReanchored: 0,
		sectionsReanchored: 0,
		columnsDeleted: 0,
		sectionsDeleted: 0
	};

	const columns = await tx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));

	if (columns.length === 0) return result;

	const sections = await tx
		.select()
		.from(passageSection)
		.where(
			inArray(
				passageSection.passageColumnId,
				columns.map((column) => column.id)
			)
		);

	const segments =
		sections.length > 0
			? await tx
					.select()
					.from(passageSegment)
					.where(
						inArray(
							passageSegment.passageSectionId,
							sections.map((section) => section.id)
						)
					)
			: [];

	const now = new Date();
	const emptySectionIds = [];
	const emptyColumnIds = [];

	for (const column of columns) {
		/** @type {Array<{ section: Object, firstWordId: string }>} */
		const live = [];

		for (const section of sections.filter((s) => s.passageColumnId === column.id)) {
			// ⚠️ Ordered by `compareWordIds`, never by insertion or by the SQL ordering.
			// `startingWordId` is a zero-padded string so lexical order usually agrees with canonical
			// order — but "usually" is not a guarantee worth resting an anchor rewrite on.
			const own = segments
				.filter((seg) => seg.passageSectionId === section.id)
				.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));

			if (own.length === 0) {
				emptySectionIds.push(section.id);
				continue;
			}

			const firstWordId = own[0].startingWordId;
			live.push({ section, firstWordId });

			if (section.startingWordId !== firstWordId) {
				await tx
					.update(passageSection)
					.set({ startingWordId: firstWordId, updatedAt: now })
					.where(eq(passageSection.id, section.id));
				result.sectionsReanchored += 1;
			}
		}

		if (live.length === 0) {
			emptyColumnIds.push(column.id);
			continue;
		}

		// This column's OWN first section's own first segment — not the passage's.
		live.sort((a, b) => compareWordIds(a.firstWordId, b.firstWordId));
		const columnWordId = live[0].firstWordId;

		// Rewritten in EITHER direction, which is the part the original `reanchorFirstOf()` got only
		// half-right. A join leaves the donor's containers anchored BEFORE the passage now starts; a
		// Move Text Down pulls the receiver's first segment backwards so its containers are left
		// AFTER it. Correcting only the "precedes" case fixes joins and leaves moves broken.
		if (column.startingWordId !== columnWordId) {
			await tx
				.update(passageColumn)
				.set({ startingWordId: columnWordId, updatedAt: now })
				.where(eq(passageColumn.id, column.id));
			result.columnsReanchored += 1;
		}
	}

	// Connections referencing removed sections/columns cascade-delete with the rows, so no manual
	// cleanup is needed here — the same reasoning `reanchorAndPrune()` records.
	if (emptySectionIds.length > 0) {
		await tx.delete(passageSection).where(inArray(passageSection.id, emptySectionIds));
		result.sectionsDeleted = emptySectionIds.length;
	}
	if (emptyColumnIds.length > 0) {
		await tx.delete(passageColumn).where(inArray(passageColumn.id, emptyColumnIds));
		result.columnsDeleted = emptyColumnIds.length;
	}

	return result;
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
