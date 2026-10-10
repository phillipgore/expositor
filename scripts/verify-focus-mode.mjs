/**
 * Verify Focus mode: visibility stays correct through structure edits, edits that would touch
 * hidden items are blocked, and the toolbar's mode rules hold.
 *
 * ## What this pins
 *
 * - `syncFocusVisibility` (run, not read): a split made IN Focus keeps its new pieces visible
 *   (segment, section and column splits), hidden items stay hidden, joined-away ids drop out.
 *   Before, the visible Sets were frozen at entry, so a freshly split segment vanished.
 * - `resolveFocusBlocks` (run): Join / Move Item / Move Text are blocked exactly when their
 *   target is hidden, and never merely because there is no neighbour.
 * - Wiring (read): Focus and Overview are mutually exclusive, Escape does NOT exit Focus (it would leave full screen),
 *   Layout stays off in Focus while Connect / Select Linked Items are available, and the dead
 *   Compare-mode code is gone.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-focus-mode.mjs
 */

import { readFileSync } from 'node:fs';
import {
	syncFocusVisibility,
	resolveFocusBlocks,
	collectStructureIds
} from '../src/lib/utils/focusVisibility.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) pass++;
	else fail++;
	console.log(
		`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`
	);
}
const assert = (label, cond) => check(label, !!cond, true);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sorted = (set) => [...set].sort();

/** Build passagesWithText from { colId: { secId: [segIds] } }. */
function study(shape) {
	return [
		{
			structure: {
				columns: Object.entries(shape).map(([id, sections]) => ({
					id,
					sections: Object.entries(sections).map(([sid, segs]) => ({
						id: sid,
						segments: segs.map((s) => ({ id: s }))
					}))
				}))
			}
		}
	];
}
const sets = (columns, sections, segments) => ({
	columns: new Set(columns),
	sections: new Set(sections),
	segments: new Set(segments)
});

// Base: two columns. Focus is on segment b1 (column B, section b).
const base = study({ A: { a: ['a1', 'a2'] }, B: { b: ['b1', 'b2'], c: ['c1'] } });
const known = collectStructureIds(base);
const focusB1 = sets(['B'], ['b'], ['b1']);

console.log('\n── syncFocusVisibility ──');
{
	const r = syncFocusVisibility(base, focusB1, known);
	check(
		'no edit → unchanged',
		[sorted(r.visible.columns), sorted(r.visible.sections), sorted(r.visible.segments)],
		[['B'], ['b'], ['b1']]
	);
}
{
	// Split Segment b1 → b1 + bNew (same section).
	const after = study({ A: { a: ['a1', 'a2'] }, B: { b: ['b1', 'bNew', 'b2'], c: ['c1'] } });
	const r = syncFocusVisibility(after, focusB1, known);
	check('split segment: new piece is visible', sorted(r.visible.segments), ['b1', 'bNew']);
	check('split segment: hidden sibling stays hidden', r.visible.segments.has('b2'), false);
}
{
	// Split Section b at b1 → new section bS holds b1 (moved id) + b2.
	const after = study({ A: { a: ['a1', 'a2'] }, B: { b: [], bS: ['b1', 'b2'], c: ['c1'] } });
	const r = syncFocusVisibility(after, focusB1, known);
	check('split section: new section visible through moved segment', sorted(r.visible.sections), [
		'bS'
	]);
	check('split section: only the focused segment stays visible', sorted(r.visible.segments), [
		'b1'
	]);
}
{
	// Split Column B → B + BNew, where BNew holds section c and a brand-new section/segment.
	const focusColB = sets(['B'], ['b', 'c'], ['b1', 'b2', 'c1']);
	const after = study({
		A: { a: ['a1', 'a2'] },
		B: { b: ['b1', 'b2'] },
		BNew: { cNew: ['cNewSeg'], c: ['c1'] }
	});
	const r = syncFocusVisibility(after, focusColB, known);
	check('split column: new column visible', r.visible.columns.has('BNew'), true);
	check(
		'split column: brand-new segment in the new column is visible',
		r.visible.segments.has('cNewSeg'),
		true
	);
	check('split column: column A stays hidden', r.visible.columns.has('A'), false);
}
{
	// A split in a HIDDEN section must not leak into the Focus.
	const after = study({ A: { a: ['a1', 'aNew', 'a2'] }, B: { b: ['b1', 'b2'], c: ['c1'] } });
	const r = syncFocusVisibility(after, focusB1, known);
	check('split in hidden section stays hidden', r.visible.segments.has('aNew'), false);
}
{
	// Join b2 into b1 (b2 removed) with both visible → b2 drops out, b1 stays.
	const both = sets(['B'], ['b'], ['b1', 'b2']);
	const after = study({ A: { a: ['a1', 'a2'] }, B: { b: ['b1'], c: ['c1'] } });
	const r = syncFocusVisibility(after, both, known);
	check('join: absorbed id drops out', sorted(r.visible.segments), ['b1']);
	check('known is refreshed', r.known.segments.has('b2'), false);
}

