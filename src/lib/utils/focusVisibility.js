/**
 * # Focus mode: what stays visible, and which edits are safe
 *
 * Focus hides everything except the focused items and their containers/children. The page
 * keeps three Sets (visible column / section / segment ids) and hides every rendered item not
 * in them. Once the user can EDIT while focused, two questions follow. Both are pure functions
 * here so `verify-focus-mode.mjs` can run them:
 *
 * 1. `syncFocusVisibility`: after a structure edit reloads the study, which ids are visible?
 *    The Sets were computed when Focus started, so an item created by an edit (the tail of a
 *    split) is not in them and would vanish the moment it was made.
 * 2. `resolveFocusBlocks`: which structure commands would act on something HIDDEN? Join folds
 *    into the same-tier neighbour, Move Item lands in the adjacent container, Move Text pushes
 *    words into the adjacent segment. A hidden target means an invisible change, so it is blocked.
 *
 * Both walk the study in READING order (passages, then columns ⊃ sections ⊃ segments), the
 * order `joinNeighbours.js` / `transferNeighbours.js` and the server use, so "the neighbour"
 * means the same item everywhere.
 *
 * @module focusVisibility
 */

import { flattenTier } from './joinNeighbours.js';

/**
 * @typedef {{ columns: Set<string>, sections: Set<string>, segments: Set<string> }} IdSets
 */

/**
 * Every structural id in a study, by tier.
 * @param {Array<any>|null|undefined} passages - `passagesWithText`
 * @returns {IdSets}
 */
export function collectStructureIds(passages) {
	return {
		columns: new Set(flattenTier(passages, 'column')),
		sections: new Set(flattenTier(passages, 'section')),
		segments: new Set(flattenTier(passages, 'segment'))
	};
}

/**
 * Rebuild the Focus visible Sets against a (possibly edited) structure.
 *
 * - An existing segment stays visible if it was.
 * - A BRAND-NEW segment (not in `known`) is visible when its nearest PRE-EXISTING container is:
 *   its section; or, if that section is new too (Split Section), its column; or, if the column
 *   is new too (Split Column), the pre-existing column right before it in reading order (the
 *   one it was split from).
 * - A section / column is visible exactly when it contains a visible segment. Split Section /
 *   Split Column move EXISTING segments (same ids) into the new container, so it becomes visible
 *   through them. Ids absorbed by a join no longer appear and drop out.
 *
 * @param {Array<any>|null|undefined} passages - `passagesWithText` after the edit
 * @param {IdSets} visible - the visible Sets before the edit
 * @param {IdSets} known - every id that existed before the edit
 * @returns {{ visible: IdSets, known: IdSets }} the new visible Sets, and the new `known`
 */
export function syncFocusVisibility(passages, visible, known) {
	/** @type {IdSets} */
	const next = { columns: new Set(), sections: new Set(), segments: new Set() };
	/** @type {IdSets} */
	const all = { columns: new Set(), sections: new Set(), segments: new Set() };
	let prevKnownColumnVisible = false;

	for (const passage of passages ?? []) {
		for (const column of passage?.structure?.columns ?? []) {
			all.columns.add(column.id);
			const columnIsNew = !known.columns.has(column.id);
			const columnVisible = columnIsNew ? prevKnownColumnVisible : visible.columns.has(column.id);
			if (!columnIsNew) prevKnownColumnVisible = columnVisible;

			for (const section of column.sections ?? []) {
				all.sections.add(section.id);
				const sectionVisible = known.sections.has(section.id)
					? visible.sections.has(section.id)
					: columnVisible;

				for (const segment of section.segments ?? []) {
					all.segments.add(segment.id);
					const isNewAndInherits = !known.segments.has(segment.id) && sectionVisible;
					if (visible.segments.has(segment.id) || isNewAndInherits) {
						next.segments.add(segment.id);
						next.sections.add(section.id);
						next.columns.add(column.id);
					}
				}
			}
		}
	}
	return { visible: next, known: all };
}

