/**
 * Verify that a series is selected and edited AS A WHOLE (SERIES_PLAN §4, §5).
 *
 * ## The defect this pins
 *
 * Clicking a series in the Finder used to select a PART. The chain was:
 *
 *   1. `handleSeriesHeaderClick` navigated straight to a part and never called `handleItemClick`,
 *      so no series was ever selected — the row's selection styling was dead code;
 *   2. that part became `activeStudyId`, which the Finder's auto-select effect then selected;
 *   3. Edit routed the selection to `/study/{id}/edit`, opening ONE PART's passage list.
 *
 * So "edit this serialized study" showed a fragment of the study — part 3 of Romans rather than the
 * Romans 1–16 the user typed. The fix gives a series its own page (as a group has), selects the
 * series on click, and disables Edit while a part is selected.
 *
 * ## What is asserted here, and what deliberately is not
 *
 * The toolbar predicates are asserted by RUNNING them, because they decide whether the wrong button
 * is reachable. The wiring in `.svelte` files is asserted by reading the source: these are the exact
 * lines whose absence caused the defect, and a static check is the only gate that reads them at all
 * (the same argument `verify-series-drag.mjs` and `verify-plan-status.mjs` make).
 *
 * ⚠️ `canDelete` for a part is asserted to remain TRUE. Deleting a part is a supported operation
 * with its own §4 confirmation copy (`describePartDeletion`), so a fix that disabled Edit by disabling
 * the whole selection would break it — silently, since nothing else tests it.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-selection.mjs
 */

