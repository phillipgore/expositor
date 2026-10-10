/**
 * Verify the Layout menu's Link checkboxes (Column Width, Column Spacing, Section Spacing,
 * Segment Height).
 *
 * ## What this pins
 *
 * - The checkbox state is decided by ONE pure rule, `linkStateFromGroups()`:
 *     every selected item linked → ticked (click unlinks), some linked → dash (click joins),
 *     2+ none linked → empty (click links), otherwise disabled.
 *   Before, a selection whose items were all linked but in DIFFERENT groups showed the
 *   "partly linked" dash, and a dash could never unlink.
 * - A dash click JOINS the existing group (every member is sent) instead of pulling the
 *   selected items out into a new group and stranding the rest.
 * - Unlink clears the SELECTED items only, server-side, and dissolves groups left with one
 *   member — it no longer unlinks members the user never selected.
 * - Segment Height uses the same rule, is disabled on the Document view, reports failures,
 *   and every link/unlink ignores repeat clicks while a save is in flight.
 *
 * The rule is asserted by RUNNING it; the wiring is asserted by reading the source.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-link-toggle.mjs
 */

import { readFileSync } from 'node:fs';
import { linkStateFromGroups } from '../src/lib/utils/linkGroups.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

function assert(label, condition) {
	check(label, !!condition, true);
}

const read = (p) => readFileSync(p, 'utf8');

console.log('\n── linkStateFromGroups: the checkbox rule ──');
check('nothing selected → disabled', linkStateFromGroups([]), null);
check('one unlinked item → disabled', linkStateFromGroups([null]), null);
check('one linked item → ticked (can unlink it)', linkStateFromGroups(['g1']), 'on');
check('two unlinked → empty (can link)', linkStateFromGroups([null, null]), 'off');
check('two in the same group → ticked', linkStateFromGroups(['g1', 'g1']), 'on');
check('part of one group → ticked', linkStateFromGroups(['g1', 'g1']), 'on');
check('one linked + one unlinked → dash', linkStateFromGroups(['g1', null]), 'mixed');
check('linked items from TWO groups → ticked, not dash', linkStateFromGroups(['g1', 'g2']), 'on');
check('two groups + an unlinked item → dash', linkStateFromGroups(['g1', 'g2', null]), 'mixed');

console.log('\n── page wiring ──');
const page = read('src/routes/(app)/study/[id]/analyze/+page.svelte');
for (const kind of ['columnSpacing', 'columnWidth', 'sectionSpacing', 'segmentHeight']) {
	assert(`Link ${kind} joins existing groups (idsForLink)`, page.includes(`idsForLink(LINK_KINDS.${kind}`));
}
assert('segment height availability uses the shared rule', page.includes('getLinkAvailability(LINK_KINDS.segmentHeight'));
assert('segment height link goes through runLinkAction (errors surfaced)', /runLinkAction\('link segment height'/.test(page));
assert('segment height unlink goes through runLinkAction', /runLinkAction\('unlink segment height'/.test(page));
assert('repeat clicks are ignored while a save is in flight', /if \(linkActionBusy\) return;/.test(page));
assert('failures are shown to the user', /showPopoverError\(`Could not \$\{label\}\.`\)/.test(page));

console.log('\n── server: unlink affects the selection only ──');
const server = read('src/lib/server/db/linkGroups.js');
assert('shared unlinkSelected() clears only the selected ids', /export async function unlinkSelected[\s\S]{0,700}\.where\(inArray\(table\.id, ids\)\)/.test(server));
assert('…and dissolves groups left with one member', /export async function unlinkSelected[\s\S]{0,900}clearSingletonGroups/.test(server));
assert('column/section unlink handlers use it', /await unlinkSelected\(db, table, groupKey, ids\)/.test(server));
assert('segment unlink-height uses it', read('src/routes/api/segments/unlink-height/+server.js').includes("unlinkSelected(db, passageSegment, 'heightGroupId', ids)"));
assert('segment link-height dissolves groups left with one member', read('src/routes/api/segments/link-height/+server.js').includes('clearSingletonGroups('));

console.log('\n── menu ──');
const menu = read('src/lib/componentWidgets/menus/MenuLayout.svelte');
assert('Link Segment Height is disabled on the Document view', menu.includes('isDisabled={isDocument || linkState.segmentHeight === null'));

console.log('\n── selected item shows its link group ──');
assert('group index is built from loaded data', page.includes('let linkGroupIndex = $derived.by('));
assert('off in Outline View / Focus', /selectedLinkGroups = \$derived\(\s*\$toolbarState\.overviewMode \|\| \$toolbarState\.focusMode \? EMPTY_LINK_GROUPS : activeLinkGroups/.test(page));
for (const cls of ['spacing-link-selected', 'width-link-selected']) {
	assert(`columns get ${cls}`, page.includes(`class:${cls}={!!column.`));
}
assert('sections get spacing-link-selected', page.includes('class:spacing-link-selected={!!section.spacingGroupId'));
assert('segments get linkSelected', page.includes('linkSelected={!!segment.heightGroupId'));
assert('Segment renders link-selected', read('src/lib/componentWidgets/Segment.svelte').includes('class:link-selected={resizeEnabled && linkSelected}'));

console.log('\n── Select Linked Items ──');
const selMenu = read('src/lib/componentWidgets/menus/MenuSelection.svelte');
assert('menu item dispatches select-linked-items', selMenu.includes("selectAllStructure('select-linked-items')"));
assert('menu item gated on canSelectLinkedItems', selMenu.includes('!$toolbarState.canSelectLinkedItems'));
assert('page handles the event', page.includes("window.addEventListener('select-linked-items', handleSelectLinkedItemsEvent)"));
assert('it ADDS to the selection (keeps what was selected)', page.includes('const columnIds = [...new Set([...activeColumns, ...linked.columns])];') && page.includes('activeSegments = [...activeSegments, ...addedSegments];'));
// Same groups the dashed outlines are built from (activeLinkGroups) — but NOT suppressed in
// Focus, where the outlines are hidden yet Select Linked Items still works on visible members.
assert('uses the same groups as the dashed outlines', /function getLinkedMemberIds\(\) \{\s*const groups = \$toolbarState\.overviewMode \? EMPTY_LINK_GROUPS : activeLinkGroups;/.test(page));
assert('in Focus, only visible linked members are offered', /if \(isFocusMode\) \{\s*return \{\s*columns: columnIds\.filter\(\(id\) => visibleColumnIds\.has\(id\)\)/.test(page));
assert('flag is cleared when leaving the page', page.includes("setToolbarState('canSelectLinkedItems', false)"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