/**
 * @typedef {Object} FocusBlocks
 * @property {boolean} joinUp
 * @property {boolean} joinDown
 * @property {boolean} moveUp
 * @property {boolean} moveDown
 * @property {boolean} moveTextUp
 * @property {boolean} moveTextDown
 */

/** @returns {FocusBlocks} */
export function noFocusBlocks() {
	return {
		joinUp: false,
		joinDown: false,
		moveUp: false,
		moveDown: false,
		moveTextUp: false,
		moveTextDown: false
	};
}

/**
 * Which structure commands would act on a hidden item, for the current selection.
 *
 * Tier precedence is Column ⊃ Section ⊃ Segment, as in `resolveJoinTier`. A column's Move Item
 * container is the part, which Focus never hides, so column moves are never blocked. A missing
 * neighbour (first/last item) is not a Focus block; the command is already disabled for that.
 *
 * @param {Array<any>|null|undefined} passages - `passagesWithText`
 * @param {IdSets} visible - the Focus visible Sets
 * @param {{ columnId?: string|null, sectionId?: string|null, segmentId?: string|null }} selection - first selected item per tier
 * @param {string|null} caretSegmentId - segment holding the word caret (Move Text), or null
 * @returns {FocusBlocks}
 */
export function resolveFocusBlocks(passages, visible, selection, caretSegmentId) {
	const blocks = noFocusBlocks();
	/** @param {'column'|'section'|'segment'} tier @param {string} id */
	const isVisible = (tier, id) =>
		tier === 'column'
			? visible.columns.has(id)
			: tier === 'section'
				? visible.sections.has(id)
				: visible.segments.has(id);

	const { columnId = null, sectionId = null, segmentId = null } = selection;
	/** @type {'column'|'section'|'segment'|null} */
	const tier = columnId ? 'column' : sectionId ? 'section' : segmentId ? 'segment' : null;

	if (tier) {
		const id = /** @type {string} */ (columnId ?? sectionId ?? segmentId);
		const items = flattenTier(passages, tier);
		const at = items.indexOf(id);
		if (at > 0) blocks.joinUp = !isVisible(tier, items[at - 1]);
		if (at !== -1 && at < items.length - 1) blocks.joinDown = !isVisible(tier, items[at + 1]);

		if (tier !== 'column') {
			const containerTier = tier === 'segment' ? 'section' : 'column';
			const containers = flattenTier(passages, containerTier);
			const parent = parentOf(passages, tier, id);
			const pAt = parent ? containers.indexOf(parent) : -1;
			if (pAt > 0) blocks.moveUp = !isVisible(containerTier, containers[pAt - 1]);
			if (pAt !== -1 && pAt < containers.length - 1)
				blocks.moveDown = !isVisible(containerTier, containers[pAt + 1]);
		}
	}

	if (caretSegmentId) {
		const segs = flattenTier(passages, 'segment');
		const at = segs.indexOf(caretSegmentId);
		if (at > 0) blocks.moveTextUp = !visible.segments.has(segs[at - 1]);
		if (at !== -1 && at < segs.length - 1)
			blocks.moveTextDown = !visible.segments.has(segs[at + 1]);
	}

	return blocks;
}

/**
 * The containing section (of a segment) or column (of a section).
 * @param {Array<any>|null|undefined} passages
 * @param {'section'|'segment'} tier
 * @param {string} id
 * @returns {string|null}
 */
function parentOf(passages, tier, id) {
	for (const passage of passages ?? []) {
		for (const column of passage?.structure?.columns ?? []) {
			for (const section of column.sections ?? []) {
				if (tier === 'section' && section.id === id) return column.id;
				if (
					tier === 'segment' &&
					(section.segments ?? []).some((/** @type {{ id: string }} */ s) => s.id === id)
				)
					return section.id;
			}
		}
	}
	return null;
}
