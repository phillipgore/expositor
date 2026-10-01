/**
 * Verify the parting rules shared by Manage Serialization and Split into a Series
 * (`src/lib/utils/partingDraft.js`, rendered by `SeriesPartingControls.svelte`).
 *
 * ## Why this file exists
 *
 * The two dialogs used to carry their own copies of these rules, and the copies drifted: a
 * balanced per-passage row reported the chapters shape ("3 parts" beside a field reading 4), and
 * Split had no per-passage rows at all. Reported against 1 Peter + 2 Peter in ESV, where 2 Peter's
 * buttons were all disabled with no reason given and its value had no border. The rules now live
 * in one module, checked here, and both dialogs render one component, checked at the end.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-parting-draft.mjs
 */

import { readFileSync } from 'node:fs';
import { allowedDivisionBounds } from '$lib/utils/seriesPlanning.js';
import {
	DEFAULT_CHAPTERS_PER_PASSAGE,
	normalizePassage,
	singleBounds,
	clampInt,
	derivePassageRow,
	rowCanStep,
	isRowLocked,
	stepRow,
	clampTypedRow,
	lockedRowsMessage
} from '$lib/utils/partingDraft.js';

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
function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	assert(ok ? label : `${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`, ok);
}

const book = (id, code, chapters) =>
	normalizePassage({
		id,
		testament: 'NT',
		book: code,
		fromChapter: 1,
		toChapter: chapters,
		fromVerse: 1,
		toVerse: 999
	});
const row = (p, opts = {}) =>
	derivePassageRow(p, allowedDivisionBounds(p, 'esv'), {
		balanceByLength: false,
		translationId: 'esv',
		title: '',
		...opts
	});

const peter1 = book('p1', 'IPE', 5);
const peter2 = book('p2', '2PE', 3);

console.log('\n── normalizePassage reads both shapes ──');
check('saved rows carry bookId', normalizePassage({ bookId: 'IPE' }).book, 'IPE');
check('selector rows carry book', normalizePassage({ book: '2PE' }).book, '2PE');

console.log('\n── clampInt ──');
check('in range', clampInt('3', 1, 5), 3);
check('above max', clampInt('9', 1, 2), 2);
check('below min', clampInt('0', 2, 5), 2);
check('mid-edit falls back', clampInt('', 1, 5, 1), 1);

console.log('\n── single-passage bounds ──');
check('no translation limit: half the span', singleBounds(5, null).maxChaptersPerPart, 2);
check(
	'a translation ceiling below half wins',
	singleBounds(6, { maxChaptersPerPart: 1, minBalanceParts: 3 }).maxChaptersPerPart,
	1
);
check(
	'balance floor is at least 2',
	singleBounds(5, { maxChaptersPerPart: 5, minBalanceParts: 1 }).minBalanceParts,
	2
);
check(
	'balance floor rises to the translation',
	singleBounds(6, { maxChaptersPerPart: 2, minBalanceParts: 3 }).minBalanceParts,
	3
);

console.log('\n── the reported study: 1 Peter + 2 Peter in ESV, chapters mode ──');
{
	const r1 = row(peter1);
	const r2 = row(peter2);
	check('rows start at the shared default', [r1.chapters, r2.chapters], [
		DEFAULT_CHAPTERS_PER_PASSAGE,
		DEFAULT_CHAPTERS_PER_PASSAGE
	]);
	check('1 Peter can only go up', rowCanStep(r1, false), { down: false, up: true });
	assert('1 Peter is not locked', !isRowLocked(r1, false));
	check('2 Peter cannot move either way', rowCanStep(r2, false), { down: false, up: false });
	assert('2 Peter is locked, so its field is disabled', isRowLocked(r2, false));
	check('pressing + on 1 Peter gives 2', stepRow(r1, false, 1), 2);
	check('pressing − on 1 Peter does nothing', stepRow(r1, false, -1), null);
	check('typing 9 on 1 Peter clamps to its ceiling', clampTypedRow(r1, false, '9'), 2);
	check('typing Whole on 1 Peter falls to 1, as ESV refuses it whole', clampTypedRow(r1, false, 'Whole'), 1);
	check('typing junk reverts', clampTypedRow(r1, false, 'abc'), null);
	const msg = lockedRowsMessage([r1, r2], false, 'esv');
	assert(
		'the note names 2 Peter',
		msg.startsWith('2 Peter 1–3 can only be divided at one chapter per part in ESV.')
	);
	assert('and not 1 Peter', !msg.includes('1 Peter'));
}

console.log('\n── balance mode ──');
{
	const r1 = row(peter1, { balanceByLength: true });
	const r2 = row(peter2, { balanceByLength: true });
	check('1 Peter seeds from the chapters shape (5 parts)', r1.balanceTarget, 5);
	check('1 Peter can only go down', rowCanStep(r1, true), { down: true, up: false });
	// The reported bug: the pill read the chapters shape (3 parts) beside a field reading 4.
	const r1at4 = row(peter1, { balanceByLength: true, balanceRaw: '4' });
	check('the row reports the BALANCED count, not the chapters one', r1at4.partCount, 4);
	assert('2 Peter is locked at 3 parts', isRowLocked(r2, true) && r2.balanceTarget === 3);
	assert(
		'the note says so',
		lockedRowsMessage([r1, r2], true, 'esv').includes('2 Peter 1–3 can only be balanced into 3 parts')
	);
}

console.log('\n── a single-chapter passage has no control, so it is never "locked" ──');
{
	const jude = normalizePassage({
		id: 'j',
		testament: 'NT',
		book: 'JD',
		fromChapter: 1,
		toChapter: 1,
		fromVerse: 1,
		toVerse: 25
	});
	const r = row(jude);
	assert('it cannot divide', !r.canDivide);
	assert('so it is not listed as locked', !isRowLocked(r, false));
}

console.log('\n── both dialogs render the one shared component ──');
{
	const read = (p) => readFileSync(p, 'utf8');
	const manage = read('src/lib/componentWidgets/modals/ManageSerializationModal.svelte');
	const split = read('src/lib/componentWidgets/modals/SplitIntoSeriesModal.svelte');
	const controls = read('src/lib/componentWidgets/SeriesPartingControls.svelte');
	for (const [name, src] of [
		['Manage', manage],
		['Split', split]
	]) {
		assert(`${name} renders SeriesPartingControls`, src.includes('<SeriesPartingControls'));
		assert(`${name} carries no Stepper of its own`, !src.includes('<Stepper'));
		assert(`${name} carries no radio pair of its own`, !src.includes('<RadioButtons'));
		assert(`${name} does not plan on its own`, !/import[^;]*planSeriesParts/.test(src));
	}
	assert(
		'the controls take their rules from partingDraft.js',
		controls.includes("from '$lib/utils/partingDraft.js'")
	);
	assert(
		'locked rows disable their field',
		controls.includes('inputDisabled={isRowLocked(entry, balanceByLength)}')
	);
	assert(
		'Split sends the per-passage arrays to onCreate',
		/onCreate\?\.\([\s\S]{0,300}chaptersPerPassage[\s\S]{0,120}balancePerPassage/.test(split)
	);
	const menu = read('src/lib/componentWidgets/menus/MenuActions.svelte');
	assert(
		'the menu forwards them in the POST body',
		/chaptersPerPassage:\s*options\.chaptersPerPassage/.test(menu) &&
			/balancePerPassage:\s*options\.balancePerPassage/.test(menu)
	);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

