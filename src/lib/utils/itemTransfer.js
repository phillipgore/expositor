/**
 * # Move Selected Up / Down: relocating an item WITHOUT joining it (SERIES_PLAN §8)
 *
 * The five commands of §8 all destroy something. The three Joins fold one item into another and
 * delete the loser; Move Text Up/Down rewrites an anchor so words change hands. There was no way to
 * say "keep this section exactly as it is, but put it in the next column" — or in the next part.
 *
 * These two commands are that gap. **Nothing is folded, nothing is deleted, no anchor is rewritten.**
 * An item changes parent and keeps its identity, its children, its commentary and its
 * `startingWordId`.
 *
 * ## Why the destination is derived rather than chosen
 *
 * There is no `order` column on `passage_column`, `passage_section` or `passage_segment`. Order is
 * derived from `startingWordId` at load time — `passageSequence.js` issues
 * `orderBy(asc(...startingWordId))` at all three tiers and then re-sorts with `compareWordIds`. An
 * item keeps its anchor when it moves (§8: "moving a boundary requires no re-keying", because word ids
 * are globally canonical), so **where it lands inside the destination is not ours to pick** — it sorts
 * itself. Moving up, the anchor is later than everything in the destination, so it falls last; moving
 * down, earlier, so it falls first.
 *
 * That is why this module resolves only a *parent*, never a position.
 *
 * ## ⚠️ The refusal that makes the whole feature safe: only EDGE items may move
 *
 * Because extent is implicit — an item runs from its own anchor until the next anchor of its kind —
 * moving a **middle** item tears the reading order in half. Column 1 holding sections {1:1, 2:1, 3:1}
 * and column 2 holding {4:1, 5:1}: move 2:1 rightwards and the columns become {1:1, 3:1} and
 * {2:1, 4:1, 5:1}, which reads 1, 3, 2, 4, 5. Both columns now claim overlapping extents.
 *
 * Nothing downstream catches this. `reanchor.js` will happily re-anchor column 1 to 1:1 and column 2
 * to 2:1 and report success, because each column is internally consistent; only the *relationship*
 * between them is broken. So the refusal has to live here, at the front, and it is the single rule
 * this module exists to enforce:
 *
 *   **Only the FIRST item of a container may move backwards, and only the LAST may move forwards.**
 *
 * ## Two tiers of destination, resolved in a fixed order
 *
 * A section sitting at the start of column 2 has an adjacent column to move into. The same section at
 * the start of column 1 does not — but it may still have a previous *part*. One pair of buttons serves
 * both, so the precedence must be decided once, here, rather than per caller:
 *
 *   **column-adjacency first; part-adjacency only when no adjacent column exists.**
 *
 * The nearer container wins. The alternative — preferring the part — would send a section across a
 * study boundary while an empty-handed column sat right beside it, which is never what "move it up"
 * means when there is visibly something directly above.
 *
 * ⚠️ A **column** has no containing column, so a column move is always a part move. That is not a
 * special case bolted on; it falls out of "column-adjacency first" finding nothing.
 *
 * @module itemTransfer
 */

import { compareWordIds } from './wordIds.js';

/**
 * The sections of a column, in canonical order.
 *
 * Sorted with `compareWordIds` rather than trusting the array as given: `passageSequence.js` does sort
 * before handing the tree over, but this module's whole job is deciding what is FIRST and what is
 * LAST, and resting that on a caller's ordering is how the edge test silently starts answering about
 * the wrong item.
 */
function sectionsOf(column) {
	return (column?.sections ?? [])
		.slice()
		.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
}

/** The segments of a section, in canonical order. */
function segmentsOf(section) {
	return (section?.segments ?? [])
		.slice()
		.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
}

/** The columns of one passage tree, in canonical order. */
function columnsOf(tree) {
	return (tree ?? []).slice().sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
}

/**
 * Locate an item in one passage's tree, with the containers and sibling list around it.
 *
 * Returns null when the item is not in this tree — the caller distinguishes "not here" from "here but
 * ineligible", and conflating them would report a missing item as a boundary problem.
 *
 * @param {Array} tree
 * @param {'segment'|'section'|'column'} granularity
 * @param {string} itemId
 */
export function locateItem(tree, granularity, itemId) {
	const columns = columnsOf(tree);

	if (granularity === 'column') {
		const index = columns.findIndex((c) => c.id === itemId);
		if (index === -1) return null;
		return { item: columns[index], index, siblings: columns, column: null, section: null };
	}

	for (const column of columns) {
		const sections = sectionsOf(column);

		if (granularity === 'section') {
			const index = sections.findIndex((s) => s.id === itemId);
			if (index === -1) continue;
			return { item: sections[index], index, siblings: sections, column, section: null };
		}

		for (const section of sections) {
			const segments = segmentsOf(section);
			const index = segments.findIndex((s) => s.id === itemId);
			if (index === -1) continue;
			return { item: segments[index], index, siblings: segments, column, section };
		}
	}

	return null;
}

/**
 * Is this item at the edge of its container, in the direction it wants to travel?
 *
 * The ordering rule above, as a predicate. `'up'` requires first-in-container; `'down'` requires last.
 *
 * @param {{ index: number, siblings: Array }} located
 * @param {'up'|'down'} direction
 */
