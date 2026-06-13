/**
 * Join Column / Join Section / Join Segment.
 *
 * Each action collapses the active structural item INTO the item immediately
 * preceding it (in startingWordId order, within the same passage):
 *
 *   - Join Segment: the active segment's words flow into the previous segment
 *     (the previous segment keeps its anchor; the active segment is deleted, so
 *     its words now belong to the previous segment, which runs until the next).
 *   - Join Section: the active section's segments re-parent to the previous
 *     section; the active section's own commentary folds into it; the now
 *     empty section is deleted.
 *   - Join Column: the active column's sections re-parent to the previous
 *     column; the active column's own commentary folds into it; the now
 *     empty column is deleted.
 *
 * "merge" (default) folds the joined item's authored content onto the target
 * using the shared fold helpers (headings fill empty slots, note/commentary
 * append, connections re-anchor). "delete" discards the joined item's OWN
 * content/connections — but structural children (a section's segments, a
 * column's sections) ALWAYS re-parent and are never lost.
 *
 * The menu guards already disable Join for the first item in a passage; the
 * server re-validates (no preceding sibling ⇒ error) as defense in depth.
 */

import {
	passage,
	study,
	passageColumn,
	passageSection,
	passageSegment,
	segmentConnection
} from '$lib/server/db/schema.js';

import { eq, inArray, asc } from 'drizzle-orm';
import { compareWordIds } from '$lib/server/db/utils.js';
import { mergedNoteWillTruncate } from '$lib/constants/notes.js';
import {
	foldSegmentContent,
	foldCommentarySubject,
	reanchorConnectionsOnto
} from '$lib/server/db/passageFold.js';

/* ------------------------------------------------------------------ */
/* Loading + context                                                   */
/* ------------------------------------------------------------------ */

/**
 * Load a passage's structure tree ordered by startingWordId.
 * @returns {Promise<Array>} columns[] each with sections[] each with segments[]
 */
async function loadTree(dbx, passageId) {
	const columns = await dbx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));
	if (columns.length === 0) return [];

	const columnIds = columns.map((c) => c.id);
	const sections = await dbx
		.select()
		.from(passageSection)
		.where(inArray(passageSection.passageColumnId, columnIds))
		.orderBy(asc(passageSection.startingWordId));

	const sectionIds = sections.map((s) => s.id);
	const segments =
		sectionIds.length > 0
			? await dbx
					.select()
					.from(passageSegment)
					.where(inArray(passageSegment.passageSectionId, sectionIds))
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

/** Flatten a tree to { segment, section, column } entries in word order. */
function flattenSegments(tree) {
	const out = [];
	for (const column of tree) {
		for (const section of column.sections) {
			for (const segment of section.segments) {
				out.push({ segment, section, column });
			}
		}
	}
	out.sort((a, b) => compareWordIds(a.segment.startingWordId, b.segment.startingWordId));
	return out;
}

/** Flatten a tree to { section, column } entries in word order. */
function flattenSections(tree) {
	const out = [];
	for (const column of tree) {
		for (const section of column.sections) {
			out.push({ section, column });
		}
	}
	out.sort((a, b) => compareWordIds(a.section.startingWordId, b.section.startingWordId));
	return out;
}

/**
 * Verify the item belongs to a passage owned by `userId`, returning the
 * resolved { studyId, passageId } plus the loaded tree.
 * @param {Object} dbx
 * @param {string} userId
 * @param {'column'|'section'|'segment'} type
 * @param {string} itemId
 */
