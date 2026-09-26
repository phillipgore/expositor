/**
 * Verify that the Finder selection survives the Delete confirmation modal.
 *
 * ## The defect this pins
 *
 * Deleting a Study, Study Group, Series, Series Part or a multiple selection deselected every
 * item the moment the confirmation modal appeared. The toolbar Delete button's click bubbled to
 * StudiesPanel's document-level click-outside handler, which saw a click outside the Finder and
 * cleared the selection. Clicks inside the modal did the same, because the handler looked for
 * `[role="dialog"]` while Modal.svelte renders a native <dialog> with no role attribute.
 *
 * The store flag is asserted by RUNNING it; the wiring in `.svelte` files is asserted by reading
 * the source, as verify-series-selection.mjs does.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-delete-keeps-selection.mjs
 */

import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { setDeleteConfirmationOpen, setSelectedItem, toolbarState } from '../src/lib/stores/toolbar.js';

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

console.log('\n── the store tracks the open confirmation ──');

assert('closed by default', get(toolbarState).deleteConfirmationOpen === false);

const selection = {
	items: [{ type: 'study', id: 's1', data: { title: 'Romans' }, index: 0 }],
	count: 1,
	hasGroups: false,
	hasStudies: true,
	hasSeries: false
};
setSelectedItem(selection);
setDeleteConfirmationOpen(true);
assert('opening sets the flag', get(toolbarState).deleteConfirmationOpen === true);
assert('and leaves the selection untouched', get(toolbarState).selectedItem === selection);
assert('and Delete stays enabled', get(toolbarState).canDelete === true);
setDeleteConfirmationOpen(false);
assert('closing clears the flag', get(toolbarState).deleteConfirmationOpen === false);

console.log('\n── the Finder does not deselect while the modal is open ──');

const panel = readFileSync('src/lib/componentWidgets/StudiesPanel.svelte', 'utf8');
assert(
	'handleDocumentClick returns early while the confirmation is open',
	/function handleDocumentClick[\s\S]{0,1200}if \(\$toolbarState\.deleteConfirmationOpen\) return;/.test(panel)
);
assert(
	'clicks inside a native <dialog> count as inside the modal',
	panel.includes(`closest('dialog, [role="dialog"]')`)
);
assert(
	'the Finder clears its selection when a delete succeeds',
	panel.includes("addEventListener('finder-clear-selection'") &&
		panel.includes("removeEventListener('finder-clear-selection'")
);

console.log('\n── the toolbar drives the flag ──');

const toolbar = readFileSync('src/lib/componentWidgets/ToolbarApp.svelte', 'utf8');
assert(
	'opening the modal sets the flag',
	/function openDeleteModal[\s\S]{0,300}setDeleteConfirmationOpen\(true\)/.test(toolbar)
);
assert(
	'closing the modal clears the flag',
	/function closeDeleteModal[\s\S]{0,300}setDeleteConfirmationOpen\(false\)/.test(toolbar)
);
assert(
	'both Delete entry points (toolbar button and Actions menu) use openDeleteModal',
	(toolbar.match(/openDeleteModal\(/g) ?? []).length >= 3
);
assert(
	'Cancel/Escape goes through closeDeleteModal',
	/function handleDeleteModalClose\(\)\s*\{\s*closeDeleteModal\(\);/.test(toolbar)
);
assert(
	'a successful delete announces finder-clear-selection',
	/async function handleDeleteConfirm[\s\S]*closeDeleteModal\(\);[\s\S]{0,300}new CustomEvent\('finder-clear-selection'\)/.test(
		toolbar
	)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
