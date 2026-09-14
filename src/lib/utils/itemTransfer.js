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
 * ## One rule, three tiers
 *
 * Each tier moves into **its own container's sibling**, and never into a different kind of container:
 *
 * | Selected | Container      | Lands in the adjacent |
 * | -------- | -------------- | --------------------- |
 * | Segment  | its Section    | **Section**           |
 * | Section  | its Column     | **Column**            |
 * | Column   | its Series Part| **Part**              |
 *
 * The adjacency is resolved over the **whole sequence in reading order**, not within one passage. So
 * the neighbouring container may sit in the same passage, in another passage of the same part, or in
 * an adjacent part — and the command does not care which. A section whose column is the last of part A
 * moves into part B's first column because that column is the next one in reading order, not because
 * "part" is a second tier to fall back to. There is no fallback and no precedence: there is one search.
 *
 * ⚠️ An earlier version resolved this in two tiers — "adjacent column first, adjacent part otherwise" —
 * and that was wrong twice over. It let a section land in a container chosen by *part* rather than by
 * reading order, and it made the tiers inconsistent with each other. One search removes both.
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
 * between them is broken. So the refusal has to live here, at the front:
 *
 *   **Only the FIRST item of a container may move backwards, and only the LAST may move forwards.**
 *
 * ## Reading order is the invariant, and it holds for free at a part seam
 *
 * Reading order across a part boundary is **total**: every item of part A precedes every item of part
 * B. So the container adjacent to part A's last item is necessarily part B's *first* container — at
 * part B's outer edge, never in its middle. "Adjacent in reading order" and "at the receiving part's
 * edge" name the same position there, so the cross-part case needs no special handling at any tier.
 *
 * @module itemTransfer
 */

import { compareWordIds } from './wordIds.js';

/**
 * What each tier moves BETWEEN, for refusal messages.
 *
 * Named here rather than inlined so the three messages cannot drift apart, and so the rule is legible
 * in one place: a segment moves between sections, a section between columns, a column between parts.
 */
export const CONTAINER_OF = {
	segment: 'section',
	section: 'column',
	column: 'part'
};

/**
 * The two refusals, as ONE definition shared by the server and the menu.
 *
 * ## ⚠️ Why these are exported rather than written twice
 *
 * The enablement rule now runs in two places: here, authoritatively, over the full sequence; and in
 * `transferNeighbours.js`, over the rendered study, so the menu can disable a command instead of
 * offering it and refusing after a round trip. That duplication is deliberate but it is also the
 * feature's main ongoing risk — two copies of one rule drift, and the drift is silent because each
 * copy looks right on its own.
 *
 * Sharing the *sentences* does not prevent the logic drifting, but it removes the cheapest way for it
 * to happen (someone rewording one side), and it lets `verify-transfer-agreement.mjs` compare the two
 * implementations on identical fixtures by simple string equality.
 *
 * @param {'segment'|'section'|'column'} granularity
 * @param {'up'|'down'} direction
 */
export function notAtEdgeReason(granularity, direction) {
	const container = CONTAINER_OF[granularity];
	return direction === 'up'
		? `Only the first ${granularity} in a ${container} can be moved up. Moving this one would put it out of reading order.`
		: `Only the last ${granularity} in a ${container} can be moved down. Moving this one would put it out of reading order.`;
}

/**
 * The refusal for "you are at your container's edge, but there is no container beyond it".
 *
 * @param {'segment'|'section'|'column'} granularity
 * @param {'up'|'down'} direction
 */
export function noContainerReason(granularity, direction) {
	const container = CONTAINER_OF[granularity];
	return direction === 'up'
		? `There is no ${container} before this one to move the ${granularity} into.`
		: `There is no ${container} after this one to move the ${granularity} into.`;
}


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
 * Every container of the given tier's PARENT kind, across the whole sequence, in reading order.
 *
 * This is the list adjacency is resolved against, and it is what makes the three tiers one rule. For a
 * section the containers are columns; for a segment they are sections; for a column they are **parts**,
 * which are not rows at all but groups of passages sharing a `studyId`.
 *
 * ⚠️ Order follows the SEQUENCE, never a global anchor sort. `passageSequence.js` orders passages by
 * part position then `displayOrder`, and §4 forbids re-deriving a user's arrangement from canonical
 * order — a series deliberately teaching Romans 8 first must keep that arrangement. Within a passage
 * the tree is already anchor-sorted by the loader, and `columnsOf`/`sectionsOf` re-sort defensively.
 *
 * @param {Array<{ passageId: string, studyId: string, tree: Array }>} sequence
 * @param {'segment'|'section'|'column'} granularity - The tier being MOVED, not the container tier
 * @returns {Array<{ id: string, kind: 'section'|'column'|'part', passageIndex: number, studyId: string, item: Object|null, passageIds: string[], column?: Object }>}
 */
