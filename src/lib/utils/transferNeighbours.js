/**
 * # May Move Selected Up / Down run, from what the PAGE can see? (SERIES_PLAN §8)
 *
 * The client-side mirror of `itemTransfer.js`'s rule, answered against `passagesWithText` so the menu
 * can disable a dead command instead of offering it and refusing after a server round trip.
 *
 * ## ⚠️ Why this exists, having once been argued against
 *
 * The menu originally enabled both commands whenever a move was *conceivable*, deferring the real rule
 * to the server. The stated trade was "an occasional round trip for never duplicating the ordering
 * rule". That was wrong, and a screenshot settled it: the guard was `hasJoinPredecessor`, which asks
 * **"is there another segment anywhere in this study?"** — true for every selection but the first. In
 * a study of forty segments both items were live on essentially every click, including a segment
 * sitting mid-section with nowhere to go. A menu that offers a command it cannot perform is worse than
 * one extra module.
 *
 * ## The duplication is real, and here is what keeps it honest
 *
 * Two implementations of one rule drift, and silently, because each looks right alone. Three things
 * hold them together:
 *
 * 1. the refusal **sentences** come from `itemTransfer.js` (`notAtEdgeReason`, `noContainerReason`),
 *    so neither side can be reworded independently;
 * 2. `verify-transfer-agreement.mjs` runs both over identical fixtures and asserts they agree on the
 *    verdict AND the sentence, so a change to one that is not mirrored fails the build;
 * 3. this module is a **necessary** condition only. The server re-resolves everything over the full
 *    sequence and remains the authority — if the two ever disagree, the server wins and the user sees
 *    a refusal rather than a wrong write.
 *
 * ## What it cannot see, and why that is safe
 *
 * The page holds ONE part (one study). A column at its part's edge needs to know whether a
 * neighbouring part exists and whether the seam to it is contiguous — facts that live in
 * `seriesContext`, which is passed in. Sections and segments crossing into the adjacent part need the
 * same seam fact, and they can only reach it from their part's own outer edge, which is precisely what
 * `seriesContext.boundaryBefore` / `boundaryAfter` describe. So the two edges the page knows about are
 * exactly the two it needs.
 *
 * @module transferNeighbours
 */

import { notAtEdgeReason, noContainerReason } from './itemTransfer.js';

/**
 * Which tier a selection refers to. Column ⊃ Section ⊃ Segment, matching `joinNeighbours.js`.
 *
 * @param {{ columnId?: string|null, sectionId?: string|null, segmentId?: string|null }} selection
 * @returns {'column'|'section'|'segment'|null}
 */
export function resolveTier({ columnId, sectionId, segmentId }) {
	if (columnId) return 'column';
	if (sectionId) return 'section';
	if (segmentId) return 'segment';
	return null;
}

/**
 * The study's structure as flat container lists, in reading order.
 *
 * Mirrors `flattenContainers` but over `passagesWithText` (`structure.columns`) rather than a loaded
 * sequence. Order is passage display order, then the tree as it nests — the same order the server
 * produces for this study's slice.
 *
 * @param {Array<Object>} passages
 */
function flatten(passages) {
	/** @type {Array<{ id: string, sections: Array }>} */
	const columns = [];
	/** @type {Array<{ id: string, columnId: string, segments: Array }>} */
	const sections = [];

	for (const entry of passages ?? []) {
		for (const column of entry?.structure?.columns ?? []) {
			columns.push({ id: column.id, sections: column.sections ?? [] });
			for (const section of column.sections ?? []) {
				sections.push({
					id: section.id,
					columnId: column.id,
					segments: section.segments ?? []
				});
			}
		}
	}

	return { columns, sections };
}

/**
 * Is there a part before / after this one whose seam is usable?
 *
 * `boundaryBefore` / `boundaryAfter` are null for BOTH "contiguous" and "no such part", so `position`
 * and `total` must be read too — the exact ambiguity `crossPartCommands.js` was written to fix, and
 * the reason this does not simply test the boundary string.
 *
 * @param {{ position?: number, total?: number, boundaryBefore?: string|null, boundaryAfter?: string|null }|null} seriesContext
 * @param {'up'|'down'} direction
 */
function hasUsableAdjacentPart(seriesContext, direction) {
	if (!seriesContext) return false;
	const { position, total, boundaryBefore, boundaryAfter } = seriesContext;
	if (!Number.isFinite(position) || !Number.isFinite(total)) return false;

	return direction === 'up'
		? position > 1 && boundaryBefore === null
		: position < total && boundaryAfter === null;
}

