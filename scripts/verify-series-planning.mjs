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
check('Romans part 1 title', r1.parts[0].title, 'Romans 1');

// The plan's own worked case: no 2-way split of Romans has both halves compliant (433/2=216.5).
const r2 = planSeriesParts({ passages: romans, chaptersPerPart: 8, translationId: 'esv', baseTitle: 'Romans' });
check('Romans 8ch/part -> 2 parts', r2.parts.length, 2);
check('Romans 1-8 verses (plan says 225, NOT 216)', r2.parts[0].verseCount, 225);
check('Romans 9-16 verses (plan says 208)', r2.parts[1].verseCount, 208);
console.log('   -> a part over half of Romans (216) must warn:',
  r2.warnings.some(w => w.scope === 'part') ? 'WARNS' : 'SILENT (BUG)');
if (!r2.warnings.some(w => w.scope === 'part')) failures++;

// Trap 8: fine parting silences per-part checks; the aggregate must still speak.
const john = [{ testament: 'NT', book: 'JN', fromChapter: 1, fromVerse: 1, toChapter: 21, toVerse: 25 }];
const j = planSeriesParts({ passages: john, chaptersPerPart: 1, translationId: 'esv', baseTitle: 'John' });
check('John 1ch/part -> 21 parts', j.parts.length, 21);
check('John total verses (879)', j.totalVerses, 879);
check('trap 8: no PART warnings at 1ch/part', j.warnings.filter(w => w.scope === 'part').length, 0);
console.log('   -> series-level aggregate must still warn:',
  j.warnings.some(w => w.scope === 'series') ? 'WARNS' : 'SILENT (BUG)');
if (!j.warnings.some(w => w.scope === 'series')) failures++;

// Partial-chapter bounds must be preserved, not silently widened to whole chapters.
const partial = [{ testament: 'NT', book: 'RO', fromChapter: 1, fromVerse: 18, toChapter: 8, toVerse: 39 }];
const pp = planSeriesParts({ passages: partial, chaptersPerPart: 4, translationId: 'esv', baseTitle: 'Romans' });
check('partial: first part keeps fromVerse 18', pp.parts[0].passages[0].fromVerse, 18);
check('partial: last part keeps toVerse 39', pp.parts.at(-1).passages[0].toVerse, 39);
check('partial: interior part starts at verse 1', pp.parts[1].passages[0].fromVerse, 1);

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
console.log(sanity.totalVerses === 38
  ? 'PASS  fixture sanity: Haggai resolves to 38 verses, so its silence is real'
  : `FAIL  fixture sanity: Haggai resolved to ${sanity.totalVerses}, expected 38 — silence above is untrustworthy`);
