/**
 * Verifies seriesRuns.js against the tables in SERIES_PLAN §4 and §8.
 *
 * Every case below is taken from the plan rather than invented, so a failure here means the code
 * and the plan disagree — which is the only interesting kind of failure.
 *
 * Run: node scripts/verify-series-runs.js
 */

import {
	classifyBoundary,
	computeRuns,
	isReorderable,
	getBoundaryDisabledReason,
	describePartDeletion,
	describeSeriesDeletion
} from '../src/lib/utils/seriesRuns.js';


let passed = 0;
let failed = 0;

function check(label, actual, expected) {
	const ok = actual === expected;
	if (ok) {
		passed += 1;
		console.log(`  ✅ ${label} → ${actual}`);
	} else {
		failed += 1;
		console.log(`  ❌ ${label} → got ${actual}, expected ${expected}`);
	}
}

/** Build a part from a compact range spec. */
function part(order, testament, book, bookName, fromChapter, fromVerse, toChapter, toVerse) {
	return {
		id: `p${order}`,
		seriesOrder: order,
		// Titled so the delete-warning checks below can assert the copy names real neighbours.
		title:
			fromChapter === toChapter
				? `${bookName} ${fromChapter}`
				: `${bookName} ${fromChapter}–${toChapter}`,
		passages: [
			{ testament, bookId: book, bookName, fromChapter, fromVerse, toChapter, toVerse }
		]
	};
}


console.log('\n§8 adjacency table — the four rows, verbatim from the plan');

// | Part 3 ends Rom 3:31, part 4 begins Rom 4:1 | ✅ Contiguous |
check(
	'Rom 3:31 → Rom 4:1 (chapter 3 has 31 verses)',
	classifyBoundary(
		part(3, 'NT', 'RO', 'Romans', 3, 1, 3, 31),
		part(4, 'NT', 'RO', 'Romans', 4, 1, 4, 25)
	),
	'contiguous'
);

// | Part 3 ends Rom 3:31, part 4 begins Rom 5:1 | ❌ Gap — chapter 4 omitted |
check(
	'Rom 3:31 → Rom 5:1 (chapter 4 omitted)',
	classifyBoundary(
		part(3, 'NT', 'RO', 'Romans', 3, 1, 3, 31),
		part(4, 'NT', 'RO', 'Romans', 5, 1, 5, 21)
	),
	'gap'
);

// | Part 3 ends Eph 6:24, part 4 begins Phil 1:1 | ❌ Different books |
check(
	'Eph 6:24 → Phil 1:1',
	classifyBoundary(
		part(3, 'NT', 'EP', 'Ephesians', 1, 1, 6, 24),
		part(4, 'NT', 'PH', 'Philippians', 1, 1, 4, 23)
	),
	'different-books'
);

// | Part 3 is Rom 1–3, part 4 is Rom 3–5 (overlap) | ❓ Undecided — Q40 |
check(
	'Rom 1–3 → Rom 3–5 (overlap, Q40)',
	classifyBoundary(
		part(3, 'NT', 'RO', 'Romans', 1, 1, 3, 31),
		part(4, 'NT', 'RO', 'Romans', 3, 1, 5, 21)
	),
	'overlap'
);

console.log('\nMid-chapter adjacency (the predicate is verses, not chapters)');

check(
	'Rom 8:1-17 → Rom 8:18-39 (same chapter, next verse)',
	classifyBoundary(
		part(1, 'NT', 'RO', 'Romans', 8, 1, 8, 17),
		part(2, 'NT', 'RO', 'Romans', 8, 18, 8, 39)
	),
	'contiguous'
);

check(
	'Rom 8:1-17 → Rom 8:20-39 (verse 18-19 skipped)',
	classifyBoundary(
		part(1, 'NT', 'RO', 'Romans', 8, 1, 8, 17),
		part(2, 'NT', 'RO', 'Romans', 8, 20, 8, 39)
	),
	'gap'
);

// The subtle one: a part that stops short of its chapter's end is NOT contiguous with the next
// chapter, even though the chapter numbers are consecutive.
check(
	'Rom 3:1-20 → Rom 4:1 (ch.3 runs to v.31, so v.21-31 are missing)',
	classifyBoundary(
		part(1, 'NT', 'RO', 'Romans', 3, 1, 3, 20),
		part(2, 'NT', 'RO', 'Romans', 4, 1, 4, 25)
	),
	'gap'
);

console.log('\n§4 runs table — the three rows, verbatim');