async function loadContext(dbx, userId, type, itemId) {
	let passageId = null;

	if (type === 'column') {
		const rows = await dbx
			.select({ passageId: passageColumn.passageId })
			.from(passageColumn)
			.where(eq(passageColumn.id, itemId))
			.limit(1);
		if (rows.length) passageId = rows[0].passageId;
	} else if (type === 'section') {
		const rows = await dbx
			.select({ passageId: passageColumn.passageId })
			.from(passageSection)
			.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
			.where(eq(passageSection.id, itemId))
			.limit(1);
		if (rows.length) passageId = rows[0].passageId;
	} else if (type === 'segment') {
		const rows = await dbx
			.select({ passageId: passageColumn.passageId })
			.from(passageSegment)
			.innerJoin(passageSection, eq(passageSegment.passageSectionId, passageSection.id))
			.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
			.where(eq(passageSegment.id, itemId))
			.limit(1);
		if (rows.length) passageId = rows[0].passageId;
	}

	if (!passageId) throw new Error('Item not found');

	const owner = await dbx
		.select({ studyId: passage.studyId, userId: study.userId })
		.from(passage)
		.innerJoin(study, eq(passage.studyId, study.id))
		.where(eq(passage.id, passageId))
		.limit(1);

	if (owner.length === 0 || owner[0].userId !== userId) {
		throw new Error('Unauthorized');
	}

	return { studyId: owner[0].studyId, passageId };
}

/* ------------------------------------------------------------------ */
/* Connection-touch counting (for analyze summaries)                   */
/* ------------------------------------------------------------------ */

/** Count connections (in a study) that touch a given item. */
async function countTouchingConnections(dbx, studyId, type, itemId) {
	const conns = await dbx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));
	return conns.filter((c) => {
		if (type === 'segment') return c.fromSegmentId === itemId || c.toSegmentId === itemId;
		if (type === 'section') return c.fromSectionId === itemId || c.toSectionId === itemId;
		return c.fromColumnId === itemId || c.toColumnId === itemId;
	}).length;
}

/* ------------------------------------------------------------------ */
/* Analyze (server-side dry run that drives the confirm modal)         */
/* ------------------------------------------------------------------ */

/**
 * Determine whether joining `itemId` needs a Merge/Delete decision (i.e. it
 * carries authored content or affected connections) and summarize what would
 * be folded.
 *
 * @param {Object} dbx
 * @param {string} userId
 * @param {'column'|'section'|'segment'} type
 * @param {string} itemId
 * @returns {Promise<{ needsDecision: boolean, summary: string, hasTarget: boolean, noteWillTruncate: boolean }>}
 */
export async function analyzeJoin(dbx, userId, type, itemId) {
	const { studyId, passageId } = await loadContext(dbx, userId, type, itemId);
	const tree = await loadTree(dbx, passageId);

	const parts = [];
	let hasTarget = false;
	// True when the Quick Note that results from this merge would exceed the cap
	// and be truncated (with an ellipsis). Drives a heads-up in the confirm modal.
	// Only segment Quick Notes are capped here; section/column carry only
	// commentary, which is intentionally NOT capped.
	let noteWillTruncate = false;

	if (type === 'segment') {
		const flat = flattenSegments(tree);
		const idx = flat.findIndex((e) => e.segment.id === itemId);
		if (idx < 0) throw new Error('Segment not found');
		if (idx === 0) throw new Error('Cannot join the first segment in a passage');
		hasTarget = true;
		const seg = flat[idx].segment;
		const targetSeg = flat[idx - 1].segment;
		if (seg.headingOne || seg.headingTwo || seg.headingThree) parts.push('headings');
		if (seg.note) parts.push('note');
		if (seg.commentary) parts.push('commentary');
		// Folding appends the active note onto the target's existing note.
		noteWillTruncate = mergedNoteWillTruncate(targetSeg.note, seg.note);
	} else if (type === 'section') {
		const flat = flattenSections(tree);
		const idx = flat.findIndex((e) => e.section.id === itemId);
		if (idx < 0) throw new Error('Section not found');
		if (idx === 0) throw new Error('Cannot join the first section in a passage');
		hasTarget = true;
		const sec = flat[idx].section;
		if (sec.commentary) parts.push('commentary');
	} else if (type === 'column') {
		const idx = tree.findIndex((c) => c.id === itemId);
		if (idx < 0) throw new Error('Column not found');
		if (idx === 0) throw new Error('Cannot join the first column in a passage');
		hasTarget = true;
		const col = tree[idx];
		if (col.commentary) parts.push('commentary');
	} else {
		throw new Error('Invalid join type');
	}

	const connCount = await countTouchingConnections(dbx, studyId, type, itemId);
	if (connCount > 0) {
		// Surface that connections are affected, but not the raw count — the modal
		// just needs to convey the kind of impact, not the exact tally.
		parts.push(connCount === 1 ? 'connection' : 'connections');
	}


	return {
		needsDecision: parts.length > 0,
		summary: parts.join(', '),
		hasTarget,
		noteWillTruncate
	};
}