console.log('\n── resolveFocusBlocks ──');
{
	// Focus b1 + b2 (section b). Neighbours: a2 (hidden) before b1, c1 (hidden) after b2.
	const vis = sets(['B'], ['b'], ['b1', 'b2']);
	const b1 = resolveFocusBlocks(base, vis, { segmentId: 'b1' }, null);
	check('segment: join up into hidden a2 blocked', b1.joinUp, true);
	check('segment: join down into visible b2 allowed', b1.joinDown, false);
	check('segment: move up into hidden section a blocked', b1.moveUp, true);
	check('segment: move down into hidden section c blocked', b1.moveDown, true);
	const b2 = resolveFocusBlocks(base, vis, { segmentId: 'b2' }, null);
	check('segment: join down into hidden c1 blocked', b2.joinDown, true);
}
{
	const vis = sets(['A', 'B'], ['a', 'b'], ['a1', 'a2', 'b1', 'b2']);
	const r = resolveFocusBlocks(base, vis, { sectionId: 'b' }, null);
	check('section: join up into visible a allowed', r.joinUp, false);
	check('section: join down into hidden c blocked', r.joinDown, true);
	check('section: move up into visible column A allowed', r.moveUp, false);
}
{
	const r = resolveFocusBlocks(base, sets(['A'], ['a'], ['a1', 'a2']), { columnId: 'A' }, null);
	check('first column: no neighbour is not a Focus block', r.joinUp, false);
	check('column: join down into hidden B blocked', r.joinDown, true);
	check(
		'column: Move Item never blocked (container is the part)',
		[r.moveUp, r.moveDown],
		[false, false]
	);
}
{
	const vis = sets(['B'], ['b'], ['b1', 'b2']);
	const r = resolveFocusBlocks(base, vis, {}, 'b2');
	check('move text: up into visible b1 allowed', r.moveTextUp, false);
	check('move text: down into hidden c1 blocked', r.moveTextDown, true);
}

console.log('\n── wiring ──');
const store = read('src/lib/stores/toolbar.js');
const page = read('src/routes/(app)/study/[id]/analyze/+page.svelte');
const config = read('src/lib/utils/toolbarConfig.js');
const structure = read('src/lib/componentWidgets/menus/MenuStructure.svelte');
assert(
	'entering Focus leaves Overview',
	/export function toggleFocus\(\)[\s\S]*?overviewMode: leaveOverview \? false/.test(store)
);
assert(
	'entering Overview leaves Focus',
	store.includes('focusMode: newOverviewMode ? false : s.focusMode')
);
// Escape must not exit Focus: the browser also uses it to leave full screen, which a page
// cannot block, so it would throw the user out of full screen.
assert('Escape does not exit Focus', !/exitFocus|isEscapeOwnedElsewhere/.test(page));
assert('no Focus banner', !page.includes('focus-banner'));
assert('visibility re-synced after edits', page.includes('syncFocusVisibility('));
assert(
	'ids snapshotted on entering Focus',
	(page.match(/snapshotFocusKnown\(\);/g) ?? []).length >= 2
);
assert('guards published to the store', page.includes('setFocusStructureBlocks(blocks)'));
assert(
	'MenuStructure disables guarded commands (no inline notes)',
	['joinUp', 'joinDown', 'moveUp', 'moveDown', 'moveTextUp', 'moveTextDown'].every((k) =>
		structure.includes(`focusBlocks.${k}`)
	) && !structure.includes('Not available in Focus')
);
assert(
	'Layout stays off in Focus',
	/menuId: 'MenuLayout'[\s\S]*?disabledCheck: \(state\) => !state\.canStructure \|\| state\.overviewMode \|\| state\.focusMode/.test(
		config
	)
);
assert(
	'Connect is available in Focus',
	/menuId: 'MenuConnect'[\s\S]*?disabledCheck: \(state\) => !state\.canStructure \|\| state\.overviewMode\n/.test(
		config
	)
);
assert(
	'Select All is limited to visible items in Focus',
	page.includes('!isFocusMode || visibleSegmentIds.has(s.segmentId)')
);
assert('dead Compare-mode state removed', !/isCompareMode|compareActive|compare-hidden/.test(page));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
