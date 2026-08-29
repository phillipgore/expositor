/**
 * Verify that chapter-sized series parts are always within ESV's limits — as a fact about the
 * canon, not an assumption.
 *
 * ## Why this file exists
 *
 * A whole-book study of Matthew could not be saved, in ANY configuration. Save stayed disabled
 * at 7, 4, 2 and 1 chapters per part, because the blocking check read the form's passages (one
 * 1071-verse range) rather than the parts the user had just configured. The reasoning that
 * unblocked it was: a chapter is small enough that a chapter-sized part is never near ESV's
 * ceiling.
 *
 * That reasoning is only safe if it is TRUE OF EVERY CHAPTER IN THE BIBLE, and "I checked
 * Matthew" is not that. The longest chapter anywhere is Psalm 119 at 176 verses — roughly a
 * third of the 500-verse limit — and the margin is what makes chapter-per-part unconditionally
 * safe. If `bible.json` is ever corrected, re-versified, or extended with another translation's
 * versification, this file fails loudly instead of letting a silent over-limit part through.
 *
 * ## The clauses being relied on (api.esv.org, retrieved 2026-08-28)
 *
 *   - "You may request up to 500 verses per query, or half a book, whichever is less
 *      (excepting single-chapter and double-chapter books)."
 *   - "You may not display more than 500 verses or one-half of any book (whichever is less)
 *      on any page."
 *
 * Both are scoped to a UNIT — one query, one page. A series part is its own study at its own
 * URL, fetched by its own request, so those units are the parts. This file checks the parts.
 *
 * ⚠️ Note the "half a book" half of the clause: for a SHORT book, half the book binds before
 * 500 does, and a single chapter can approach half of a short book. That case is asserted
 * below rather than hand-waved, because it is the one way "chapters are small" could fail.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-chapter-verse-bounds.mjs
 */

import bibleData from '../src/lib/data/bible.json' with { type: 'json' };
import { planSeriesParts, isSeriesEligible } from '../src/lib/utils/seriesPlanning.js';
import { checkSinglePassageSupport } from '../src/lib/utils/translationLimits.js';
import { checkSeriesExport } from '../src/lib/utils/seriesExport.js';

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

const ESV_REQUEST_LIMIT = 500;

/** Every chapter in the canon, as { testament, book, title, chapter, verses }. */
const chapters = [];
for (const testament of bibleData[0].testamentData) {
	for (const book of testament.bookData) {
		if (!book.chapterData) continue;
		for (const entry of book.chapterData) {
			for (const [chapter, verses] of Object.entries(entry)) {
				chapters.push({
					testament: testament._id,
					book: book._id,
					title: book.title,
					chapter: Number(chapter),
					verses
				});
			}
		}
	}
}

console.log('\n── the canon is fully loaded, so "every chapter" means every chapter ──');

// A guard on the guard: if the traversal above silently produced nothing, every assertion
// below would vacuously pass and this file would certify a claim it never tested.
assert('all 66 books contributed chapters', new Set(chapters.map((c) => c.book)).size === 66);
check('and the canon has 1189 chapters', chapters.length, 1189);

console.log('\n── no chapter anywhere approaches ESV’s 500-verse ceiling ──');

const longest = chapters.reduce((a, b) => (b.verses > a.verses ? b : a));
check('the longest chapter is Psalm 119', `${longest.title} ${longest.chapter}`, 'Psalms 119');
check('at 176 verses', longest.verses, 176);
assert(
	'which leaves a margin of more than 2x against the 500-verse limit',
	longest.verses * 2 < ESV_REQUEST_LIMIT
);
assert(
	'and EVERY chapter in the Bible is under the limit',
	chapters.every((c) => c.verses < ESV_REQUEST_LIMIT)
);

console.log('\n── so a chapter-per-part series is servable, book by book ──');

// The real test: run the planner over every multi-chapter book at one chapter per part and ask
// the SAME function the form's blocking check uses of every part produced. This is the property
// the unblocking depends on, asserted across the whole canon rather than on a sample.
//
// ⚠️ `chapterData` is a ONE-ELEMENT array wrapping a single object keyed by chapter number —
// `[{ "1": 25, "2": 23, … }]` — not an array of chapters. A first draft here filtered on
// `chapterData.length < 2` and silently excluded every book in the Bible, leaving the loop to
// pass by checking nothing. The two `assert`s below on the counts are what caught it, which is
// the argument for asserting that a test did work rather than only that it did not fail.
const multiChapterBooks = [];
for (const testament of bibleData[0].testamentData) {
	for (const book of testament.bookData) {
		if (!book.chapterData?.[0] || book.chapterCount < 2) continue;
		multiChapterBooks.push({ testament: testament._id, book });
	}
}

