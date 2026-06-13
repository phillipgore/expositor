/**
 * Shared "fold" helpers for collapsing one structural item's content onto a
 * surviving target of the same kind.
 *
 * Extracted from passageReconcile.js so that BOTH the passage reconciliation
 * engine (range edits on the Edit Study page) and the explicit Join Column /
 * Join Section / Join Segment actions use one identical implementation:
 *
 *   - Headings fill only EMPTY target slots (never overwrite).
 *   - note / commentary are appended with a newline.
 *   - tags are re-pointed onto the target, deduped by termId.
 *   - connections are re-anchored onto the target (merging into a duplicate or
 *     dropping a resulting self-loop), or deleted outright.
 *
 * `commentaryTag` rows are polymorphic with NO foreign key, so they are cleaned
 * up manually here whenever an item is removed.
 */

import {
	passageColumn,
	passageSection,
	passageSegment,
	segmentConnection,
	commentaryTag
} from '$lib/server/db/schema.js';

import { eq, and, inArray } from 'drizzle-orm';
import { truncateNote } from '$lib/constants/notes.js';

/* ------------------------------------------------------------------ */
/* Connection endpoint helpers                                         */
/* ------------------------------------------------------------------ */

/** Read one end of a connection as a {type, id} pair. */
export function connEndpoint(conn, end) {
	const type = end === 'from' ? conn.fromType : conn.toType;
	let id;
	if (type === 'segment') id = end === 'from' ? conn.fromSegmentId : conn.toSegmentId;
	else if (type === 'section') id = end === 'from' ? conn.fromSectionId : conn.toSectionId;
	else id = end === 'from' ? conn.fromColumnId : conn.toColumnId;
	return { type, id };
}

/** True when two endpoints reference the same entity. */
export function sameEndpoint(a, b) {
	return a.type === b.type && a.id === b.id;
}

/** True when two endpoint pairs are equal, ignoring direction (A↔B == B↔A). */
export function endpointsKeyEqual(a1, a2, b1, b2) {
	return (
		(sameEndpoint(a1, b1) && sameEndpoint(a2, b2)) || (sameEndpoint(a1, b2) && sameEndpoint(a2, b1))
	);
}

/** Re-point an endpoint onto its surviving merge target, if it was removed. */
export function remapEndpoint(ep, segMap, secMap, colMap) {
	if (ep.type === 'segment' && segMap.has(ep.id)) return { type: 'segment', id: segMap.get(ep.id) };
	if (ep.type === 'section' && secMap.has(ep.id)) return { type: 'section', id: secMap.get(ep.id) };
	if (ep.type === 'column' && colMap.has(ep.id)) return { type: 'column', id: colMap.get(ep.id) };
	return ep;
}

/** Build the DB column patch for one connection end ('from'|'to'). */
export function endpointColumns(end, ep) {
	const cap = end === 'from' ? 'from' : 'to';
	return {
		[`${cap}Type`]: ep.type,
		[`${cap}SegmentId`]: ep.type === 'segment' ? ep.id : null,
		[`${cap}SectionId`]: ep.type === 'section' ? ep.id : null,
		[`${cap}ColumnId`]: ep.type === 'column' ? ep.id : null
	};
}

/* ------------------------------------------------------------------ */
/* Tag helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Delete commentaryTag rows for a set of subject ids of one type.
 * @param {Object} tx
 * @param {string} subjectType - 'segment'|'section'|'column'|'connection'
 * @param {string[]} ids
 */
export async function deleteTagsFor(tx, subjectType, ids) {
	if (ids.length === 0) return;
	await tx
		.delete(commentaryTag)
		.where(and(eq(commentaryTag.subjectType, subjectType), inArray(commentaryTag.subjectId, ids)));
}

/**
 * Move all tags from one subject onto another of the same type, deduped by
 * termId. Tags whose termId already exists on the target are deleted (not
 * duplicated). Used when folding a section/column/connection into its target.
 */
