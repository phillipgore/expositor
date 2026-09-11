import { planSeriesParts, getPartingStrategy, isSeriesEligible } from '../src/lib/utils/seriesPlanning.js';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}${ok ? '' : `, expected ${expected}`}`);
};

// Romans, whole book, 1 chapter per part.
const romans = [{ testament: 'NT', book: 'RO', fromChapter: 1, fromVerse: 1, toChapter: 16, toVerse: 27 }];
const r1 = planSeriesParts({ passages: romans, chaptersPerPart: 1, translationId: 'esv', baseTitle: 'Romans' });
check('Romans 1ch/part -> part count', r1.parts.length, 16);
check('Romans total verses (bible.json says 433)', r1.totalVerses, 433);
check('Romans part 1 verses (ch1 = 32)', r1.parts[0].verseCount, 32);
check('Romans part 8 verses (ch8 = 39)', r1.parts[7].verseCount, 39);
// A part is named by its full passage reference, verses included — not "Romans 1", which names a
// chapter rather than the range the part actually covers. Hyphen, matching
// `formatPassageReference`, which is the formatter `partTitle()` now calls.
check('Romans part 1 title', r1.parts[0].title, 'Romans 1:1-32');

// The plan's own worked case: no 2-way split of Romans has both halves compliant (433/2=216.5).
const r2 = planSeriesParts({ passages: romans, chaptersPerPart: 8, translationId: 'esv', baseTitle: 'Romans' });
check('Romans 8ch/part -> 2 parts', r2.parts.length, 2);
check('Romans 1-8 verses (plan says 225, NOT 216)', r2.parts[0].verseCount, 225);
check('Romans 9-16 verses (plan says 208)', r2.parts[1].verseCount, 208);
console.log('   -> a part over half of Romans (216) must warn:',
  r2.warnings.some(w => w.scope === 'part') ? 'WARNS' : 'SILENT (BUG)');
if (!r2.warnings.some(w => w.scope === 'part')) failures++;

// Trap 8: fine parting silences per-part checks. This script used to require a SERIES-scope
// warning here and had been failing ever since the aggregate moved.
//
// ⚠️ It is not merely stale — it asserted the OPPOSITE of what
// `verify-per-passage-parting.mjs` asserts for the identical fixture ("and creation is silent
// about the series"). Two verifiers demanding contradictory behaviour of one function meant one
// of them was guaranteed red whatever the code did, which is how this sat unnoticed: the script
// was also absent from `npm run verify`, so nothing ran it.
//
// Trap 8's worry is real and still answered — by `checkSeriesExport()` at the export boundary,
// which BLOCKS, rather than by a creation-time notice that merely mentioned. The cross-check
// lives in `verify-per-passage-parting.mjs`, which proves the export check still catches this
// exact series; asserting only "creation is silent" would pass equally well if the aggregate had
// been deleted outright.
const john = [{ testament: 'NT', book: 'JN', fromChapter: 1, fromVerse: 1, toChapter: 21, toVerse: 25 }];
const j = planSeriesParts({ passages: john, chaptersPerPart: 1, translationId: 'esv', baseTitle: 'John' });
check('John 1ch/part -> 21 parts', j.parts.length, 21);
check('John total verses (879)', j.totalVerses, 879);
check('trap 8: no PART warnings at 1ch/part', j.warnings.filter(w => w.scope === 'part').length, 0);
check('and none at series scope either — that check moved to export', j.warnings.filter(w => w.scope === 'series').length, 0);

// Partial-chapter bounds must be preserved, not silently widened to whole chapters.
const partial = [{ testament: 'NT', book: 'RO', fromChapter: 1, fromVerse: 18, toChapter: 8, toVerse: 39 }];
const pp = planSeriesParts({ passages: partial, chaptersPerPart: 4, translationId: 'esv', baseTitle: 'Romans' });
check('partial: first part keeps fromVerse 18', pp.parts[0].passages[0].fromVerse, 18);
check('partial: last part keeps toVerse 39', pp.parts.at(-1).passages[0].toVerse, 39);
check('partial: interior part starts at verse 1', pp.parts[1].passages[0].fromVerse, 1);

// ...and the TITLE must say so. This is the case that makes the full reference load-bearing
// rather than merely tidier: the old "Romans 1" named a chapter the part does not begin at.
check('partial: the title reports the real start verse', pp.parts[0].title, 'Romans 1:18-4:25');

// ⚠️ The name comes from the BOOK, never from the study title. `partTitle()` builds a passage
// reference, and a reference that opens with free text the user typed ("The Road to Romans
// 1:1-32") cites a book that does not exist. Harmless while titles were `${baseTitle} ${ch}`;
// not harmless now. `planByPassage` already worked this way — the strategies now agree.
const titled = planSeriesParts({ passages: romans, chaptersPerPart: 8, translationId: 'esv', baseTitle: 'The Road to Righteousness' });
check('the study title does not leak into a part reference', titled.parts[0].title, 'Romans 1:1-8:39');

// Strategy selection.
check('multi-passage -> passage-per-part', getPartingStrategy([{}, {}]), 'passage-per-part');
check('single chapter -> ineligible', getPartingStrategy([{ fromChapter: 3, toChapter: 3 }]), 'ineligible');
check('Haggai 2ch IS eligible (trap 10)', isSeriesEligible([{ testament: 'OT', book: 'HG', fromChapter: 1, fromVerse: 1, toChapter: 2, toVerse: 23 }]), true);

// Short-book exception: Haggai whole must NOT warn (the hand-rolled version would have).
const hg = planSeriesParts({ passages: [{ testament: 'OT', book: 'HG', fromChapter: 1, fromVerse: 1, toChapter: 2, toVerse: 23 }], chaptersPerPart: 1, translationId: 'esv', baseTitle: 'Haggai' });
check('Haggai whole: zero warnings (short-book exception)', hg.warnings.length, 0);

// NET has no display cap: a whole-book NET series should stay silent.
const netJohn = planSeriesParts({ passages: john, chaptersPerPart: 1, translationId: 'net', baseTitle: 'John' });
check('NET John: no display warnings', netJohn.warnings.filter(w => w.scope === 'series').length, 0);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);

// Guard against the false pass that trap 3 produces: an unknown book id fails quietly
// (bookTotal <= 0), so "zero warnings" can mean "book not found" rather than "compliant".
// Assert the fixtures resolve at all before trusting any silence above.
const sanity = planSeriesParts({ passages: [{ testament: 'OT', book: 'HG', fromChapter: 1, fromVerse: 1, toChapter: 2, toVerse: 23 }], chaptersPerPart: 1, translationId: 'esv' });
const sanityOk = sanity.totalVerses === 38;
if (!sanityOk) failures++;
console.log(sanityOk
  ? 'PASS  fixture sanity: Haggai resolves to 38 verses, so its silence is real'
  : `FAIL  fixture sanity: Haggai resolved to ${sanity.totalVerses}, expected 38 — silence above is untrustworthy`);

// ⚠️ EXIT NON-ZERO on failure. Without this the script printed "1 CHECK(S) FAILED" and exited 0,
// so adding it to `npm run verify` — an `&&` chain — would have been decorative: the chain reads
// exit codes, not stdout. That is the other half of why the contradictory trap-8 assertion above
// survived unnoticed for so long.
//
// Set at the very end so the sanity check, which runs after the summary line, is counted too.
if (failures > 0) process.exitCode = 1;
