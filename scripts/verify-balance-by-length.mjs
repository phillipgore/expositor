/**
 * Verify "Balance by length" (SERIES_PLAN §5 option (b), Q11).
 *
 * §5's default is fixed chapters-per-part, "accept unevenness", because chapter boundaries are
 * meaningful to readers in a way equal verse counts are not. Balance by length is the OPT-IN
 * alternative: same chapter seams, chosen to even out verse counts.
 *
 * Three properties matter, and one non-property is worth pinning too:
 *
 *   - it never splits a chapter (§5: "breaking on chapter boundaries");
 *   - it is verse-conservative — the parts cover exactly what the source range covered;
 *   - it is never applied unless asked for (§5: "never a re-balancing the app applies on their
 *     behalf");
 *   - ⚠️ it does NOT promise even parts. Where one chapter dominates, no chapter-respecting partition
 *     can be even, and the tests below say so with real numbers rather than implying otherwise.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-balance-by-length.mjs
 */

import { planSeriesParts } from '../src/lib/utils/seriesPlanning.js';
import { getVerseCount } from '../src/lib/utils/bibleData.js';

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

/** One contiguous Psalms range. */
const psalms = (fromChapter, toChapter) => [
	{
		testament: 'OT',
		book: 'PS',
		fromChapter,
		fromVerse: 1,
		toChapter,
		toVerse: getVerseCount('OT', 'PS', toChapter)
	}
];

const balanced = (fromChapter, toChapter, targetParts) =>
	planSeriesParts({
		passages: psalms(fromChapter, toChapter),
		translationId: 'esv',
		baseTitle: '',
		balanceByLength: true,
		targetParts
	});

const fixed = (fromChapter, toChapter, chaptersPerPart) =>
	planSeriesParts({
		passages: psalms(fromChapter, toChapter),
		translationId: 'esv',
		baseTitle: '',
		chaptersPerPart
	});

console.log('\n── measured from bible.json, so the fixtures are not guesses ──');

const PS117 = getVerseCount('OT', 'PS', 117);
const PS119 = getVerseCount('OT', 'PS', 119);
console.log(`(Psalm 117 = ${PS117} verses, Psalm 119 = ${PS119})`);
check('Psalm 117 is the short one §5 names', PS117, 2);
check('Psalm 119 is the long one §5 names', PS119, 176);

console.log('\n── it produces the requested number of parts ──');

const four = balanced(1, 20, 4);
check('four parts when four are asked for', four.parts.length, 4);
check('and the strategy is still chapters-per-part', four.strategy, 'chapters-per-part');
check('two parts when two are asked for', balanced(1, 20, 2).parts.length, 2);
check('seven parts when seven are asked for', balanced(1, 20, 7).parts.length, 7);

console.log('\n── it never splits a chapter (§5: “breaking on chapter boundaries”) ──');

for (const part of four.parts) {
	const range = part.passages[0];
	// A part may begin mid-chapter only if the SOURCE range did. These fixtures start at verse 1 and end
	// at a chapter's last verse, so every internal seam must fall exactly on a chapter boundary.
	assert(`part ${part.seriesOrder} starts at verse 1`, range.fromVerse === 1);
	assert(
		`part ${part.seriesOrder} ends on its chapter's last verse`,
		range.toVerse === getVerseCount('OT', 'PS', range.toChapter)
	);
}

console.log('\n── the parts abut exactly: no gap, no overlap, nothing dropped ──');

for (let i = 1; i < four.parts.length; i += 1) {
	const prev = four.parts[i - 1].passages[0];
	const next = four.parts[i].passages[0];
	check(
		`part ${i + 1} begins at the chapter after part ${i} ends`,
		next.fromChapter,
		prev.toChapter + 1
	);
}
check('the first part starts where the source did', four.parts[0].passages[0].fromChapter, 1);
check('the last part ends where the source did', four.parts.at(-1).passages[0].toChapter, 20);

console.log('\n── verse-conservative: balancing moves seams, never verses ──');

const fixedTotal = fixed(1, 20, 1).totalVerses;
check('balanced into 4 covers the same verses as one-per-chapter', four.totalVerses, fixedTotal);
check('and so does balancing into 2', balanced(1, 20, 2).totalVerses, fixedTotal);
check('and into 7', balanced(1, 20, 7).totalVerses, fixedTotal);

console.log('\n── it actually balances, where the chapters allow it ──');

const spread = (plan) => {
	const counts = plan.parts.map((p) => p.verseCount);
	return Math.max(...counts) - Math.min(...counts);
};

// Psalms 1–20 has no dominating chapter, so balancing should beat the fixed split substantially.
//
// ⚠️ The two functions take DIFFERENT parameters and I first conflated them: `fixed()` takes chapters
// PER PART, `balanced()` takes a part COUNT. Twenty chapters at four per part is five parts — so the
// fair comparison is `fixed(…, 4)` against `balanced(…, 5)`. Written as fixed(…, 5) first, which
// produced four parts and compared spreads across different part counts, a meaningless test that the
// assertion caught.
const fixedFive = fixed(1, 20, 4); // four chapters per part → five parts
const balancedFive = balanced(1, 20, 5); // five parts
check('the fixed split gives five parts', fixedFive.parts.length, 5);
check('and so does the balanced one, so the comparison is fair', balancedFive.parts.length, 5);
assert(
	`balanced spread (${spread(balancedFive)}) is smaller than fixed (${spread(fixedFive)})`,
	spread(balancedFive) < spread(fixedFive)
);

