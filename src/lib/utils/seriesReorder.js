/**
 * # Reordering a series by RUNS (SERIES_PLAN §4, phase 3)
 *
 * §4 is emphatic: **reordering permutes runs. Parts within a run are rigid, and runs are never
 * interleaved.** A run is a maximal block of canonically contiguous parts, derived on demand by
 * `computeRuns()` — never stored, because a part delete, a split, a join and a boundary move would each
 * have to keep a stored `runId` correct.
 *
 * ## Why the unit is the run and not the part
 *
 * Because moving one part out of a contiguous block does not express anything. §4's example: "teaching
 * Romans 8 before Romans 1–7 is not a reordering. It is a differently-shaped study" — Rom 1–7 plus Rom
 * 8, which is two runs, and the *shape* carries the intent. Allowing a bare part drag would let a user
 * produce a series claiming Romans 8 sits between chapters 3 and 4, which is not a teaching order but a
 * false statement about the text.
 *
 * So a sixteen-part contiguous Romans series has exactly one run and **nothing to reorder** — §11 is
 * explicit that the UI must not offer a drag handle that can never do anything.
 *
 * @module seriesReorder
 */

import { computeRuns } from './seriesRuns.js';

/**
 * Describe a series as a list of runs, each with the parts it contains.
 *
 * The shape a reorder UI needs: something to drag, with a label, and a flag saying whether dragging is
 * meaningful at all.
 *
 * @param {Array<Object>} parts - Parts with `passages`, ordered or not
 * @returns {{ runs: Array<{ index: number, partIds: string[], firstPartId: string, title: string, partCount: number }>, reorderable: boolean }}
 */
export function describeRuns(parts) {
	const runs = computeRuns(parts).map((run, index) => ({
		index,
		partIds: run.map((part) => part.id),
		firstPartId: run[0]?.id ?? null,
		// A run is named for what it covers, which for a single-part run is just that part's title. A
		// multi-part run spans several, so it is named for its ends — "Romans 1–2 → Romans 7–8" tells the
		// user what block they are about to move in a way "Run 2" cannot.
		title:
			run.length === 1
				? (run[0]?.title ?? 'Untitled part')
				: `${run[0]?.title ?? 'Untitled'} → ${run[run.length - 1]?.title ?? 'Untitled'}`,
		partCount: run.length
	}));

	return {
		runs,
		// §11: "only meaningful for a series with 2+ runs … the UI must not offer a drag handle that can
		// never do anything."
		reorderable: runs.length > 1
	};
}

/**
 * Plan a reorder that moves the run at `fromIndex` to `toIndex`.
 *
 * Returns the new `seriesOrder` for every part whose value actually changes, so the caller writes the
 * minimum. Parts keep their relative order **within** each run: the run moves as one rigid block, which
 * is the whole point of the rule.
 *
 * ⚠️ `seriesOrder` is renumbered 0..n-1 across the whole series here, and that is NOT the "never
 * re-derive" violation it might look like. §4 forbids re-deriving the order from *canonical* order —
 * from the passage ranges — because that would silently undo a deliberate arrangement. This is the
 * user's own deliberate arrangement being written down: they asked for this permutation. The
 * distinction is between the app inventing an order and the app recording one.
 *
 * @param {Object} params
 * @param {Array<Object>} params.parts
 * @param {number} params.fromIndex - Index of the run being moved, per `describeRuns()`
 * @param {number} params.toIndex - Index it should occupy afterwards
 * @returns {{ ok: boolean, error: string|null, updates: Array<{ id: string, seriesOrder: number }>, order: string[] }}
 */
export function planRunReorder({ parts, fromIndex, toIndex }) {
	const fail = (error) => ({ ok: false, error, updates: [], order: [] });

	const runs = computeRuns(parts);
	if (runs.length < 2) {
		// Not a refusal of a legal gesture — a statement that the gesture has no meaning here. §4: every
		// part of a contiguous series is adjacent to its neighbours, so there is no permutation to make.
		return fail('This series is one continuous run, so its parts cannot be reordered.');
	}

	const from = Number(fromIndex);
	const to = Number(toIndex);
	if (!Number.isInteger(from) || !Number.isInteger(to)) return fail('Invalid run positions.');
	if (from < 0 || from >= runs.length) return fail('That run is not in this series.');
	if (to < 0 || to >= runs.length) return fail('That position is outside this series.');
	if (from === to) {
		return { ok: true, error: null, updates: [], order: runs.flat().map((p) => p.id) };
	}

	// Move the whole run, preserving the order of everything else.
	const reordered = runs.slice();
	const [moved] = reordered.splice(from, 1);
	reordered.splice(to, 0, moved);

	// Flatten back to parts and assign consecutive seriesOrder values. Runs are never interleaved, so
	// flattening in run order is exactly the arrangement the user asked for.
	const flat = reordered.flat();
	const updates = [];
	flat.forEach((part, index) => {
		if ((part.seriesOrder ?? 0) !== index) {
			updates.push({ id: part.id, seriesOrder: index });
		}
	});

	return { ok: true, error: null, updates, order: flat.map((part) => part.id) };
}