export async function moveTagsDedup(tx, subjectType, fromId, toId) {
	const fromTags = await tx
		.select()
		.from(commentaryTag)
		.where(and(eq(commentaryTag.subjectType, subjectType), eq(commentaryTag.subjectId, fromId)));
	if (fromTags.length === 0) return;

	const targetTags = await tx
		.select()
		.from(commentaryTag)
		.where(and(eq(commentaryTag.subjectType, subjectType), eq(commentaryTag.subjectId, toId)));
	const existingTerms = new Set(targetTags.map((t) => t.termId));
	let order = targetTags.length;
	for (const tag of fromTags) {
		if (existingTerms.has(tag.termId)) {
			await tx.delete(commentaryTag).where(eq(commentaryTag.id, tag.id));
			continue;
		}
		await tx
			.update(commentaryTag)
			.set({ subjectId: toId, displayOrder: order++ })
			.where(eq(commentaryTag.id, tag.id));
		existingTerms.add(tag.termId);
	}
}

/* ------------------------------------------------------------------ */
/* Content fold helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Fold an orphan segment's content into a surviving target segment.
 * - Headings fill only EMPTY target slots (never overwrite).
 * - note / commentary are appended.
 * - tags are re-pointed (deduped by termId).
 *
 * Layout (`height`) is deliberately NOT carried over: layout belongs to the
 * surviving structure, so the target keeps its own height and the orphan's is
 * simply discarded.
 */
export async function foldSegmentContent(tx, fromSeg, targetSeg) {
	const set = {};
	if (!targetSeg.headingOne && fromSeg.headingOne) {
		set.headingOne = fromSeg.headingOne;
		targetSeg.headingOne = fromSeg.headingOne;
	}
	if (!targetSeg.headingTwo && fromSeg.headingTwo) {
		set.headingTwo = fromSeg.headingTwo;
		targetSeg.headingTwo = fromSeg.headingTwo;
	}
	if (!targetSeg.headingThree && fromSeg.headingThree) {
		set.headingThree = fromSeg.headingThree;
		targetSeg.headingThree = fromSeg.headingThree;
	}
	if (fromSeg.note) {
		// Quick Notes are capped; a merge that would overflow is truncated (with an
		// ellipsis) rather than silently storing an over-limit note. Commentary is
		// intentionally NOT capped, so it is appended in full below.
		const merged = targetSeg.note ? `${targetSeg.note}\n${fromSeg.note}` : fromSeg.note;
		set.note = truncateNote(merged);
		targetSeg.note = set.note;
	}
	if (fromSeg.commentary) {
		set.commentary = targetSeg.commentary
			? `${targetSeg.commentary}\n${fromSeg.commentary}`
			: fromSeg.commentary;
		targetSeg.commentary = set.commentary;
	}

	if (Object.keys(set).length > 0) {
		set.updatedAt = new Date();

		await tx.update(passageSegment).set(set).where(eq(passageSegment.id, targetSeg.id));
	}

	// Move tags from the orphan segment onto the target, deduped by termId.
	const fromTags = await tx
		.select()
		.from(commentaryTag)
		.where(eq(commentaryTag.subjectId, fromSeg.id));
	if (fromTags.length > 0) {
		const targetTags = await tx
			.select()
			.from(commentaryTag)
			.where(eq(commentaryTag.subjectId, targetSeg.id));
		const existingTerms = new Set(
			targetTags.filter((t) => t.subjectType === 'segment').map((t) => t.termId)
		);
		let order = targetTags.length;
		for (const tag of fromTags) {
			if (tag.subjectType !== 'segment') continue;
			if (existingTerms.has(tag.termId)) continue;
			await tx
				.update(commentaryTag)
				.set({ subjectId: targetSeg.id, displayOrder: order++ })
				.where(eq(commentaryTag.id, tag.id));
			existingTerms.add(tag.termId);
		}
	}
}

/**
 * Fold an orphan section/column's commentary + tags into a surviving target of
 * the same kind. Commentary is appended; tags are deduped by termId.
 */