console.log('\n── ⚠️ but it does NOT promise even parts, and must not imply it ──');

// Psalms 115–120 is §5's own example. Psalm 119 alone is 176 verses — more than twice everything else
// combined — so NO chapter-respecting partition can be even. Asserted explicitly so the limitation is
// documented behaviour rather than a surprise: a user balancing this range still gets one huge part.
const dominated = balanced(115, 120, 3);
check('it still returns the requested three parts', dominated.parts.length, 3);
const psalm119Part = dominated.parts.find(
	(p) => p.passages[0].fromChapter <= 119 && p.passages[0].toChapter >= 119
);
check('and Psalm 119 sits in a part of its own', psalm119Part.verseCount, PS119);
assert(
	'so the spread remains large — an inherent limit of not splitting chapters, not a defect',
	spread(dominated) > 100
);

console.log('\n── §5: never applied unless the user asks ──');

// "an option the user may choose, never a re-balancing the app applies on their behalf."
const notAsked = planSeriesParts({
	passages: psalms(115, 120),
	translationId: 'esv',
	baseTitle: '',
	chaptersPerPart: 1
});
check('the default is still one part per chapter', notAsked.parts.length, 6);
check('with Psalm 117 left tiny, as §5 accepts', notAsked.parts[2].verseCount, PS117);

// Asking for balance without a part count is not a request — it is an incomplete one, and must not be
// guessed at. A count of 1 is likewise not a series (§4), so both fall through to the default.
check(
	'balanceByLength with no target falls through to the default',
	planSeriesParts({
		passages: psalms(115, 120),
		translationId: 'esv',
		baseTitle: '',
		chaptersPerPart: 1,
		balanceByLength: true
	}).parts.length,
	6
);
check(
	'and a target of one part does too, since one part is not a series',
	planSeriesParts({
		passages: psalms(115, 120),
		translationId: 'esv',
		baseTitle: '',
		chaptersPerPart: 1,
		balanceByLength: true,
		targetParts: 1
	}).parts.length,
	6
);

// ⚠️ The discriminating case, added because mutation testing exposed the gap: the two checks above
// leave `targetParts` absent or 1, so a mutant that IGNORES the balanceByLength flag entirely still
// passed them — it was gated out by the part count instead of by the flag. This case supplies a valid
// part count and withholds only the flag, so the flag is the single thing under test.
check(
	'a valid part count WITHOUT the flag is still not balanced',
	planSeriesParts({
		passages: psalms(115, 120),
		translationId: 'esv',
		baseTitle: '',
		chaptersPerPart: 1,
		targetParts: 3
	}).parts.length,
	6
);
check(
	'while the same call WITH the flag is',
	planSeriesParts({
		passages: psalms(115, 120),
		translationId: 'esv',
		baseTitle: '',
		chaptersPerPart: 1,
		targetParts: 3,
		balanceByLength: true
	}).parts.length,
	3
);

console.log('\n── the requested count is honoured even when one chapter dominates ──');

// ⚠️ Added because mutation testing showed the reserve-a-chapter guard could be deleted with every
// assertion still green. It cannot be: on Psalms 115–120 a greedy fill without it swallows chapters
// into early groups and emits FEWER parts than asked for (4 requested → 3 delivered, 5 → 4). Psalm 119
// is what provokes it — 176 verses makes the ideal average large enough that the greedy test keeps
// accepting chapters.
//
// A planner that silently returns fewer parts than the preview promised is the §5 failure this whole
// section exists to prevent: what the user approved is not what gets built.
check('four parts really means four, not three', balanced(115, 120, 4).parts.length, 4);
check('five parts really means five', balanced(115, 120, 5).parts.length, 5);
check('and six (one per chapter) is still reachable', balanced(115, 120, 6).parts.length, 6);
check('a longer dominated range also honours its count', balanced(110, 120, 5).parts.length, 5);

// Those counts must not be bought by dropping verses.
check(
	'the four-part split is verse-conservative',
	balanced(115, 120, 4).totalVerses,
	fixed(115, 120, 1).totalVerses
);
check(
	'and so is the five-part split',
	balanced(115, 120, 5).totalVerses,
	fixed(115, 120, 1).totalVerses
);

console.log('\n── degenerate requests are clamped, never allowed to invent parts ──');

// A part must hold at least one whole chapter, so more parts than chapters is impossible.
const tooMany = balanced(1, 5, 99);
check('asking for 99 parts of a 5-chapter range yields 5', tooMany.parts.length, 5);
check('and it is still verse-conservative', tooMany.totalVerses, fixed(1, 5, 1).totalVerses);

console.log(
	'\n── a partial first chapter is weighted as its covered portion, not its whole length ──'
);

// Q12 allows a part to contain a partial chapter, so a source range may begin mid-chapter. Balancing on
// the chapter's full length would over-weight it and skew every seam after it.
const partial = planSeriesParts({
	passages: [
		{ testament: 'OT', book: 'PS', fromChapter: 1, fromVerse: 4, toChapter: 6, toVerse: 10 }
	],
	translationId: 'esv',
	baseTitle: '',
	balanceByLength: true,
	targetParts: 2
});
check('two parts', partial.parts.length, 2);
check('the first keeps the source’s mid-chapter start', partial.parts[0].passages[0].fromVerse, 4);
check('the last keeps the source’s mid-chapter end', partial.parts.at(-1).passages[0].toVerse, 10);

const partialTotal = partial.parts.reduce((sum, p) => sum + p.verseCount, 0);
check('and the covered verses are conserved', partial.totalVerses, partialTotal);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