/* ------------------------------------------------------------------ */
/* Anchor maintenance                                                  */
/* ------------------------------------------------------------------ */

/**
 * Re-establish the invariant "every section's startingWordId equals its first
 * segment's, and every column's equals its first section's", and prune any
 * container left without children. Idempotent and safe to run after any join.
 */
async function reanchorAndPrune(tx, studyId, passageId) {
	const tree = await loadTree(tx, passageId);
	const now = new Date();

	const emptySectionIds = [];
	const emptyColumnIds = [];

	for (const column of tree) {
		const liveSections = column.sections.filter((s) => s.segments.length > 0);

		// Mark empty sections for deletion.
		for (const section of column.sections) {
			if (section.segments.length === 0) {
				emptySectionIds.push(section.id);
				continue;
			}
			// Section anchor = its first segment's anchor.
			const firstSegWord = section.segments[0].startingWordId;
			if (section.startingWordId !== firstSegWord) {
				await tx
					.update(passageSection)
					.set({ startingWordId: firstSegWord, updatedAt: now })
					.where(eq(passageSection.id, section.id));
			}
		}

		if (liveSections.length === 0) {
			emptyColumnIds.push(column.id);
			continue;
		}
		// Column anchor = its first live section's first segment.
		const sortedLive = liveSections
			.slice()
			.sort((a, b) => compareWordIds(a.segments[0].startingWordId, b.segments[0].startingWordId));
		const firstSecWord = sortedLive[0].segments[0].startingWordId;
		if (column.startingWordId !== firstSecWord) {
			await tx
				.update(passageColumn)
				.set({ startingWordId: firstSecWord, updatedAt: now })
				.where(eq(passageColumn.id, column.id));
		}
	}

	// Connections referencing removed sections/columns cascade-delete with the
	// rows, so no manual cleanup is needed here.
	if (emptySectionIds.length > 0) {
		await tx.delete(passageSection).where(inArray(passageSection.id, emptySectionIds));
	}
	if (emptyColumnIds.length > 0) {
		await tx.delete(passageColumn).where(inArray(passageColumn.id, emptyColumnIds));
	}
}

/* ------------------------------------------------------------------ */
/* Join Segment                                                        */
/* ------------------------------------------------------------------ */

/**
 * Join a segment into the segment immediately preceding it.
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} segmentId
 * @param {'merge'|'delete'} decision
 */
export async function joinSegment(dbInstance, userId, segmentId, decision = 'merge') {
	const { studyId, passageId } = await loadContext(dbInstance, userId, 'segment', segmentId);


	await dbInstance.transaction(async (tx) => {
		const tree = await loadTree(tx, passageId);
		const flat = flattenSegments(tree);
		const idx = flat.findIndex((e) => e.segment.id === segmentId);
		if (idx < 0) throw new Error('Segment not found');
		if (idx === 0) throw new Error('Cannot join the first segment in a passage');

		const active = flat[idx];
		const targetEntry = flat[idx - 1];
		const target = {
			segment: targetEntry.segment,
			section: targetEntry.section,
			column: targetEntry.column
		};

		// 1. Fold authored content (merge only).
		if (decision === 'merge') {
			await foldSegmentContent(tx, active.segment, target.segment);
		}

		// 2. Reconcile connections BEFORE deleting the segment.
		await reanchorConnectionsOnto(
			tx,
			studyId,
			[segmentId],
			[],
			[],
			target,
			decision === 'delete' ? 'delete' : 'reanchor'
		);

		// 3. Delete the active segment.
		await tx.delete(passageSegment).where(eq(passageSegment.id, segmentId));

		// 4. Re-anchor parents and prune anything left empty.
		await reanchorAndPrune(tx, studyId, passageId);
	});
}

/* ------------------------------------------------------------------ */
/* Join Section                                                        */
/* ------------------------------------------------------------------ */

