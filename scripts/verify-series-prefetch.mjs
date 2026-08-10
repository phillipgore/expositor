/**
 * Verify adjacent-part prefetch selection (SERIES_PLAN §11, phase 2).
 *
 * Prefetch is the one optimisation in this feature that spends real traffic against a rate-limited
 * provider, and it competes with the page the user is actually reading. So what needs pinning is mostly
 * what it REFUSES to do:
 *
 *   - never more than one part;
 *   - never a part that is already cached (even partially);
 *   - never anything at the end of the sequence;
 *   - and it follows `seriesOrder`, never canonical order (§4).
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-prefetch.mjs
 */

import { selectPrefetchTarget } from '../src/lib/utils/seriesPrefetch.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
	} else {
		fail += 1;
		console.log(
			`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
		);
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

/** A part with `n` passages, each cold unless `cached` says otherwise. */
const part = (id, seriesOrder, passageCount = 1, cached = []) => ({
	id,
	seriesOrder,
	passages: Array.from({ length: passageCount }, (_, i) => ({
		id: `${id}-p${i}`,
		cachedText: cached.includes(i) ? 'TEXT' : null
	}))
});

const threeCold = [part('a', 0), part('b', 1), part('c', 2)];

console.log('\n── the forward neighbour is the one warmed ──');

const fromA = selectPrefetchTarget({ parts: threeCold, currentPartId: 'a' });
check('from part 1, part 2 is chosen', fromA?.partId, 'b');
check('and one passage is listed for fetching', fromA?.passages.length, 1);

const fromB = selectPrefetchTarget({ parts: threeCold, currentPartId: 'b' });
check('from part 2, part 3 is chosen', fromB?.partId, 'c');

console.log('\n── never more than ONE part ahead ──');

// The part after next is a guess, not a prediction, and each extra part is real traffic.
assert('only a single part is ever returned', typeof fromA?.partId === 'string');
assert('the result is one part, not a list', !Array.isArray(fromA));

console.log('\n── nothing to do at the end of the sequence ──');

check(
	'the last part prefetches nothing',
	selectPrefetchTarget({ parts: threeCold, currentPartId: 'c' }),
	null
);
check(
	'and the first part prefetches nothing when looking backwards',
	selectPrefetchTarget({ parts: threeCold, currentPartId: 'a', direction: 'previous' }),
	null
);

console.log('\n── the backward direction works when asked for ──');

const backFromC = selectPrefetchTarget({
	parts: threeCold,
	currentPartId: 'c',
	direction: 'previous'
});
check('from part 3 backwards, part 2 is chosen', backFromC?.partId, 'b');

console.log('\n── an already-cached neighbour is skipped ──');

const nextIsWarm = [part('a', 0), part('b', 1, 1, [0]), part('c', 2)];
check(
	'a fully cached next part is not re-fetched',
	selectPrefetchTarget({ parts: nextIsWarm, currentPartId: 'a' }),
	null
);

// ⚠️ A PARTIALLY cached part is skipped too, and that is deliberate rather than an oversight: warming
// only some of it still leaves the page waiting on the missing passage, so the request buys nothing
// perceptible while still counting against the provider's rate limit.
const nextIsPartlyWarm = [part('a', 0), part('b', 1, 3, [0, 2]), part('c', 2)];
check(
	'a partially cached next part is skipped, not half-fetched',
	selectPrefetchTarget({ parts: nextIsPartlyWarm, currentPartId: 'a' }),
	null
);

// The complement: a multi-passage part that is entirely cold IS warmed, and all its passages are listed.
const nextIsMulti = [part('a', 0), part('b', 1, 3), part('c', 2)];
const multi = selectPrefetchTarget({ parts: nextIsMulti, currentPartId: 'a' });
check('an entirely cold multi-passage part is warmed', multi?.partId, 'b');
check('with every one of its passages listed', multi?.passages.length, 3);

console.log('\n── both cache spellings are honoured (rows vs. the layout’s boolean) ──');

// The study layout selects `hasCachedText` as a boolean rather than the whole `cachedText` HTML, so the
// selector must read either. Reading only `cachedText` would make a warm part look cold and re-fetch
// text that is already cached — a bug that still "works", so it needs asserting both ways.
const boolWarm = [
	part('a', 0),
	{ id: 'b', seriesOrder: 1, passages: [{ id: 'b-p0', hasCachedText: true }] }
];
check(
	'a warm neighbour expressed as hasCachedText is skipped',
	selectPrefetchTarget({ parts: boolWarm, currentPartId: 'a' }),
	null
);

const boolCold = [
	part('a', 0),
	{ id: 'b', seriesOrder: 1, passages: [{ id: 'b-p0', hasCachedText: false }] }
];
check(
	'a cold neighbour expressed as hasCachedText is warmed',
	selectPrefetchTarget({ parts: boolCold, currentPartId: 'a' })?.partId,
	'b'
);

const boolMixed = [
	part('a', 0),
	{
		id: 'b',
		seriesOrder: 1,
		passages: [
			{ id: 'b-p0', hasCachedText: true },
			{ id: 'b-p1', hasCachedText: false }
		]
	}
];
check(
	'and a partially warm one is still skipped under that spelling',
	selectPrefetchTarget({ parts: boolMixed, currentPartId: 'a' }),
	null
);

console.log('\n── §4: seriesOrder is followed, never canonical order ──');

// The parts are supplied in an order that DISAGREES with seriesOrder, and seriesOrder itself disagrees
// with canonical order — a user who deliberately teaches Romans 8 first. Prefetch must follow the
// arrangement the user made, so from 'first' the next part is 'second', regardless of array position or
// what the ranges would imply.
const deliberatelyReordered = [
	{ id: 'third', seriesOrder: 2, passages: [{ id: 't', cachedText: null }] },
	{ id: 'first', seriesOrder: 0, passages: [{ id: 'f', cachedText: null }] },
	{ id: 'second', seriesOrder: 1, passages: [{ id: 's', cachedText: null }] }
];
check(
	'the neighbour is chosen by seriesOrder, not array position',
	selectPrefetchTarget({ parts: deliberatelyReordered, currentPartId: 'first' })?.partId,
	'second'
);
check(
	'and again one step further along',
	selectPrefetchTarget({ parts: deliberatelyReordered, currentPartId: 'second' })?.partId,
	'third'
);
check(
	'the highest seriesOrder is the end, whatever its array index',
	selectPrefetchTarget({ parts: deliberatelyReordered, currentPartId: 'third' }),
	null
);

console.log('\n── degenerate input returns null rather than throwing ──');

// A prefetch is an optimisation triggered by a page load. Every failure mode must be a quiet null, or a
// missing field could break the very page it was meant to speed up.
check(
	'an unknown part id',
	selectPrefetchTarget({ parts: threeCold, currentPartId: 'nope' }),
	null
);
check(
	'a single-part list (not a series)',
	selectPrefetchTarget({ parts: [part('a', 0)], currentPartId: 'a' }),
	null
);
check('an empty list', selectPrefetchTarget({ parts: [], currentPartId: 'a' }), null);
check('a null list', selectPrefetchTarget({ parts: null, currentPartId: 'a' }), null);
check(
	'a neighbour with no passages at all',
	selectPrefetchTarget({
		parts: [part('a', 0), { id: 'b', seriesOrder: 1, passages: [] }],
		currentPartId: 'a'
	}),
	null
);
check(
	'a neighbour whose passages field is missing entirely',
	selectPrefetchTarget({
		parts: [part('a', 0), { id: 'b', seriesOrder: 1 }],
		currentPartId: 'a'
	}),
	null
);

// A missing seriesOrder is treated as 0 by the sort rather than throwing; assert the call survives it,
// since a legacy row could plausibly carry null.
assert(
	'a null seriesOrder does not throw',
	selectPrefetchTarget({
		parts: [
			{ id: 'a', seriesOrder: null, passages: [{ id: 'x', cachedText: null }] },
			{ id: 'b', seriesOrder: 1, passages: [{ id: 'y', cachedText: null }] }
		],
		currentPartId: 'a'
	})?.partId === 'b'
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