import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { setSelectedItem, toolbarState } from '../src/lib/stores/toolbar.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
	} else {
		fail += 1;
		console.log(`✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
	}
}

function assert(label, condition) {
	if (condition) {
		pass += 1;
	} else {
		fail += 1;
		console.log(`✗ ${label}`);
	}
}

const selection = (items) => ({
	items,
	count: items.length,
	hasGroups: items.some((i) => i.type === 'group'),
	hasStudies: items.some((i) => i.type === 'study'),
	hasSeries: items.some((i) => i.type === 'series')
});

console.log('\n── Edit is disabled for a PART, and only for a part ──');

setSelectedItem(selection([{ type: 'study', id: 's1', data: { id: 's1', seriesId: null } }]));
check('a standalone study can be edited', get(toolbarState).canEdit, true);

setSelectedItem(selection([{ type: 'study', id: 'p1', data: { id: 'p1', seriesId: 'ser1' } }]));
check('a PART cannot be edited', get(toolbarState).canEdit, false);
// The whole point of gating `canEdit` rather than the selection: part deletion is supported.
check('but a part can still be DELETED', get(toolbarState).canDelete, true);

setSelectedItem(selection([{ type: 'series', id: 'ser1', data: { id: 'ser1' } }]));
check('a series can be edited', get(toolbarState).canEdit, true);

setSelectedItem(selection([{ type: 'group', id: 'g1', data: { id: 'g1' } }]));
check('a group can still be edited', get(toolbarState).canEdit, true);

console.log('\n── the Finder selects the series, and opens the series page ──');

const panel = readFileSync('src/lib/componentWidgets/StudiesPanel.svelte', 'utf8');
const handler = panel.slice(
	panel.indexOf('function handleSeriesHeaderClick'),
	panel.indexOf('function handleGroupHeaderClick')
);

assert(
	'the series click handler selects the series',
	/handleItemClick\(\s*event,\s*'series'/.test(handler)
);
assert('and navigates to the series page', handler.includes('`/series/${series.id}`'));
assert(
	'and NOT to one of its parts — the defect this fixes',
	!handler.includes('/study/') && !handler.includes('lastPartId')
);
assert(
	'the same-URL goto guard is present, as for groups and studies',
	handler.includes('$page.url.pathname !== dest')
);
// The one-row selection lives in `selectOnlySeries`, shared by the auto-select effect and the
// main-area click handler.
const selectOnly = panel.slice(
	panel.indexOf('function selectOnlySeries'),
	panel.indexOf('function selectOnlySeries') + 900
);
assert(
	'selectOnlySeries selects the row as a series',
	panel.includes('function selectOnlySeries') &&
		/type:\s*'series',\s*\n\s*id:\s*seriesId/.test(selectOnly) &&
		selectOnly.includes('multiSelect.updateToolbarSelection()')
);
assert(
	'an active series is auto-selected as a series',
	/selectOnlySeries\(activeSeriesId\)/.test(panel)
);

console.log('\n── the Finder never steals focus ──');

// ⚠️ The search field must take focus ONLY when the user clicks it.
//
// An `$effect` labelled "focus search input when panel opens" used to call `.focus()` behind a
// 100ms timeout. An `$effect` re-runs on every dependency change, and it read a `$bindable` that
// Svelte reassigns on each `bind:this` re-render — so it fired on every selection change, route
// change and data invalidation. The delay made it focus THEFT: a click landed elsewhere, then the
// pending timeout pulled the caret into the Finder. Typing a Title on New Study or Edit Series was
// affected too, since both open the panel on mount.
//
// Asserted as the ABSENCE of a focus call, because the failure mode is someone re-reading that
// comment as intent and adding the effect back.
const panelCode = panel
	// Strip comments: the removal is documented at length in the file, and those mentions must not
	// satisfy — or defeat — this check.
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/\/\/.*$/gm, '');

assert('the panel makes no focus() call', !panelCode.includes('.focus('));
assert('and holds no ref to the search input', !panelCode.includes('searchInputRef'));
// Keyboard navigation focuses rows through its own composable, driven by a real keypress — that
// mechanism is separate and must keep working. Read here rather than reusing the `keyboard` binding
// further down, which is declared after this point.
assert(
	'while keyboard navigation still focuses rows',
	readFileSync('src/lib/composables/useKeyboardNavigation.svelte.js', 'utf8').includes(
		'element.focus()'
	)
);

console.log('\n── the auto-select effect does not re-impose a stale series selection ──');

// ⚠️ Clicking a series' first part left the SERIES highlighted. `goto()` is async, so the effect
// re-ran while the URL was still `/series/{id}`: `activeSeriesId` was truthy, the series was "not
// selected" (the part had just replaced it), and the branch selected the series again. It only
// showed SOMETIMES because the study branch usually repaired it on arrival — unless the part was
// already `previousActiveStudyId`, in which case that branch skipped and the series stayed lit.
//
// The fix is the same ID-changed latch the study branch uses. Asserted as three separate facts
// because each alone is satisfiable by a broken version: the latch must exist, it must GATE the
// series selection, and it must be RESET or it fires once per session and never again.
assert(
	'the series branch latches on the active series id',
	/if\s*\(activeSeriesId !== previousActiveSeriesId\)\s*\{\s*\n\s*previousActiveSeriesId = activeSeriesId;/.test(
		panel
	)
);
assert(
	'the latch encloses the series selection assignment',
	// `indexOf` returns -1 when absent, and -1 is less than everything — so both offsets are
	// required to be real before they are compared, or a deleted latch would read as "enclosing".
	(() => {
		const latch = panel.indexOf('activeSeriesId !== previousActiveSeriesId');
		if (latch < 0) return false;
		// The first selectOnlySeries(activeSeriesId) after the latch must fall inside the latched
		// block, i.e. before the effect's next branch.
		const call = panel.indexOf('selectOnlySeries(activeSeriesId)', latch);
		const nextBranch = panel.indexOf('} else if (activeGroupId)', latch);
		return call > latch && nextBranch > call;
	})()
);
assert(
	'and it is reset when another row becomes active',
	(panel.match(/previousActiveSeriesId = null;/g) ?? []).length >= 2
);

console.log('\n── clicking the series page keeps the series selected, as a group page does ──');

// ⚠️ A click in the main area used to clear the series selection for good: the document click
// handler cleared it, and the latched series branch above (unlike the unlatched group branch) never
// put it back, so Edit and Delete went grey on the series' own page.
const docClick = panelCode.slice(
	panelCode.indexOf('function handleDocumentClick'),
	panelCode.indexOf("document.addEventListener('click', handleDocumentClick)")
);
assert(
	'the main-area click handler re-selects the active series instead of clearing',
	/if \(activeSeriesId\)\s*\{[\s\S]*selectOnlySeries\(activeSeriesId\)[\s\S]*return;/.test(docClick) &&
		docClick.indexOf('selectOnlySeries(activeSeriesId)') <
			docClick.lastIndexOf('multiSelect.clearSelection()')
);
assert(
	'and it does not bail out early on a series page with nothing selected',
	docClick.includes('multiSelect.selectedItems.length === 0 && !activeSeriesId')
);

console.log('\n── Edit routes each row type to its own editor ──');

const toolbar = readFileSync('src/lib/componentWidgets/ToolbarApp.svelte', 'utf8');
assert('a series routes to /series/{id}/edit', toolbar.includes('`/series/${item.id}/edit`'));
assert(
	'a group still routes to /study-group/{id}/edit',
	toolbar.includes('`/study-group/${item.id}/edit`')
);
assert('a study still routes to /study/{id}/edit', toolbar.includes('`/study/${item.id}/edit`'));
assert(
	"deleting the series being viewed leaves its page before its loader can 404",
	toolbar.includes('const seriesMatch = pathname.match(/^\\/series\\/([^/]+)/)') &&
		toolbar.includes('selectedSeriesIds.includes(seriesMatch[1])')
);

console.log("\n── a part's edit URL redirects to its series ──");

const studyEdit = readFileSync('src/routes/(app)/study/[id]/edit/+page.server.js', 'utf8');
assert(
	'typing a part edit URL lands on the series editor',
	/if\s*\(studyData\.seriesId\)\s*\{[\s\S]{0,400}redirect\(307,\s*`\/series\/\$\{studyData\.seriesId\}\/edit`\)/.test(
		studyEdit
	)
);

console.log('\n── the series row is reachable by keyboard ──');

const keyboard = readFileSync('src/lib/composables/useKeyboardNavigation.svelte.js', 'utf8');
assert(
	'focusItem knows the series select button',
	keyboard.includes('.series-select-button[data-series-id=')
);
assert(
	'and arrow-collapse applies to series rows',
	/currentItem\.type !== 'group' && currentItem\.type !== 'series'/.test(keyboard)
);

console.log('\n── a selected series travels with a move ──');

const multi = readFileSync('src/lib/composables/useMultiSelect.svelte.js', 'utf8');
assert('the selection payload reports hasSeries', multi.includes('hasSeries: selectedItems.some'));
assert(
	'and moving a selection moves its series too',
	multi.includes("item.type === 'series'") && multi.includes('`/api/series/${item.id}`')
);

const seriesApi = readFileSync('src/routes/api/series/[id]/+server.js', 'utf8');
assert(
	'which the series endpoint actually accepts',
	seriesApi.includes('body.groupId !== undefined') && seriesApi.includes('updates.groupId')
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
