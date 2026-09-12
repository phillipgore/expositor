/**
 * # Does the current selection have something to join into?
 *
 * Join Up and Join Down fold two items together, so both are meaningless without a neighbour of the
 * same tier. This answers that question for a rendered study, and it is the rule that enables or
 * disables the two buttons.
 *
 * ## Why the `is…FirstInPassage` flags cannot answer it
 *
 * Those flags ask "does this item lead its PASSAGE?". The commands ask "does anything of this tier
 * exist before/after it AT ALL?". The two disagree in both directions, and each disagreement was a
 * real defect:
 *
 * - In a study holding two passages, the second passage's first segment sets `isFirstInPassage` even
 *   though a perfectly good predecessor sits in the passage above — Join Up was wrongly DISABLED.
 * - There were no `…LastInPassage` flags at all, so Join Down had to guess from the part index and
 *   stayed ENABLED on the very last item, deferring "Nothing follows this…" to a server refusal
 *   after the click.
 *
 * ## Scope, and what this deliberately does NOT decide
 *
 * Scope is the STUDY (one part) — the structure the page actually has. A contiguous neighbouring part
 * may still offer a cross-part join past either edge, and that allowance is layered on in
 * `MenuStructure.svelte`, which has the series context. So these flags are a *necessary* condition
 * for the command, never the whole rule, and the server stays the authority on what is reachable.
 *
 * Order is READING order: passages in display order, then the structure as it nests. That matches
 * `flattenSequence`'s order for this study's slice of the sequence, so the button's verdict and the
 * server's resolution agree about who the neighbour is.
 *
 * @module joinNeighbours
 */

/**
 * Which structural tier a selection refers to.
 *
 * Column ⊃ Section ⊃ Segment, matching how the tiers nest and how the old per-tier Join buttons
 * guarded themselves (Join Section was disabled while a column was active, so a column selection
 * already meant "column"). Returns null when nothing structural is selected.
 *
 * @param {{ columnId?: string|null, sectionId?: string|null, segmentId?: string|null }} selection
 * @returns {'column'|'section'|'segment'|null}
 */
export function resolveJoinTier({ columnId, sectionId, segmentId }) {
	if (columnId) return 'column';
	if (sectionId) return 'section';
	if (segmentId) return 'segment';
	return null;
}

/**
 * Every item id of one tier across a study, in reading order.
 *
 * @param {Array<Object>} passages - `passagesWithText`, each with `structure.columns`
 * @param {'column'|'section'|'segment'} tier
 * @returns {string[]}
 */
export function flattenTier(passages, tier) {
	const items = [];
	for (const passage of passages ?? []) {
		for (const column of passage?.structure?.columns ?? []) {
			if (tier === 'column') {
				items.push(column.id);
				continue;
			}
			for (const section of column.sections ?? []) {
				if (tier === 'section') {
					items.push(section.id);
					continue;
				}
				for (const segment of section.segments ?? []) items.push(segment.id);
			}
		}
	}
	return items;
}

/**
 * Which passage owns a structural item.
 *
 * ## ⚠️ The id is at `structure.passageId`, NOT at the top level
 *
 * `passagesWithText` entries are **not** passage rows. `fetchPassagesTextWithCache` builds a fresh
 * object per passage — `{ reference, text, fromCache }` — using the row only to build the reference
 * and write the cache, so the row's `id` is never carried through. The study layout then attaches the
 * id in a nested object: `{ ...passageText, structure: { passageId, columns } }`.
 *
 * So `entry.id` is `undefined` for every entry, always. This shipped as a live defect: the first
 * version of this lookup ended `return p.id`, which meant every join request sent `passageId:
 * undefined`. `JSON.stringify` then dropped the key entirely, and the two directions failed
 * differently — which is what made it confusing rather than obvious:
 *
 *   - **Join Down** broke loudly: it must resolve the successor before doing anything, so it hit its
 *     own "needs to know which passage" guard and said so.
 *   - **Join Up** appeared to work. `routeJoin` treats `passageId` as optional (`passageId ? … :
 *     null`), so it silently skipped the cross-part analysis and ran the within-passage join. The
 *     command was quietly incapable of joining across a passage or part boundary while looking fine.
 *
 * The silent half is the dangerous one, and it is the reason this lookup lives in a tested module
 * rather than inline in a 5,000-line component.
 *
 * Returns null when the item cannot be located — callers must treat that as "refuse", never as
 * "proceed without a passage", or they resurrect exactly the failure above.
 *
 * @param {Array<Object>} passages - `passagesWithText`
 * @param {'column'|'section'|'segment'} type
 * @param {string} id
 * @returns {string|null}
 */
export function passageIdOfItem(passages, type, id) {
	for (const entry of passages ?? []) {
		const columns = entry?.structure?.columns ?? [];
		const hit =
			type === 'column'
				? columns.some((col) => col.id === id)
				: type === 'section'
					? columns.some((col) => col.sections?.some((sec) => sec.id === id))
					: columns.some((col) =>
							col.sections?.some((sec) => sec.segments?.some((seg) => seg.id === id))
						);
		// `structure.passageId` is the real id; `entry.id` is only a fallback for a hypothetical
		// caller that passes actual passage rows, and is never what the study layout produces.
		if (hit) return entry.structure?.passageId ?? entry.id ?? null;
	}
	return null;
}

/**
 * Whether the selection has a same-tier neighbour before and after it, within this study.
 *
 * Fails CLOSED — `{ false, false }` — when nothing is selected, when the study has no structure, or
 * when the selected id is not present in it (mid-invalidate, say). Offering a join whose target
 * cannot be confirmed to exist is the one outcome worth avoiding on a destructive, undo-less command.
 *
 * @param {Array<Object>} passages - `passagesWithText`
 * @param {{ columnId?: string|null, sectionId?: string|null, segmentId?: string|null }} selection
 * @returns {{ hasPredecessor: boolean, hasSuccessor: boolean }}
 */
export function resolveJoinNeighbours(passages, selection) {
	const none = { hasPredecessor: false, hasSuccessor: false };

	const tier = resolveJoinTier(selection ?? {});
	if (!tier || !passages?.length) return none;

	const activeId = selection.columnId ?? selection.sectionId ?? selection.segmentId;
	const items = flattenTier(passages, tier);
	const index = items.indexOf(activeId);
	if (index === -1) return none;

	return {
		hasPredecessor: index > 0,
		hasSuccessor: index < items.length - 1
	};
}
