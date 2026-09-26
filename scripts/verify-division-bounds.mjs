/**
 * Verify that Split into a Series and Manage Serialization cannot reach a part the translation
 * refuses (`allowedDivisionBounds()`, `findRefusedPart()`).
 *
 * ## Why this file exists
 *
 * Both modals let their steppers reach any setting, then said in a yellow alert that "Some parts
 * show more of a book than ESV allows on one page". Done / Create stayed enabled. The save paths
 * then refused that shape — or, for `/api/series`, which checked nothing, created a part that
 * rendered "Error loading Ephesians 4:1-6:24". Reported against Ephesians 1–6 + Colossians 1–4 in
 * ESV: balanced 2 + 1, and chapters 3 + 1, both produced a refused part with Done still live.
 *
 * ## What it pins
 *
 *   1. The bounds are what the licence allows, found by planning: Ephesians stops at 2 chapters
 *      per part and 3 balanced parts; Colossians at 1 chapter per part, and cannot be whole.
 *   2. Every setting INSIDE the bounds is accepted — no reachable value is refused. Checked over
 *      the whole canon in ESV, for both strategies, because a bound that is off by one somewhere
 *      is exactly what a few hand-picked books would miss.
 *   3. One step OUTSIDE is refused, so the bounds are tight rather than merely safe.
 *   4. Short books keep the licence's exception (Haggai whole), and NET is unbounded.
 *   5. The reported shapes are refused, and the bounded ones are not.
 *   6. Both modals and `/api/series` actually apply this — source-level, as the neighbouring
 *      `verify-series-edit-limits.mjs` does, since nothing here can mount a Svelte component.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-division-bounds.mjs
 */