export function flattenContainers(sequence, granularity) {
	const out = [];

	if (granularity === 'column') {
		// A column's container is its PART. Consecutive sequence entries sharing a studyId are one
		// part; a part may hold several passages, so this groups rather than maps one-to-one.
		(sequence ?? []).forEach((entry, passageIndex) => {
			const last = out[out.length - 1];
			if (last && last.studyId === entry.studyId) {
				last.passageIds.push(entry.passageId);
				return;
			}
			out.push({
				id: entry.studyId,
				kind: /** @type {'part'} */ ('part'),
				passageIndex,
				studyId: entry.studyId,
				item: null,
				passageIds: [entry.passageId]
			});
		});
		return out;
	}

	(sequence ?? []).forEach((entry, passageIndex) => {
		for (const column of columnsOf(entry?.tree)) {
			if (granularity === 'section') {
				out.push({
					id: column.id,
					kind: /** @type {'column'} */ ('column'),
					passageIndex,
					studyId: entry.studyId,
					item: column,
					passageIds: [entry.passageId]
				});
				continue;
			}
			for (const section of sectionsOf(column)) {
				out.push({
					id: section.id,
					kind: /** @type {'section'} */ ('section'),
					passageIndex,
					studyId: entry.studyId,
					item: section,
					passageIds: [entry.passageId],
					column
				});
			}
		}
	});

	return out;
}

/**
 * Locate an item anywhere in the sequence, with its own container identified.
 *
 * @param {Array} sequence
 * @param {'segment'|'section'|'column'} granularity
 * @param {string} itemId
 */
export function locateInSequence(sequence, granularity, itemId) {
	for (let passageIndex = 0; passageIndex < (sequence ?? []).length; passageIndex += 1) {
		const entry = sequence[passageIndex];
		const located = locateItem(entry?.tree, granularity, itemId);
		if (!located) continue;

		// Which container does this item belong to? The answer names the tier it moves between.
		const containerId =
			granularity === 'segment'
				? located.section?.id
				: granularity === 'section'
					? located.column?.id
					: entry.studyId;


		return { ...located, passageIndex, entry, containerId };
	}
	return null;
}

/**
 * Is this column the first or last of its whole PART, not merely of its passage?
 *
 * A part may hold several passages (§5's part-per-passage strategy), and its columns run across all of
 * them in sequence order. So the edge question has to be asked against that concatenation — which is
 * exactly what `flattenContainers(sequence, 'section')` already produces, since the containers a
 * SECTION moves between are columns, in reading order across the sequence.
 *
 * Reusing that list rather than rebuilding one is deliberate: two orderings of the same columns is two
 * places for reading order to be defined, and they would eventually disagree.
 *
 * @param {Array} sequence
 * @param {{ item: Object, entry: Object }} located
 * @param {'up'|'down'} direction
 */
function isColumnAtPartEdge(sequence, located, direction) {
	const columns = flattenContainers(sequence, 'section').filter(
		(c) => c.studyId === located.entry.studyId
	);
	const at = columns.findIndex((c) => c.id === located.item.id);
	if (at === -1) return false;
	return direction === 'up' ? at === 0 : at === columns.length - 1;
}