// | Romans 1–16, sixteen parts | 1 run | No |
const romans16 = [];
for (let chapter = 1; chapter <= 16; chapter += 1) {
	// Real chapter lengths matter here; use the last verse of each Romans chapter.
	const lastVerses = [32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27];
	romans16.push(
		part(chapter, 'NT', 'RO', 'Romans', chapter, 1, chapter, lastVerses[chapter - 1])
	);
}
check('Romans 1–16 in sixteen parts → run count', computeRuns(romans16).length, 1);
check('Romans 1–16 in sixteen parts → reorderable', isReorderable(romans16), false);

// | Prison Epistles, four parts | 4 runs | Yes |
const prisonEpistles = [
	part(1, 'NT', 'EP', 'Ephesians', 1, 1, 6, 24),
	part(2, 'NT', 'PH', 'Philippians', 1, 1, 4, 23),
	part(3, 'NT', 'CO', 'Colossians', 1, 1, 4, 18),
	part(4, 'NT', 'PM', 'Philemon', 1, 1, 1, 25)
];
check('Prison Epistles → run count', computeRuns(prisonEpistles).length, 4);
check('Prison Epistles → reorderable', isReorderable(prisonEpistles), true);

// | Rom 1–7 + Rom 8, two parts | 2 runs | Yes |
// NOTE: these two ARE canonically contiguous (Rom 7:25 → Rom 8:1), so by the predicate this is
// ONE run, not two. See the analysis printed at the end.
const rom7plus8 = [
	part(1, 'NT', 'RO', 'Romans', 1, 1, 7, 25),
	part(2, 'NT', 'RO', 'Romans', 8, 1, 8, 39)
];
check('Rom 1–7 + Rom 8 → run count (predicate says contiguous)', computeRuns(rom7plus8).length, 1);

console.log('\n§4 part-delete: the run splits in two');

// "delete part 8 of a sixteen-part Romans series and you have parts 1–7 and parts 9–16"
const romansMinusEight = romans16.filter((p) => p.seriesOrder !== 8);
check('Romans 1–16 minus part 8 → run count', computeRuns(romansMinusEight).length, 2);
check('Romans minus part 8 → reorderable', isReorderable(romansMinusEight), true);
const splitRuns = computeRuns(romansMinusEight);
check('  first block length (parts 1–7)', splitRuns[0].length, 7);
check('  second block length (parts 9–16)', splitRuns[1].length, 8);

console.log('\n§8/§11 reason strings — eligible vs never-applicable');

// ⚠️ This asserted `'Not available across parts yet.'` until the five cross-part commands shipped.
// A contiguous seam is now ELIGIBLE, and every caller reads a non-null reason as "disable this", so
// keeping the string would have gone on greying out the commands at precisely the seams where they
// work. §11: a promise of a later fix must not outlive the fix.
check(
	'contiguous seam has NO reason — it is enabled',
	getBoundaryDisabledReason(
		part(1, 'NT', 'RO', 'Romans', 3, 1, 3, 31),
		part(2, 'NT', 'RO', 'Romans', 4, 1, 4, 25)
	),
	null
);

check(
	'book change names both books and never says "yet"',
	getBoundaryDisabledReason(
		part(1, 'NT', 'EP', 'Ephesians', 1, 1, 6, 24),
		part(2, 'NT', 'PH', 'Philippians', 1, 1, 4, 23)
	),
	"Ephesians and Philippians aren't adjacent in Scripture."
);

check(
	'gap gets the never-applicable string',
	getBoundaryDisabledReason(
		part(1, 'NT', 'RO', 'Romans', 3, 1, 3, 31),
		part(2, 'NT', 'RO', 'Romans', 5, 1, 5, 21)
	),
	"These parts aren't adjacent in Scripture."
);

// §8: "a Prison Epistles series has four parts and four seams, none canonically contiguous" —
// note the plan says "four seams" but four parts have three seams; verify the substance, which is
// that NONE of them is contiguous and none of the reasons promises a fix.
const prisonReasons = [];
for (let i = 1; i < prisonEpistles.length; i += 1) {
	prisonReasons.push(getBoundaryDisabledReason(prisonEpistles[i - 1], prisonEpistles[i]));
}
check('Prison Epistles seam count', prisonReasons.length, 3);
check(
	'no Prison Epistles seam promises a later fix',
	prisonReasons.some((reason) => reason.includes('yet')),
	false
);

console.log('\n§4 delete warnings — three named consequences');

