/**
 * Structure transfer across a part boundary — the executor (SERIES_PLAN §8, phase 2).
 *
 * Every decision here is made by `$lib/utils/seriesStructurePlan.js`; this module only performs the
 * writes, inside a caller-supplied transaction. The split exists because the decision layer must be
 * loadable without a database — see that module's header — and because "what the confirm dialog
 * promised" and "what the endpoint did" then come from one function, the property §5's creation
 * flow already relies on.
 *
 * ## Order of operations is the whole safety argument
 *
 * `passage_column.passage_id` is ON DELETE CASCADE, all the way down to headings, and the six
 * `segment_connection` endpoint FKs cascade too. So:
 *
 *   1. Re-parent (or clone) structure onto its new passage.
 *   2. Re-own or collect connections.
 *   3. ONLY THEN delete the emptied passage row.
 *
 * Reversing 1 and 3 is not a subtle inefficiency — it is silent, total loss of the absorbed part's
 * work, with the operation reporting success. `assertPassageEmpty()` below refuses the delete if
 * step 1 did not achieve what it claimed, so the cascade can never be reached by accident.
 *
 * ## Explicit non-goal: de-duplicating the two engines
 *
 * §8 records that `passageJoin.js` and `passageReconcile.js` carry parallel copies of `loadTree`,
 * `flattenSegments` and `foldSegmentContent`, and asks that de-duplicating them be either a
 * prerequisite or an explicit non-goal. **It is an explicit non-goal for this commit.** Merging
 * them touches every structural editing path in the app and belongs in a commit whose diff is
 * about that, not one shipping Split/Join.
 *
 * @module seriesStructure
 */

import {
	passage,
	passageColumn,
	passageSection,
	passageSegment,
	segmentConnection
} from '$lib/server/db/schema.js';

import { eq, inArray, asc, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
	planStructureSplit,
	planStructureMove,
	planConnectionOwnership
} from '$lib/utils/seriesStructurePlan.js';
import { compareWordIds } from '$lib/utils/wordIds.js';

/**
 * Load one passage's column → section → segment tree in word order.
 *
 * Headings are deliberately not projected: nothing in this module reads a segment's content, and
 * loading it would invite a caller to make a content decision here, which belongs to the fold
 * helpers in `passageFold.js`.
 */
export async function loadPassageTree(tx, passageId) {
	const columns = await tx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));
	if (columns.length === 0) return [];

	const sections = await tx
		.select()
		.from(passageSection)
		.where(
			inArray(
				passageSection.passageColumnId,
				columns.map((c) => c.id)
			)
		)
		.orderBy(asc(passageSection.startingWordId));

	const segments =
		sections.length > 0
			? await tx
					.select()
					.from(passageSegment)
					.where(
						inArray(
							passageSegment.passageSectionId,
							sections.map((s) => s.id)
						)
					)
					.orderBy(asc(passageSegment.startingWordId))
			: [];

	return columns
		.map((col) => ({
			...col,
			sections: sections
				.filter((s) => s.passageColumnId === col.id)
				.map((sec) => ({
					...sec,
					segments: segments
						.filter((seg) => seg.passageSectionId === sec.id)
						.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId))
				}))
				.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId))
		}))
		.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
}

/**
 * Every connection with at least one endpoint among the given structure ids.
 *
 * ⚠️ Queried by ENDPOINT, never by `studyId`. §8 is explicit that `studyId` becomes *wrong* once
 * structure moves between parts: `countTouchingConnections()` filters on it and so "silently
 * returns fewer rows than it should", after which the confirm modal confidently reports that no
 * connections are affected. Selecting on the six endpoint columns is the only formulation that
 * stays correct while ownership is mid-flight.
 */
async function loadTouchingConnections(tx, { segmentIds, sectionIds, columnIds }) {
	const clauses = [];
	if (segmentIds.length > 0) {
		clauses.push(inArray(segmentConnection.fromSegmentId, segmentIds));
		clauses.push(inArray(segmentConnection.toSegmentId, segmentIds));
	}
	if (sectionIds.length > 0) {
		clauses.push(inArray(segmentConnection.fromSectionId, sectionIds));
		clauses.push(inArray(segmentConnection.toSectionId, sectionIds));
	}
	if (columnIds.length > 0) {
		clauses.push(inArray(segmentConnection.fromColumnId, columnIds));
		clauses.push(inArray(segmentConnection.toColumnId, columnIds));
	}
	// No ids means no candidates. `or()` with an empty list is not a valid filter, and omitting the
	// where clause entirely would select EVERY connection in the database.
	if (clauses.length === 0) return [];

	return tx
		.select()
		.from(segmentConnection)
		.where(or(...clauses));
}

/**
 * Collect the section and column ids implied by a set of moving column ids.
 *
 * Connection endpoints may be sections or columns, not only segments (§8's Q42 note), so a move
 * that re-parents whole columns has to report those ids too or a column-anchored connection would
 * be missed entirely.
 */