/**
 * Join a section into the section immediately preceding it. The active
 * section's segments re-parent to the previous section; its own commentary/
 * connections merge or are deleted; the emptied section is removed.
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} sectionId
 * @param {'merge'|'delete'} decision
 */
export async function joinSection(dbInstance, userId, sectionId, decision = 'merge') {
	const { studyId, passageId } = await loadContext(dbInstance, userId, 'section', sectionId);


	await dbInstance.transaction(async (tx) => {
		const tree = await loadTree(tx, passageId);
		const flat = flattenSections(tree);
		const idx = flat.findIndex((e) => e.section.id === sectionId);
		if (idx < 0) throw new Error('Section not found');
		if (idx === 0) throw new Error('Cannot join the first section in a passage');

		const active = flat[idx];
		const targetEntry = flat[idx - 1];
		const target = {
			section: targetEntry.section,
			column: targetEntry.column,
			segment: targetEntry.section.segments[0] || null
		};
		const now = new Date();

		// 1. Fold the active section's own commentary (merge only).
		if (decision === 'merge') {
			await foldCommentarySubject(tx, passageSection, 'section', active.section, target.section);
		}

		// 2. Reconcile connections that point at the section itself.
		await reanchorConnectionsOnto(
			tx,
			studyId,
			[],
			[sectionId],
			[],
			target,
			decision === 'delete' ? 'delete' : 'reanchor'
		);

		// 3. Re-parent the active section's segments onto the target section
		//    (their ids are unchanged, so their own connections stay valid).
		const segIds = active.section.segments.map((s) => s.id);
		if (segIds.length > 0) {
			await tx
				.update(passageSegment)
				.set({ passageSectionId: target.section.id, updatedAt: now })
				.where(inArray(passageSegment.id, segIds));
		}

		// 4. Delete the now-empty section.
		await tx.delete(passageSection).where(eq(passageSection.id, sectionId));

		// 5. Re-anchor parents and prune anything left empty.
		await reanchorAndPrune(tx, studyId, passageId);
	});
}

/* ------------------------------------------------------------------ */
/* Join Column                                                         */
/* ------------------------------------------------------------------ */

/**
 * Join a column into the column immediately preceding it. The active column's
 * sections re-parent to the previous column; its own commentary/connections
 * merge or are deleted; the emptied column is removed.
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} columnId
 * @param {'merge'|'delete'} decision
 */
export async function joinColumn(dbInstance, userId, columnId, decision = 'merge') {
	const { studyId, passageId } = await loadContext(dbInstance, userId, 'column', columnId);


	await dbInstance.transaction(async (tx) => {
		const tree = await loadTree(tx, passageId);
		const idx = tree.findIndex((c) => c.id === columnId);
		if (idx < 0) throw new Error('Column not found');
		if (idx === 0) throw new Error('Cannot join the first column in a passage');

		const active = tree[idx];
		const targetColumn = tree[idx - 1];
		const target = {
			column: targetColumn,
			section: targetColumn.sections[0] || null,
			segment: targetColumn.sections[0]?.segments[0] || null
		};
		const now = new Date();

		// 1. Fold the active column's own commentary (merge only).
		if (decision === 'merge') {
			await foldCommentarySubject(tx, passageColumn, 'column', active, targetColumn);
		}

		// 2. Reconcile connections that point at the column itself.
		await reanchorConnectionsOnto(
			tx,
			studyId,
			[],
			[],
			[columnId],
			target,
			decision === 'delete' ? 'delete' : 'reanchor'
		);

		// 3. Re-parent the active column's sections onto the target column (their
		//    ids — and their segments' connections — are unchanged).
		const sectionIds = active.sections.map((s) => s.id);
		if (sectionIds.length > 0) {
			await tx
				.update(passageSection)
				.set({ passageColumnId: targetColumn.id, updatedAt: now })
				.where(inArray(passageSection.id, sectionIds));
		}

		// 4. Delete the now-empty column.
		await tx.delete(passageColumn).where(eq(passageColumn.id, columnId));

		// 5. Re-anchor parents and prune anything left empty.
		await reanchorAndPrune(tx, studyId, passageId);
	});
}