export async function foldCommentarySubject(tx, table, subjectType, fromRow, targetRow) {
	if (fromRow.commentary) {
		const merged = targetRow.commentary
			? `${targetRow.commentary}\n${fromRow.commentary}`
			: fromRow.commentary;
		targetRow.commentary = merged;
		await tx
			.update(table)
			.set({ commentary: merged, updatedAt: new Date() })
			.where(eq(table.id, targetRow.id));
	}
	await moveTagsDedup(tx, subjectType, fromRow.id, targetRow.id);
}

/* ------------------------------------------------------------------ */
/* Connection re-anchor                                                */
/* ------------------------------------------------------------------ */

/**
 * Re-anchor or delete ALL connections touching a set of removed items, folding
 * them onto a single surviving `target` ({ segment, section, column }).
 *
 * When `connChoice` is 'reanchor' (default), each affected connection:
 *   - Re-points each end that landed on a removed segment/section/column to the
 *     surviving target of the same kind.
 *   - If both ends collapse onto the same target (self-loop), it is dropped.
 *   - If the re-anchored shape duplicates an existing connection (same unordered
 *     endpoint pair), this one's note/commentary/tags fold into that existing
 *     connection and this row is deleted (no duplicate created).
 *   - Otherwise its endpoints are updated in place.
 * When `connChoice` is 'delete' (or no surviving target exists), every affected
 * connection (and its tags) is removed outright.
 *
 * Must run BEFORE the orphan segments are deleted (so FK cascade doesn't remove
 * a connection we intend to re-anchor).
 *
 * @param {Object} tx
 * @param {string} studyId
 * @param {string[]} orphanSegIds
 * @param {string[]} orphanSectionIds
 * @param {string[]} orphanColumnIds
 * @param {Object|null} target - { segment, section, column } surviving merge target
 * @param {string} connChoice - 'reanchor' | 'delete'
 */
export async function reanchorConnectionsOnto(
	tx,
	studyId,
	orphanSegIds,
	orphanSectionIds,
	orphanColumnIds,
	target,
	connChoice = 'reanchor'
) {
	const segSet = new Set(orphanSegIds);
	const secSet = new Set(orphanSectionIds);
	const colSet = new Set(orphanColumnIds);

	const allConns = await tx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));

	const affected = allConns.filter(
		(c) =>
			(c.fromSegmentId && segSet.has(c.fromSegmentId)) ||
			(c.toSegmentId && segSet.has(c.toSegmentId)) ||
			(c.fromSectionId && secSet.has(c.fromSectionId)) ||
			(c.toSectionId && secSet.has(c.toSectionId)) ||
			(c.fromColumnId && colSet.has(c.fromColumnId)) ||
			(c.toColumnId && colSet.has(c.toColumnId))
	);
	if (affected.length === 0) return;

	// Maps from removed entity → surviving target of the same kind.
	const segMap = new Map();
	const secMap = new Map();
	const colMap = new Map();
	if (target) {
		for (const id of orphanSegIds) segMap.set(id, target.segment.id);
		for (const id of orphanSectionIds) secMap.set(id, target.section.id);
		for (const id of orphanColumnIds) colMap.set(id, target.column.id);
	}

	const affectedIds = new Set(affected.map((c) => c.id));
	// Survivor pool = connections that won't be touched, used for dedup matching.
	const survivorPool = allConns.filter((c) => !affectedIds.has(c.id));

	for (const conn of affected) {
		if (connChoice === 'delete' || !target) {
			await deleteTagsFor(tx, 'connection', [conn.id]);
			await tx.delete(segmentConnection).where(eq(segmentConnection.id, conn.id));
			continue;
		}

		const newFrom = remapEndpoint(connEndpoint(conn, 'from'), segMap, secMap, colMap);
		const newTo = remapEndpoint(connEndpoint(conn, 'to'), segMap, secMap, colMap);

		// Self-loop: both ends collapsed to the same target — meaningless, drop it.
		if (sameEndpoint(newFrom, newTo)) {
			await deleteTagsFor(tx, 'connection', [conn.id]);
			await tx.delete(segmentConnection).where(eq(segmentConnection.id, conn.id));
			continue;
		}

		// Duplicate of an existing surviving connection? Fold into it.
		const dup = survivorPool.find((s) =>
			endpointsKeyEqual(newFrom, newTo, connEndpoint(s, 'from'), connEndpoint(s, 'to'))
		);
		if (dup) {
			const set = {};
			if (conn.note) {
				// Connection Quick Notes share the same cap — truncate on overflow.
				const mergedNote = dup.note ? `${dup.note}\n${conn.note}` : conn.note;
				set.note = truncateNote(mergedNote);
			}
			if (conn.commentary) {
				set.commentary = dup.commentary ? `${dup.commentary}\n${conn.commentary}` : conn.commentary;
			}
			if (Object.keys(set).length > 0) {
				set.updatedAt = new Date();
				await tx.update(segmentConnection).set(set).where(eq(segmentConnection.id, dup.id));
				if ('note' in set) dup.note = set.note;
				if ('commentary' in set) dup.commentary = set.commentary;
			}
			await moveTagsDedup(tx, 'connection', conn.id, dup.id);
			await tx.delete(segmentConnection).where(eq(segmentConnection.id, conn.id));
			continue;
		}

		// No duplicate: re-anchor this row's endpoints in place.
		await tx
			.update(segmentConnection)
			.set({
				...endpointColumns('from', newFrom),
				...endpointColumns('to', newTo),
				updatedAt: new Date()
			})
			.where(eq(segmentConnection.id, conn.id));
		// This row now occupies its new shape — include it in the survivor pool so
		// later affected connections can dedup against it.
		survivorPool.push({
			...conn,
			...endpointColumns('from', newFrom),
			...endpointColumns('to', newTo)
		});
	}
}