function descendantIds(tree, movingColumnIds) {
	const columnIds = [];
	const sectionIds = [];
	const segmentIds = [];

	for (const column of tree) {
		if (!movingColumnIds.includes(column.id)) continue;
		columnIds.push(column.id);
		for (const section of column.sections) {
			sectionIds.push(section.id);
			for (const segment of section.segments) segmentIds.push(segment.id);
		}
	}

	return { columnIds, sectionIds, segmentIds };
}

/**
 * Refuse to delete a passage row that still owns structure.
 *
 * The guard exists because the consequence of being wrong is unrecoverable and invisible. If a
 * re-parent silently failed to move something, this throws and the transaction rolls back, rather
 * than letting ON DELETE CASCADE quietly take the user's columns, notes and commentary along with
 * a passage row we merely believed was empty.
 */
async function assertPassageEmpty(tx, passageId) {
	const remaining = await tx
		.select({ id: passageColumn.id })
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId));

	if (remaining.length > 0) {
		throw new Error(
			`Refusing to delete passage ${passageId}: it still owns ${remaining.length} column(s), which ON DELETE CASCADE would destroy.`
		);
	}
}

/**
 * Divide one passage's structure at `boundaryWordId`, moving the far side onto `newPassageId`.
 *
 * The new passage row must already exist — this moves structure onto it and does not create it,
 * because the range arithmetic that decides its extent is `planPartSplit()`'s job, not this one's.
 *
 * @param {Object} tx - An open transaction
 * @param {Object} params
 * @param {string} params.passageId - Passage being divided
 * @param {string} params.newPassageId - Passage receiving the far side
 * @param {string} params.boundaryWordId - First word id belonging to the new part
 * @param {string} params.newStudyId - Study id of the new part (for connection ownership)
 * @param {string|null} params.seriesId
 * @returns {Promise<{ movedColumns: number, clonedColumns: number, movedSegments: number, reownedConnections: number, straddlingConnections: Object[] }>}
 */
export async function splitPassageStructure(
	tx,
	{ passageId, newPassageId, boundaryWordId, newStudyId, seriesId }
) {
	const tree = await loadPassageTree(tx, passageId);
	const plan = planStructureSplit(tree, boundaryWordId);
	const now = new Date();

	// Ids that end up on the new passage. Whole columns contribute their whole subtree; cloned
	// columns contribute only the segments that actually move (their column and section ids are
	// NEW, so no existing connection can reference them).
	const whole = descendantIds(tree, plan.moveColumns);
	const movedSegmentIds = [...plan.movedSegmentIds];

	// 1. Whole columns: one update each carries sections and segments implicitly.
	if (plan.moveColumns.length > 0) {
		await tx
			.update(passageColumn)
			.set({ passageId: newPassageId, updatedAt: now })
			.where(inArray(passageColumn.id, plan.moveColumns));
	}

	// 2. Straddling columns: clone the container into the new passage, then re-parent only the
	//    segments past the boundary. The original keeps its own id, so everything staying behind
	//    keeps its identity — notes, commentary and connections on the near side are untouched.
	for (const clone of plan.cloneColumns) {
		const newColumnId = uuidv4();
		// ⚠️ `sections` is stripped, not spread. `clone.from` is a loaded TREE node, so it carries a
		// nested `sections` array that is not a column of `passage_column`; passing it to Drizzle's
		// insert sends a key with no matching column. Spreading the rest is deliberate — it carries
		// `width`, `leftOffset` and any future presentational field, so a split does not silently
		// restyle the user's document by rebuilding the column from defaults.
		const { sections: _columnSections, ...columnFields } = clone.from;
		await tx.insert(passageColumn).values({
			...columnFields,
			id: newColumnId,
			passageId: newPassageId,
			// The clone begins at the split, not where the original began.
			startingWordId: boundaryWordId,
			createdAt: now,
			updatedAt: now
		});

		for (const section of clone.sections) {
			const newSectionId = uuidv4();
			// Same reason as the column above: strip the nested `segments` array.
			const { segments: _sectionSegments, ...sectionFields } = section.from;
			await tx.insert(passageSection).values({
				...sectionFields,
				id: newSectionId,
				passageColumnId: newColumnId,
				// A section that began before the boundary starts, in the clone, at the boundary;
				// one that began after it keeps its own anchor.
				startingWordId:
					compareWordIds(section.from.startingWordId, boundaryWordId) < 0
						? boundaryWordId
						: section.from.startingWordId,
				createdAt: now,
				updatedAt: now
			});

			await tx
				.update(passageSegment)
				.set({ passageSectionId: newSectionId, updatedAt: now })
				.where(inArray(passageSegment.id, section.segmentIds));
		}
	}

	// 3. Connections. Loaded by endpoint (never by studyId — see loadTouchingConnections) and
	//    classified before anything is destroyed.
	const movedIds = {
		segmentIds: movedSegmentIds,
		sectionIds: whole.sectionIds,
		columnIds: whole.columnIds
	};
	const candidates = await loadTouchingConnections(tx, movedIds);
	const ownership = planConnectionOwnership(candidates, movedIds, {
		studyId: newStudyId,
		seriesId
	});

	for (const row of ownership.reown) {
		await tx
			.update(segmentConnection)
			.set({ studyId: row.studyId, seriesId: row.seriesId })
			.where(eq(segmentConnection.id, row.id));
	}

	// Straddling connections are RETURNED, not deleted. Q23's phase-2 answer is warn-then-delete,
	// and the warning has to reach the user before the delete happens — so the caller decides,
	// having been told the count. Phase 3 (edge stubs) keeps these rows instead.
	return {
		movedColumns: plan.moveColumns.length,
		clonedColumns: plan.cloneColumns.length,
		movedSegments: movedSegmentIds.length,
		reownedConnections: ownership.reown.length,
		straddlingConnections: ownership.straddling
	};
}