/**
 * May the selected item move, and if not, why not?
 *
 * Applies the rule at whichever tier the selection names:
 *
 *   - **segment** — first/last in its SECTION, and a section exists beyond it;
 *   - **section** — first/last in its COLUMN, and a column exists beyond it;
 *   - **column**  — first/last in its PART, and a usable adjacent part exists.
 *
 * ⚠️ Fails CLOSED. No selection, no structure, or an id that cannot be found all yield "cannot move"
 * with no reason — the command is simply inert. Guessing "probably fine" while the page is
 * mid-invalidate is how a button becomes live against a stale tree.
 *
 * ⚠️ For a segment or section at the study's outer edge, the neighbouring container is in the ADJACENT
 * PART, which this page cannot see. `hasUsableAdjacentPart` stands in for it: if the seam is usable
 * there is certainly a container over there, because a part with no structure cannot be a part.
 *
 * @param {Array<Object>} passages - `passagesWithText`
 * @param {{ columnId?: string|null, sectionId?: string|null, segmentId?: string|null }} selection
 * @param {Object|null} seriesContext
 * @returns {{ tier: 'column'|'section'|'segment'|null, canMoveUp: boolean, canMoveDown: boolean, upReason: string|null, downReason: string|null }}
 */
export function resolveTransferNeighbours(passages, selection, seriesContext) {
	const inert = {
		tier: /** @type {null} */ (null),
		canMoveUp: false,
		canMoveDown: false,
		upReason: null,
		downReason: null
	};

	const tier = resolveTier(selection ?? {});
	if (!tier || !passages?.length) return inert;

	const { columns, sections } = flatten(passages);
	const activeId = selection.columnId ?? selection.sectionId ?? selection.segmentId;

	/** Resolve one direction: at the container's edge, and something beyond it. */
	const verdict = (/** @type {'up'|'down'} */ direction) => {
		if (tier === 'segment') {
			const at = sections.findIndex((s) => s.segments.some((seg) => seg.id === activeId));
			if (at === -1) return { ok: false, reason: null };

			const siblings = sections[at].segments;
			const index = siblings.findIndex((seg) => seg.id === activeId);
			const atEdge = direction === 'up' ? index === 0 : index === siblings.length - 1;
			if (!atEdge) return { ok: false, reason: notAtEdgeReason('segment', direction) };

			// A section beyond it, inside this study — or the adjacent part's, across a usable seam.
			const neighbour = direction === 'up' ? sections[at - 1] : sections[at + 1];
			if (neighbour) return { ok: true, reason: null };
			return hasUsableAdjacentPart(seriesContext, direction)
				? { ok: true, reason: null }
				: { ok: false, reason: noContainerReason('segment', direction) };
		}

		if (tier === 'section') {
			const at = sections.findIndex((s) => s.id === activeId);
			if (at === -1) return { ok: false, reason: null };

			const columnIndex = columns.findIndex((c) => c.id === sections[at].columnId);
			if (columnIndex === -1) return { ok: false, reason: null };

			const siblings = columns[columnIndex].sections;
			const index = siblings.findIndex((s) => s.id === activeId);
			const atEdge = direction === 'up' ? index === 0 : index === siblings.length - 1;
			if (!atEdge) return { ok: false, reason: notAtEdgeReason('section', direction) };

			const neighbour = direction === 'up' ? columns[columnIndex - 1] : columns[columnIndex + 1];
			if (neighbour) return { ok: true, reason: null };
			return hasUsableAdjacentPart(seriesContext, direction)
				? { ok: true, reason: null }
				: { ok: false, reason: noContainerReason('section', direction) };
		}

		// A column. Its container is the PART, so the edge test spans this whole study — every column
		// of every passage — and the only destination is another part.
		const index = columns.findIndex((c) => c.id === activeId);
		if (index === -1) return { ok: false, reason: null };

		const atEdge = direction === 'up' ? index === 0 : index === columns.length - 1;
		if (!atEdge) return { ok: false, reason: notAtEdgeReason('column', direction) };

		return hasUsableAdjacentPart(seriesContext, direction)
			? { ok: true, reason: null }
			: { ok: false, reason: noContainerReason('column', direction) };
	};

	const up = verdict('up');
	const down = verdict('down');

	return {
		tier,
		canMoveUp: up.ok,
		canMoveDown: down.ok,
		upReason: up.ok ? null : up.reason,
		downReason: down.ok ? null : down.reason
	};
}

