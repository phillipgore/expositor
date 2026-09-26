/**
 * Verify deleting a group preserves its unselected contents — including series.
 *
 * The Study Group and Delete Multiple Items confirmations promise: "Unselected items within groups
 * will be preserved and moved to safe locations." `/api/bulk-delete` keeps that promise through
 * `planGroupDeletion()`. Series are the case worth pinning: `study_series.group_id` is ON DELETE
 * CASCADE, so a series the plan forgets is not left behind — it is destroyed with every part. The
 * original endpoint planned only groups and studies, and nothing caught it.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-group-deletion.mjs
 */

import { readFileSync } from 'node:fs';
import { planGroupDeletion } from '../src/lib/utils/groupDeletion.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		pass += 1;
		console.log(`  ✅ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}\n    expected: ${e}\n    actual:   ${a}`);
	}
}

// Top ─┬─ A (deleted) ─┬─ A1 ─── study s-a1, series r-a1
//      │               ├─ study s-a, series r-a, part p-1 (of r-a, groupId null)
//      │               └─ study s-a-sel (selected)
//      └─ B ─── study s-b, series r-b
const groups = [
	{ id: 'A', parentGroupId: null },
	{ id: 'A1', parentGroupId: 'A' },
	{ id: 'B', parentGroupId: null }
];
const studies = [
	{ id: 's-a', groupId: 'A', seriesId: null },
	{ id: 's-a-sel', groupId: 'A', seriesId: null },
	{ id: 's-a1', groupId: 'A1', seriesId: null },
	{ id: 's-b', groupId: 'B', seriesId: null },
	{ id: 'p-1', groupId: null, seriesId: 'r-a' }
];
const series = [
	{ id: 'r-a', groupId: 'A' },
	{ id: 'r-a1', groupId: 'A1' },
	{ id: 'r-b', groupId: 'B' }
];

console.log('\nDeleting a top-level group');
const top = planGroupDeletion({
	groups,
	studies,
	series,
	selectedGroupIds: ['A'],
	selectedStudyIds: ['s-a-sel']
});
check('a series directly inside moves to the top level', top.moveSeries, [{ id: 'r-a', groupId: null }]);
check('a study directly inside moves to the top level; the selected one does not', top.moveStudies, [
	{ id: 's-a', groupId: null }
]);
check('a nested group moves up; its own contents stay inside it', top.moveGroups, [
	{ id: 'A1', parentGroupId: null }
]);
check('preserved counts include series (nested ones too)', top.preserved, {
	groups: 1,
	studies: 2,
	series: 2
});
check(
	'a series part is never moved on its own',
	top.moveStudies.some((m) => m.id === 'p-1'),
	false
);
check(
	'nothing outside the deleted group moves',
	[...top.moveSeries, ...top.moveStudies, ...top.moveGroups].some((m) => ['r-b', 's-b', 'B'].includes(m.id)),
	false
);

console.log('\nDeleting a group AND its subgroup');
const both = planGroupDeletion({ groups, studies, series, selectedGroupIds: ['A', 'A1'] });
check('a series two levels down lands at the nearest survivor (top level)', both.moveSeries, [
	{ id: 'r-a', groupId: null },
	{ id: 'r-a1', groupId: null }
]);

console.log('\nDeleting a nested group');
const nested = planGroupDeletion({ groups, studies, series, selectedGroupIds: ['A1'] });
check('its series moves to the parent group, not the top level', nested.moveSeries, [
	{ id: 'r-a1', groupId: 'A' }
]);

console.log('\nSelected series');
const selected = planGroupDeletion({
	groups,
	studies,
	series,
	selectedGroupIds: ['A'],
	selectedSeriesIds: ['r-a']
});
check('a selected series is deleted, not preserved', selected.moveSeries, []);

console.log('\nWiring');
const endpoint = readFileSync('src/routes/api/bulk-delete/+server.js', 'utf8');
check('bulk-delete uses the planner', endpoint.includes('planGroupDeletion('), true);
check('bulk-delete moves series', endpoint.includes('plan.moveSeries'), true);
check(
	'bulk-delete moves before it deletes',
	endpoint.indexOf('plan.moveSeries') < endpoint.indexOf('.delete(studyGroup)'),
	true
);
check(
	'the toolbar sends selected series to bulk-delete',
	readFileSync('src/lib/componentWidgets/ToolbarApp.svelte', 'utf8').includes(
		'JSON.stringify({ selectedGroupIds, selectedStudyIds, selectedSeriesIds })'
	),
	true
);

// `DELETE /api/groups/[id]` was a second, unused route to deleting a group. With no body it
// cascaded away everything inside; with one it moved only direct children and still cascaded series.
// It was removed so /api/bulk-delete is the ONLY way a group is deleted. PATCH (move, collapse) stays.
const groupRoute = readFileSync('src/routes/api/groups/[id]/+server.js', 'utf8');
check(
	'there is no DELETE handler on /api/groups/[id]',
	/export\s+(const|async\s+function|function)\s+DELETE\b/.test(groupRoute),
	false
);
check(
	'the PATCH handler on /api/groups/[id] is still there',
	/export\s+const\s+PATCH\b/.test(groupRoute),
	true
);

const modal = readFileSync('src/lib/componentWidgets/modals/DeleteConfirmationModal.svelte', 'utf8');
check(
	'the modal carries the preservation sentence',
	modal.includes(
		"'Unselected items within groups will be preserved and moved to safe locations. This action cannot be undone.'"
	),
	true
);
check(
	'Delete Multiple Items message',
	modal.includes("message: 'Are you sure you want to delete the selected items?'"),
	true
);
check(
	'Study Group message no longer claims contents are deleted',
	modal.includes('and its contents'),
	false
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