/**
 * Absorb one passage's structure into another, then remove the emptied passage row (Join Parts).
 *
 * ⚠️ **This is the function that would silently destroy a part's work if written in the obvious
 * order.** `planPartJoin()` coalesces two abutting ranges into ONE range, which means the absorbed
 * `passage` row goes away. Delete it first and `ON DELETE CASCADE` takes its columns, sections,
 * segments, headings, notes, commentary and connections with it — and the join reports success. So
 * the structure is re-parented first, the connections re-owned second, and the row is deleted last,
 * behind `assertPassageEmpty()`, which refuses if step one did not do what it claimed.
 *
 * `deleteEmptied` exists for the multi-passage case: when the parts do NOT coalesce (different
 * books, or a part with several passages), `planPartJoin()` keeps both passage rows and only their
 * `studyId` changes, so there is nothing to delete and nothing to guard.
 *
 * @param {Object} tx
 * @param {Object} params
 * @param {string} params.fromPassageId - Passage being absorbed
 * @param {string} params.toPassageId - Passage absorbing it
 * @param {string} params.targetStudyId - Study id of the surviving part
 * @param {string|null} params.seriesId
 * @param {boolean} [params.deleteEmptied=true] - Remove the emptied source passage row
 * @returns {Promise<{ movedColumns: number, movedSegments: number, reownedConnections: number, straddlingConnections: Object[], deletedPassage: boolean }>}
 */
export async function joinPassageStructure(
	tx,
	{ fromPassageId, toPassageId, targetStudyId, seriesId, deleteEmptied = true }
) {
	const tree = await loadPassageTree(tx, fromPassageId);
	const plan = planStructureMove(tree);
	const now = new Date();

	const moved = descendantIds(tree, plan.moveColumns);

	// 1. Re-parent every column BEFORE any delete. This is the step whose omission is silent.
	if (plan.moveColumns.length > 0) {
		await tx
			.update(passageColumn)
			.set({ passageId: toPassageId, updatedAt: now })
			.where(inArray(passageColumn.id, plan.moveColumns));
	}

	// 2. Re-own connections whose endpoints all moved; collect the ones now spanning two parts.
	const candidates = await loadTouchingConnections(tx, moved);
	const ownership = planConnectionOwnership(candidates, moved, {
		studyId: targetStudyId,
		seriesId
	});

	for (const row of ownership.reown) {
		await tx
			.update(segmentConnection)
			.set({ studyId: row.studyId, seriesId: row.seriesId })
			.where(eq(segmentConnection.id, row.id));
	}

	// 3. Only now, and only if it is genuinely empty.
	let deletedPassage = false;
	if (deleteEmptied) {
		await assertPassageEmpty(tx, fromPassageId);
		await tx.delete(passage).where(eq(passage.id, fromPassageId));
		deletedPassage = true;
	}

	return {
		movedColumns: plan.moveColumns.length,
		movedSegments: plan.movedSegmentIds.length,
		reownedConnections: ownership.reown.length,
		straddlingConnections: ownership.straddling,
		deletedPassage
	};
}

/**
 * Delete the connections a caller has decided cannot survive (Q23 phase-2 strategy (b)).
 *
 * Separate from the two operations above on purpose. Those two only ever *report* straddling
 * connections; destroying them is a distinct act that follows the user confirming a warning which
 * named the count. Keeping it a separate call is what makes "warn, then delete" expressible —
 * and what lets phase 3 replace this step with edge stubs without touching the transfer logic.
 *
 * @param {Object} tx
 * @param {string[]} connectionIds
 * @returns {Promise<number>} How many were deleted
 */
export async function deleteConnections(tx, connectionIds) {
	if (!connectionIds || connectionIds.length === 0) return 0;
	await tx.delete(segmentConnection).where(inArray(segmentConnection.id, connectionIds));
	return connectionIds.length;
}