// §4's worked example: deleting Part 8 of sixteen splits Romans into 1–7 and 9–16.
const deleteEight = describePartDeletion(romans16, 'p8');
check('deleting interior part 8 → splitsRun', deleteEight.splitsRun, true);
check('deleting interior part 8 → does not dissolve', deleteEight.dissolves, false);
check('  names the earlier neighbour (Romans 7)', deleteEight.consequences[0].includes('Romans 7'), true);
check('  names the later neighbour (Romans 9)', deleteEight.consequences[0].includes('Romans 9'), true);
check(
	'  consequence: dead seam',
	deleteEight.consequences.some((c) => c.includes('no longer work across')),
	true
);
check(
	'  consequence: newly reorderable',
	deleteEight.consequences.some((c) => c.includes('may now be reordered')),
	true
);
check(
	'  consequence: no longer continuous',
	deleteEight.consequences.some((c) => c.includes('continuous passage')),
	true
);
check(
	'  the dead seam is never described as "yet"',
	deleteEight.consequences.some((c) => c.includes('yet')),
	false
);

// Deleting the LAST part shortens the run instead of splitting it, so the three
// split-consequences would be false claims.
const deleteSixteen = describePartDeletion(romans16, 'p16');
check('deleting the final part → splitsRun', deleteSixteen.splitsRun, false);
check(
	'  does not claim a dead seam',
	deleteSixteen.consequences.some((c) => c.includes('no longer work across')),
	false
);

// Prison Epistles: every seam is already dead, so no seam can newly die.
const deletePrison = describePartDeletion(prisonEpistles, 'p2');
check('deleting a non-adjacent part → splitsRun', deletePrison.splitsRun, false);

// §4: deleting down to one part dissolves the series.
const dissolve = describePartDeletion(rom7plus8, 'p1');
check('two parts → deleting one dissolves the series', dissolve.dissolves, true);
check(
	'  says the survivor becomes a standalone study',
	dissolve.consequences[0].includes('standalone study'),
	true
);
check(
	'  names the surviving part',
	dissolve.consequences[0].includes('Romans 8'),
	true
);

// §4: the series confirmation must state the part count and that it cannot be undone.
const seriesDelete = describeSeriesDeletion({ name: 'Romans' }, 16);
check('series delete states the part count', seriesDelete.consequences[0].includes('all 16 parts'), true);
check(
	'series delete names structure, notes and commentary',
	seriesDelete.consequences[0].includes('structure, notes and commentary'),
	true
);
check(
	'series delete says it cannot be undone',
	seriesDelete.consequences.some((c) => c.includes('cannot be undone')),
	true
);
check('series delete singularises one part', describeSeriesDeletion({ name: 'X' }, 1).consequences[0].includes('all 1 part'), true);

console.log('\nEdge cases');


check('empty series → no runs', computeRuns([]).length, 0);
check('single part → one run', computeRuns([romans16[0]]).length, 1);
check('single part → not reorderable', isReorderable([romans16[0]]), false);
check(
	'part with no passages → treated as a gap, not adjacency',
	classifyBoundary({ id: 'a', seriesOrder: 1, passages: [] }, romans16[0]),
	'gap'
);

// seriesOrder, not array order, decides sequence (§4: the user's arrangement is respected)
const shuffled = [romans16[2], romans16[0], romans16[1]];
check('shuffled array is sorted by seriesOrder before folding', computeRuns(shuffled).length, 1);

console.log(`\n${passed} passed, ${failed} failed`);

// Printed unconditionally. This started as a failure-only note, which was a mistake: the check
// above asserts the *predicate's* answer (1 run), so the note would never print precisely because
// the code and the plan disagree in a way I chose to resolve. A silent resolution is the thing to
// avoid, so it is stated on every run.
console.log(`
⚠️  One documented disagreement with SERIES_PLAN, resolved in favour of the predicate:

  §4's runs table lists "Rom 1–7 + Rom 8, two parts → 2 runs → reorderable: Yes". But Romans 7
  ends at verse 25 and Romans 8 begins at verse 1, so by §8's own predicate — "does part n−1 end
  at the word immediately preceding part n's first word" — that seam IS contiguous, making this
  ONE run and not reorderable. The check above asserts 1.

  Why the predicate wins: §4 says "This is the same predicate as §8's adjacency rule, reused",
  and §4's prose draws exactly this conclusion three paragraphs later — "teaching Romans 8 before
  Romans 1–7 is not a reordering. It is a differently-shaped study." A user who wants Rom 8 first
  must shape it as two NON-adjacent parts; Rom 1–7 + Rom 8 is contiguous and so is one rigid run.
  The table row contradicts the rule it is illustrating.
`);

if (failed > 0) {
	console.log('❌ Checks failed above — the code and the plan disagree somewhere new.\n');
	process.exit(1);
}


console.log('\nAll checks match the plan.\n');