import { readFileSync } from 'node:fs';
import {
	planSeriesParts,
	allowedDivisionBounds,
	findRefusedPart
} from '../src/lib/utils/seriesPlanning.js';
import { getBookData, getVerseCount } from '../src/lib/utils/bibleData.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
	} else {
		fail += 1;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

function assert(label, condition) {
	if (condition) {
		pass += 1;
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}

function stripComments(source) {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** A whole-book range, built from the canon so no verse count is typed by hand. */
function wholeBook(testament, book) {
	const data = getBookData(testament).find((b) => b._id === book);
	const lastChapter = data.chapterCount;
	return {
		testament,
		book,
		fromChapter: 1,
		fromVerse: 1,
		toChapter: lastChapter,
		toVerse: getVerseCount(testament, book, lastChapter)
	};
}

/**
 * Is a single-passage division refused? Planned by the same entry point the modals call.
 *
 * One balanced part is the passage whole. `planSeriesParts()` ignores a single-passage target of
 * 1 (`useBalance` wants more than one part, since a series needs two), so that case is planned as
 * what it is — the span-sized chapters division — rather than silently falling back to one
 * chapter per part and reporting the wrong shape as accepted.
 */
function refusedAt(range, translationId, { chapters = 1, balance = 0 } = {}) {
	if (balance === 1) {
		return refusedAt(range, translationId, {
			chapters: range.toChapter - range.fromChapter + 1
		});
	}
	const plan = planSeriesParts({
		passages: [range],
		chaptersPerPart: chapters,
		translationId,
		balanceByLength: balance > 0,
		targetParts: balance
	});
	return findRefusedPart(plan.parts, translationId);
}

const EPH = wholeBook('NT', 'EP');
const COL = wholeBook('NT', 'CO');
const HAG = wholeBook('OT', 'HG');

console.log('\n── the bounds are what ESV allows ──');
{
	const eph = allowedDivisionBounds(EPH, 'esv');
	check('Ephesians: at most 2 chapters per part', eph.maxChaptersPerPart, 2);
	check('Ephesians: at least 3 balanced parts', eph.minBalanceParts, 3);
	check('Ephesians: not whole', eph.wholeAllowed, false);

	const col = allowedDivisionBounds(COL, 'esv');
	check('Colossians: at most 1 chapter per part', col.maxChaptersPerPart, 1);
	check('Colossians: not whole', col.wholeAllowed, false);

	const hag = allowedDivisionBounds(HAG, 'esv');
	check('Haggai: whole is allowed (short-book exception)', hag.wholeAllowed, true);
	check('Haggai: both chapters in one part', hag.maxChaptersPerPart, 2);
	check('Haggai: one balanced part', hag.minBalanceParts, 1);

	const netEph = allowedDivisionBounds(EPH, 'net');
	check('NET Ephesians: no chapters ceiling', netEph.maxChaptersPerPart, 6);
	check('NET Ephesians: whole is allowed', netEph.wholeAllowed, true);
}

console.log('\n── the reported shapes are refused; the bounded ones are not ──');
{
	const passages = [
		{ id: 'a', ...EPH },
		{ id: 'b', ...COL }
	];
	const plan = (opts) =>
		planSeriesParts({ passages, chaptersPerPart: 1, translationId: 'esv', ...opts });

	const balanced = plan({ chaptersPerPassage: [1, 1], balancePerPassage: [2, 1] });
	const refusedBalanced = findRefusedPart(balanced.parts, 'esv');
	check('balance 2 + 1: refused', refusedBalanced?.kind, 'display');
	check('  at the Ephesians 4–6 part', refusedBalanced?.seriesOrder, 2);

	const chapters = plan({ chaptersPerPassage: [3, 1] });
	check('chapters 3 + 1: refused', findRefusedPart(chapters.parts, 'esv')?.kind, 'display');

	check(
		'chapters 2 + 1 (the Ephesians ceiling): accepted',
		findRefusedPart(plan({ chaptersPerPassage: [2, 1] }).parts, 'esv'),
		null
	);
	check(
		'balance 3 + 3 (the floors): accepted',
		findRefusedPart(plan({ chaptersPerPassage: [1, 1], balancePerPassage: [3, 3] }).parts, 'esv'),
		null
	);
}

console.log('\n── a partial range is bounded on its own verses, not the book ──');
{
	// Ephesians 4–6 is 89 verses of a 155-verse book: over the half-book cap of 77 whole, so it
	// cannot be one part, but at 2 chapters per part (4–5, 6) every part is under it.
	const range = {
		testament: 'NT',
		book: 'EP',
		fromChapter: 4,
		fromVerse: 1,
		toChapter: 6,
		toVerse: 24
	};
	const b = allowedDivisionBounds(range, 'esv');
	check('Ephesians 4–6: span is 3', b.chapterSpan, 3);
	check('Ephesians 4–6: not whole', b.wholeAllowed, false);
	check('Ephesians 4–6: 2 chapters per part allowed', b.maxChaptersPerPart, 2);
}

console.log('\n── across the canon: every reachable setting is accepted, one step past is not ──');
{
	let books = 0;
	for (const testament of ['OT', 'NT']) {
		for (const data of getBookData(testament)) {
			const range = wholeBook(testament, data._id);
			const b = allowedDivisionBounds(range, 'esv');
			books += 1;

			// No chapter in the canon is unshowable on its own, so 1 is always reachable. The
			// modals' floor relies on this; if it ever fails, their Done gate is the backstop.
			assert(`${data._id}: 1 chapter per part is allowed`, b.maxChaptersPerPart >= 1);

			for (let c = 1; c <= b.maxChaptersPerPart; c += 1) {
				if (refusedAt(range, 'esv', { chapters: c })) {
					assert(`${data._id}: ${c} chapters per part is inside the bound but refused`, false);
				}
			}
			if (b.maxChaptersPerPart < b.chapterSpan) {
				assert(
					`${data._id}: ${b.maxChaptersPerPart + 1} chapters per part (one past) is refused`,
					refusedAt(range, 'esv', { chapters: b.maxChaptersPerPart + 1 }) !== null
				);
			}

			for (let k = b.minBalanceParts; k <= b.chapterSpan; k += 1) {
				if (refusedAt(range, 'esv', { balance: k })) {
					assert(`${data._id}: ${k} balanced parts is inside the bound but refused`, false);
				}
			}
			if (b.minBalanceParts > 1) {
				assert(
					`${data._id}: ${b.minBalanceParts - 1} balanced parts (one short) is refused`,
					refusedAt(range, 'esv', { balance: b.minBalanceParts - 1 }) !== null
				);
			}

			check(
				`${data._id}: wholeAllowed matches the whole-passage plan`,
				b.wholeAllowed,
				refusedAt(range, 'esv', { chapters: b.chapterSpan }) === null
			);
		}
	}
	check('all 66 books were checked', books, 66);
}

console.log('\n── the modals and /api/series actually apply this ──');
{
	const split = stripComments(
		readFileSync('src/lib/componentWidgets/modals/SplitIntoSeriesModal.svelte', 'utf8')
	);
	assert('Split: asks for the bounds', split.includes('allowedDivisionBounds('));
	assert('Split: gates Create on a refused part', /canCreate[\s\S]{0,120}!refusedPart/.test(split));
	assert('Split: balance floor is the translation floor', split.includes('min={minBalanceParts}'));
	assert(
		'Split: no hard-coded balance floor of 2',
		!split.includes('decrementDisabled={balanceTarget <= 2}')
	);

	const manage = stripComments(
		readFileSync('src/lib/componentWidgets/modals/ManageSerializationModal.svelte', 'utf8')
	);
	assert('Manage: asks for the bounds', manage.includes('allowedDivisionBounds('));
	assert(
		'Manage: gates Done on a refused part',
		manage.includes('canConfirm = $derived(hasEnoughParts && !refusedPart)')
	);
	assert(
		'Manage: balance floor is the translation floor',
		manage.includes('min={minBalanceParts}')
	);
	assert(
		'Manage: per-passage balance floor is the row floor',
		manage.includes('entry.balanceTarget <= entry.minBalance')
	);
	assert('Manage: "Whole" is offered only where allowed', manage.includes('entry.wholeAllowed'));
	// The unit sits BESIDE the stepper (the `unit` prop, rendered after the plus button), not
	// inside the value: "2 parts" / "3 ch" between the buttons was the reported layout.
	assert(
		'Manage: per-passage rows pass a unit',
		/classes="passage-parting-stepper"[\s\S]{0,600}unit=\{/.test(manage)
	);
	assert('Manage: no "ch" abbreviation inside the value', !manage.includes('} ch`'));
	assert(
		'Manage: no unit word inside the balance value',
		!/displayValue=\{balanceByLength\s*\?\s*`/.test(manage)
	);

	const api = stripComments(readFileSync('src/routes/api/series/+server.js', 'utf8'));
	assert('/api/series: refuses a refused part', api.includes('findRefusedPart(plan.parts'));
	assert(
		'/api/series: refuses BEFORE creating anything',
		api.indexOf('findRefusedPart(plan.parts') < api.indexOf('db.transaction(')
	);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