/**
 * Where does this item go, and may it go there?
 *
 * The single entry point, replacing the old two-tier pair. It asks exactly the rule:
 *
 *   1. is the item at the edge of its own container, in the direction of travel?
 *   2. is there an adjacent container of the same kind, anywhere in reading order?
 *
 * Both must hold. Neither is a fallback for the other — a middle item with a perfectly good
 * neighbouring container is still refused, because moving it would break reading order.
 *
 * ## What the caller gets, and why `crossesPassage` is the interesting flag
 *
 * The destination is named as ids, plus `crossesPassage` — whether the item changes PASSAGE, which is
 * what decides if verse ranges must shift, `cachedText` must clear and display limits must be
 * re-checked. That is a property of the move, **not of the tier**: a section moving between two columns
 * of the same passage moves no verses, while a section moving into the next part's column moves plenty.
 * Keying that off granularity (as the old two-tier code effectively did) gets it wrong in both
 * directions.
 *
 * @param {Object} params
 * @param {Array<{ passageId: string, studyId: string, tree: Array }>} params.sequence
 * @param {'segment'|'section'|'column'} params.granularity
 * @param {string} params.itemId
 * @param {'up'|'down'} params.direction
 * @returns {{ ok: boolean, reason: string|null, targetColumnId: string|null, targetSectionId: string|null, targetPassageId: string|null, targetStudyId: string|null, targetPassageIndex: number|null, sourcePassageIndex: number|null, crossesPassage: boolean, crossesPart: boolean }}
 */
export function resolveTransfer({ sequence, granularity, itemId, direction }) {
	const fail = (reason) => ({
		ok: false,
		reason,
		targetColumnId: null,
		targetSectionId: null,
		targetPassageId: null,
		targetStudyId: null,
		targetPassageIndex: null,
		sourcePassageIndex: null,
		crossesPassage: false,
		crossesPart: false
	});

	const located = locateInSequence(sequence, granularity, itemId);
	if (!located) return fail(`That ${granularity} could not be found.`);

	// (1) The reading-order refusal, first and unconditionally.
	//
	// ⚠️ For a COLUMN the edge test must span the whole PART, not one passage. `locateItem` reports the
	// item's index among its own passage's columns, so a part holding two passages would call the
	// second passage's only column "index 0 of 1" — first AND last — and let it move in both
	// directions while a column of the same part sat beside it. Caught by the multi-passage case in
	// `verify-item-transfer.mjs`; the other two tiers are unaffected because a section's column and a
	// segment's section never span passages.
	const atEdge =
		granularity === 'column'
			? isColumnAtPartEdge(sequence, located, direction)
			: isAtContainerEdge(located, direction);

	if (!atEdge) {
		return fail(notAtEdgeReason(granularity, direction));
	}

	// (2) Is there an adjacent container of the same kind?
	const containers = flattenContainers(sequence, granularity);
	const at = containers.findIndex((c) => c.id === located.containerId);
	if (at === -1) return fail(`That ${granularity}'s position could not be resolved.`);

	const target = containers[direction === 'up' ? at - 1 : at + 1];
	if (!target) {
		return fail(noContainerReason(granularity, direction));
	}

	// Where inside the target does it land? Reading order decides, and at a part seam that is always
	// the target's outer edge — see the module header. For a column the target IS a part, so the
	// landing passage is that part's first or last.
	let targetPassageIndex;
	let targetColumnId = null;
	let targetSectionId = null;

	if (granularity === 'column') {
		// Moving up lands in the part's LAST passage; moving down, its first.
		const passageIds = target.passageIds;
		const landingPassageId = direction === 'up' ? passageIds[passageIds.length - 1] : passageIds[0];
		targetPassageIndex = sequence.findIndex((e) => e.passageId === landingPassageId);
	} else if (granularity === 'section') {
		targetColumnId = target.id;
		targetPassageIndex = target.passageIndex;
	} else {
		targetSectionId = target.id;
		targetColumnId = target.column?.id ?? null;
		targetPassageIndex = target.passageIndex;
	}

	const targetEntry = sequence[targetPassageIndex];
	const sourceEntry = sequence[located.passageIndex];

	return {
		ok: true,
		reason: null,
		targetColumnId,
		targetSectionId,
		targetPassageId: targetEntry?.passageId ?? null,
		targetStudyId: targetEntry?.studyId ?? null,
		targetPassageIndex,
		sourcePassageIndex: located.passageIndex,
		crossesPassage: targetPassageIndex !== located.passageIndex,
		crossesPart: targetEntry?.studyId !== sourceEntry?.studyId
	};
}

/**
 * Would moving this item empty its passage of all structure?
 *
 * `boundaryMove.js` already refuses a range change that empties a part, but it can only see ranges. A
 * transfer that takes the passage’s ONLY column leaves a part with no structure at all while its verse
 * range is still perfectly valid — invisible to that check, so it is asked here.
 *
 * ⚠️ Takes no item id, deliberately. The question is "does this passage hold exactly ONE item of this
 * tier?" — if it does, and the caller has already located the item here, that item is necessarily the
 * one.
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