export function isAtContainerEdge(located, direction) {
	if (!located) return false;
	return direction === 'up' ? located.index === 0 : located.index === located.siblings.length - 1;
}
/**
 * Resolve where an item should go, within ONE passage.
 *
 * Answers the cheap half of the question — is there an adjacent container in this passage to take
 * it? — without consulting any series context. A `kind` of `'none'` means the caller should fall back
 * to the part tier; `'blocked'` is a refusal that no fallback may override.
 *
 * ⚠️ Segments and sections resolve differently, and the difference is not cosmetic. A **section**
 * moves into the adjacent COLUMN (its parent's neighbour). A **segment** moves into the adjacent
 * SECTION, which is usually its parent's neighbour *within the same column* — a segment has a nearer
 * neighbour than a section does, and skipping straight to the column tier would jump it over a section
 * sitting immediately beside it.
 *
 * @param {Array} tree - One passage's column tree
 * @param {'segment'|'section'|'column'} granularity
 * @param {string} itemId
 * @param {'up'|'down'} direction
 * @returns {{ kind: 'within'|'none'|'blocked', reason: string|null, targetColumn: Object|null, targetSection: Object|null }}
 */
export function resolveWithinPassage(tree, granularity, itemId, direction) {
	const nowhere = (kind, reason = null) => ({
		kind,
		reason,
		targetColumn: null,
		targetSection: null
	});

	const located = locateItem(tree, granularity, itemId);
	if (!located) return nowhere('none');

	// The ordering refusal, applied before anything else. A middle item has a perfectly good neighbour
	// in both tiers and must still be refused, so this cannot be folded into the searches below.
	if (!isAtContainerEdge(located, direction)) {
		return nowhere(
			'blocked',
			direction === 'up'
				? `Only the first ${granularity} of its group can move up, or it would end up out of reading order.`
				: `Only the last ${granularity} of its group can move down, or it would end up out of reading order.`
		);
	}

	// A column's container is the passage itself, so there is no nearer neighbour than the next part.
	if (granularity === 'column') return nowhere('none');

	const columns = columnsOf(tree);

	if (granularity === 'section') {
		const columnIndex = columns.findIndex((c) => c.id === located.column?.id);
		const neighbour = columns[direction === 'up' ? columnIndex - 1 : columnIndex + 1];
		if (!neighbour) return nowhere('none');
		return { kind: 'within', reason: null, targetColumn: neighbour, targetSection: null };
	}

	// A segment: the adjacent SECTION, searched across the whole passage in canonical order so the
	// neighbour may live in the next column when the segment sits at its column's edge too.
	const flatSections = [];
	for (const column of columns) {
		for (const section of sectionsOf(column)) flatSections.push({ section, column });
	}
	const at = flatSections.findIndex((entry) => entry.section.id === located.section?.id);
	const neighbour = flatSections[direction === 'up' ? at - 1 : at + 1];
	if (!neighbour) return nowhere('none');

	return {
		kind: 'within',
		reason: null,
		targetColumn: neighbour.column,
		targetSection: neighbour.section
	};
}

/**
 * Where an item lands in a DIFFERENT passage's tree.
 *
 * The destination container is always the destination's outermost edge in the direction travelled:
 * moving up, the last column (and its last section); moving down, the first column (and its first
 * section). Anything else would put the arriving item out of order, since its anchor is by
 * construction beyond every anchor in the destination.
 *
 * Returns nulls for a column move — a column needs no parent beyond the passage — and for an empty
 * destination tree, which the caller treats as a refusal, because a part with no structure has nowhere
 * to put a section.
 *
 * @param {Array} tree - The DESTINATION passage's column tree
 * @param {'segment'|'section'|'column'} granularity
 * @param {'up'|'down'} direction
 */
export function resolveIntoPassage(tree, granularity, direction) {
	const columns = columnsOf(tree);
	if (granularity === 'column' || columns.length === 0) {
		return { targetColumn: null, targetSection: null };
	}

	const column = direction === 'up' ? columns[columns.length - 1] : columns[0];
	if (granularity === 'section') return { targetColumn: column, targetSection: null };

	const sections = sectionsOf(column);
	if (sections.length === 0) return { targetColumn: column, targetSection: null };

	const section = direction === 'up' ? sections[sections.length - 1] : sections[0];
	return { targetColumn: column, targetSection: section };
}

/**
 * Would moving this item empty its passage of all structure?
 *
 * `boundaryMove.js` already refuses a range change that empties a part, but it can only see ranges. A
 * transfer that takes the passage's ONLY column leaves a part with no structure at all while its verse
 * range is still perfectly valid — invisible to that check, so it is asked here.
 *
 * §8's rule for the Joins applies unchanged: emptying a part is Join Parts, a different command with
 * its own confirmation and its own deletion, and performing it under this name would remove a part the
 * user did not ask to lose.
 *
 * ⚠️ Takes no item id, deliberately. The question is "does this passage hold exactly ONE item of this
 * tier?" — if it does, and the caller has already located the item here, that item is necessarily the
 * one. An id parameter would imply a per-item test that is not being made, which is worse than no
 * parameter at all.
 *
 * @param {Array} tree
 * @param {'segment'|'section'|'column'} granularity
 */
export function wouldEmptyPassage(tree, granularity) {
	const columns = columnsOf(tree);
	if (columns.length === 0) return false;

	if (granularity === 'column') return columns.length === 1;

	let sectionCount = 0;
	let segmentCount = 0;
	for (const column of columns) {
		for (const section of sectionsOf(column)) {
			sectionCount += 1;
			segmentCount += segmentsOf(section).length;
		}
	}

	if (granularity === 'section') return sectionCount === 1;
	return segmentCount === 1;
}