/* ------------------------------------------------------------------ */
/* Summary helpers (shared by analyze paths)                           */
/* ------------------------------------------------------------------ */

/** Short human summary of a segment's authored content. */
export function summarizeSegmentContent(seg, isTagged) {
	const parts = [];
	if (seg.headingOne || seg.headingTwo || seg.headingThree) parts.push('headings');
	if (seg.note) parts.push('note');
	if (seg.commentary) parts.push('commentary');
	if (isTagged) parts.push('tags');
	// Layout (`height`) is intentionally omitted — it belongs to the surviving
	// structure and is never surfaced as authored content.
	return parts.join(', ');
}

/** Short summary of a section/column commentary subject. */
export function summarizeCommentarySubject(row, isTagged) {
	const parts = [];
	if (row.commentary) parts.push('commentary');
	if (isTagged) parts.push('tags');
	return parts.join(', ');
}

/** Short summary of a connection (endpoint kinds + any content). */
export function summarizeConnection(conn, isTagged) {
	const parts = [];
	if (conn.note) parts.push('note');
	if (conn.commentary) parts.push('commentary');
	if (isTagged) parts.push('tags');
	const content = parts.length ? `, ${parts.join(', ')}` : '';
	return `${conn.fromType} ↔ ${conn.toType}${content}`;
}

/**
 * Build a set of subjectIds that carry at least one tag of the given type.
 * @param {Object} dbx
 * @param {string} subjectType - 'segment'|'section'|'column'|'connection'
 * @param {string[]} ids
 * @returns {Promise<Set<string>>}
 */
export async function loadTaggedIds(dbx, subjectType, ids) {
	if (ids.length === 0) return new Set();
	const rows = await dbx
		.select({ subjectId: commentaryTag.subjectId })
		.from(commentaryTag)
		.where(and(eq(commentaryTag.subjectType, subjectType), inArray(commentaryTag.subjectId, ids)));
	const set = new Set();
	for (const r of rows) set.add(r.subjectId);
	return set;
}

// Re-export table refs so consumers can pass them to foldCommentarySubject.
export { passageColumn, passageSection, passageSegment, segmentConnection, commentaryTag };