let partsChecked = 0;
const unservable = [];
for (const { testament, book } of multiChapterBooks) {
	const lastChapter = book.chapterCount;
	const lastVerse = book.chapterData[0][String(lastChapter)];
	const plan = planSeriesParts({
		passages: [
			{
				testament,
				book: book._id,
				fromChapter: 1,
				fromVerse: 1,
				toChapter: lastChapter,
				toVerse: lastVerse
			}
		],
		chaptersPerPart: 1,
		translationId: 'esv',
		baseTitle: book.title
	});
	for (const part of plan.parts) {
		partsChecked += 1;
		const support = checkSinglePassageSupport(part.passages[0], 'esv');
		if (!support.canBeSinglePassage) {
			unservable.push(`${book.title} part ${part.seriesOrder}: ${support.reason}`);
		}
	}
}

assert('every multi-chapter book was planned', multiChapterBooks.length > 50);
assert('and produced well over a thousand parts to check', partsChecked > 1000);
if (unservable.length > 0) {
	console.log(`    first offenders: ${unservable.slice(0, 5).join(' | ')}`);
}
check('no part of any book is unservable at 1 chapter per part', unservable.length, 0);

console.log('\n── "create a series" is never advice the user cannot take ──');

// The blocking alert offers three remedies, and one of them names a control: "Create a series,
// shorten a passage, or switch to NET." That is only honest if EVERY range able to trigger the
// block is also able to become a series — otherwise the form points at radios it did not render.
//
// The two rules come from different places and were never written to agree. Blocking is
// `checkSinglePassageSupport()` (a verse count against ESV's request cap and the complete-book
// rule); eligibility is `getPartingStrategy()` (a chapter count, 2+). They line up only because
// no single chapter is long enough to trip the first — Psalm 119, the longest at 176 verses, is
// nowhere near 500. That is an accident of the canon, not a designed invariant, so it is checked
// exhaustively here rather than assumed. If the two ever diverge, this fails and the copy in
// `StudyForm` needs its condition revisited.
const blockedButIneligible = [];
for (const { testament, book } of (() => {
	const out = [];
	for (const t of bibleData[0].testamentData) {
		for (const b of t.bookData) {
			if (b.chapterData?.[0]) out.push({ testament: t._id, book: b });
		}
	}
	return out;
})()) {
	const cd = book.chapterData[0];
	for (let from = 1; from <= book.chapterCount; from += 1) {
		for (let to = from; to <= book.chapterCount; to += 1) {
			const range = {
				testament,
				book: book._id,
				fromChapter: from,
				fromVerse: 1,
				toChapter: to,
				toVerse: cd[String(to)]
			};
			if (
				!checkSinglePassageSupport(range, 'esv').canBeSinglePassage &&
				!isSeriesEligible([range])
			) {
				blockedButIneligible.push(`${book.title} ${from}-${to}`);
			}
		}
	}
}

if (blockedButIneligible.length > 0) {
	console.log(`    offenders: ${blockedButIneligible.slice(0, 5).join(', ')}`);
}
check(
	'no range in the canon blocks Save while being unable to become a series',
	blockedButIneligible.length,
	0
);

console.log('\n── the short-book case, where half-a-book binds before 500 does ──');

// Obadiah, Philemon, 2/3 John, Jude (1 ch) and Haggai (2 ch) are exempted by the clause itself,
// so they are servable whole and never need parting. The interesting neighbours are 3-chapter
// books, where half the book is barely more than one chapter.
const titus = planSeriesParts({
	passages: [
		{ testament: 'NT', book: 'TI', fromChapter: 1, fromVerse: 1, toChapter: 3, toVerse: 15 }
	],
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Titus'
});
check('Titus parts into 3', titus.parts.length, 3);
check(
	'and each single chapter is servable despite half-a-book being small',
	titus.parts.filter((p) => !checkSinglePassageSupport(p.passages[0], 'esv').canBeSinglePassage)
		.length,
	0
);

console.log('\n── and the whole-book series no longer reports a page violation ──');

const matthew = planSeriesParts({
	passages: [
		{ testament: 'NT', book: 'MT', fromChapter: 1, fromVerse: 1, toChapter: 28, toVerse: 20 }
	],
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
check('28 parts', matthew.parts.length, 28);
check('no part-scoped warnings', matthew.warnings.filter((w) => w.scope === 'part').length, 0);

// Creating a whole-book series is now completely silent. The aggregate that used to speak here
// said nothing the user could act on: it fired at every stepper setting and named a boundary
// (export) they had not reached. It is enforced where it applies — `checkSeriesExport()` in
// `MenuExport.guardExport()`, which BLOCKS per Q32. See COMPLIANCE.md §1.10.
check('no series-scoped notice', matthew.warnings.filter((w) => w.scope === 'series').length, 0);
check('so a whole-book Matthew series warns about nothing', matthew.warnings.length, 0);

// And the export gate still refuses it, so the coverage moved rather than vanished.
const matthewExport = checkSeriesExport(
	matthew.parts.map((p) => ({ passages: p.passages })),
	'esv'
);
check('export counts the whole book', matthewExport.totalVerses, 1071);
assert('and refuses it', !matthewExport.compliant);
check('blocking, not merely warning', matthewExport.blocked, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
