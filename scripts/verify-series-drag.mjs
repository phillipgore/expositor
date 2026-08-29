/**
 * Verify the two phase-3 drag affordances are actually WIRED (SERIES_PLAN §11).
 *
 * ## Why this is a static scan and not a unit test
 *
 * Both affordances are pointer gestures inside `.svelte` components driven by runes, so there is no
 * headless seam to call. The pure layers underneath them are already verified elsewhere —
 * `verify-series-reorder.mjs` owns the permutation and `verify-series-membership.mjs` owns the
 * invariants — and duplicating those here would prove nothing new.
 *
 * What was NOT covered is the failure this feature actually suffered from: an endpoint that is
 * verified, mutation-tested and unreachable, because the gesture on top of it was never connected.
 * SERIES_PLAN said so in as many words — "the endpoint exists; the drag GESTURE is not wired" — and
 * nothing in `npm run verify` could tell the difference. That is the same silent class as
 * `iconId="sort"`: correct code, no user path to it, every gate green.
 *
 * So this asserts the connections, and each check names the specific breakage it would catch.
 *
 * Run: node scripts/verify-series-drag.mjs
 */

import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;

function assert(label, condition) {
	if (condition) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}

/** Source with comments stripped, so prose describing a wire cannot be mistaken for the wire. */
const live = (path) =>
	readFileSync(path, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/^\s*\/\/.*$/gm, '');

const dragDrop = live('src/lib/composables/useDragAndDrop.svelte.js');
const panel = live('src/lib/componentWidgets/StudiesPanel.svelte');
const seriesRow = live('src/lib/componentWidgets/studies/StudySeries.svelte');
const groupRow = live('src/lib/componentWidgets/studies/StudyGroup.svelte');
const reorderModal = live('src/lib/componentWidgets/modals/ReorderRunsModal.svelte');
const addModal = live('src/lib/componentWidgets/modals/AddToSeriesModal.svelte');

console.log('\n── Add-to-series drag: the gesture reaches the endpoint (Q17) ──');

// The chain, link by link. Any one of these missing leaves a drop that appears to work and does nothing.
assert(
	'the composable tracks a series drop target',
	dragDrop.includes('dropTargetSeriesId') && dragDrop.includes('get dropTargetSeriesId()')
);
assert(
	'it matches the series row by the attribute StudySeries actually renders',
	dragDrop.includes('.series-section[data-series-id]') &&
		seriesRow.includes('data-series-id={series.id}')
);
assert('mouseup on a series calls the drop callback', dragDrop.includes('onDropOnSeries?.('));
assert(
	'the panel supplies that callback and records the pending drop',
	panel.includes('useDragAndDrop(') && panel.includes('pendingSeriesDrop = { study, seriesId }')
);
assert(
	'the panel renders the confirmation with the dropped target preselected',
	panel.includes('<AddToSeriesModal') &&
		panel.includes('fixedSeriesId={pendingSeriesDrop.seriesId}')
);
assert(
	'the modal honours a fixed target instead of defaulting to the first series',
	addModal.includes('fixedSeriesId ?? series?.[0]?.id')
);
assert(
	'and it still posts to the parts endpoint, which owns §4 invariants',
	addModal.includes('/parts')
);

console.log('\n── and the drop refuses what §4 will not accept, before the dialog opens ──');

// The predicate is guarded by name AND by its three conditions, because a version that returned true
// unconditionally would still satisfy a bare "is it referenced" check.
assert(
	'a legality predicate gates the highlight and the drop',
	dragDrop.includes('canProposeSeriesAdd()')
);
assert(
	'it excludes multi-select, group drags and studies already in a series',
	/canProposeSeriesAdd\(\)\s*\{[\s\S]*?draggedGroups\.length === 0[\s\S]*?draggedStudies\.length === 1[\s\S]*?!draggedStudies\[0\]\?\.seriesId/.test(
		dragDrop
	)
);
assert(
	'a series drop does not also fall through to a group move',
	/onDropOnSeries\?\.\([\s\S]{0,80}?\breturn;/.test(dragDrop)
);
assert(
	'the drop-target highlight is rendered by the row, not merely computed',
	seriesRow.includes('class:drop-target={isDropTarget}') &&
		seriesRow.includes('.series-section.drop-target')
);
assert(
	'and the highlight reaches series filed inside groups too',
	groupRow.includes('{dropTargetSeriesId}') &&
		panel.includes('dropTargetSeriesId={dragDrop.dropTargetSeriesId}')
);

console.log('\n── Reorder drag handle: it moves RUNS, through the verified planner (§4) ──');

assert(
	'the handle is on the run rows, which is where a drag cannot lie about the text',
	reorderModal.includes('run-handle') && reorderModal.includes('iconId="draggable"')
);
assert(
	'the row is the drop target and the handle is the drag source',
	reorderModal.includes('ondragstart=') &&
		reorderModal.includes('ondrop=') &&
		reorderModal.includes('ondragover=')
);
// Worth pinning: `ondrop` never fires without it, and the failure is completely silent.
assert(
	'dragover preventDefaults, so the drop actually fires',
	/function handleDragOver\([\s\S]*?event\.preventDefault\(\)/.test(reorderModal)
);
assert(
	'the drop reuses move(), so a drag records the same steps the buttons would',
	/function dropOn\([\s\S]*?move\(draggingIndex, to - draggingIndex\)/.test(reorderModal)
);
assert(
	'the keyboard route is NOT replaced by the handle (WCAG 2.1.1)',
	reorderModal.includes('Move ${run.title} earlier') &&
		reorderModal.includes('Move ${run.title} later')
);
assert(
	'dragend clears state, so a cancelled drag leaves no stuck row',
	reorderModal.includes('ondragend=') && /function handleDragEnd\(\)/.test(reorderModal)
);

console.log('\n── and the scan would notice if a wire were cut ──');
// Guards against every assertion above passing because the matcher is broken rather than because the
// code is right — the vacuous-truth failure this repo has hit before.
assert(
	'the same matchers report false for a fabricated marker',
	!dragDrop.includes('onDropOnSeriesDefinitelyNotPresent?.(') &&
		!/function handleDragOverDefinitelyNotPresent\(/.test(reorderModal)
);
// SENTINEL-IN-A-COMMENT: onDropOnSeries?.(x) — deliberately mentioned in prose only.
// The whole scan reads comment-stripped source, so if stripping ever broke, a plan document or a
// JSDoc block SAYING a gesture is wired would satisfy the checks above. Proving the stripper works is
// therefore proving the other twenty assertions are about code. The marker is built from fragments so
// this assertion cannot accidentally match itself in live source.
const sentinel = 'SENTINEL' + '-IN-A-' + 'COMMENT';
const raw = readFileSync('scripts/verify-series-drag.mjs', 'utf8');
assert(
	'comment stripping works, so prose about a wire cannot stand in for it',
	raw.includes(sentinel) && !live('scripts/verify-series-drag.mjs').includes(sentinel)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
