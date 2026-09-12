/**
 * Verify that Join Down resolves to exactly the Join Up the user could have performed by hand.
 *
 * ## The claim under test
 *
 * Structure is anchor-based: an item owns a `startingWordId` and runs until the next anchor begins.
 * A join therefore does not "move content from A to B" — it REMOVES ONE ANCHOR, and the surviving
 * item is always the earlier of the pair. So "join X with what follows" and "join X's successor into
 * X" are the same write, and Join Down is implemented by resolving the successor and handing it to
 * the existing backwards path (`joinRouting.js` → `resolveJoinDownTarget`).
 *
 * That is a real claim and it can fail. If it did, Join Down would silently fold the WRONG pair —
 * and because the two joins produce structurally similar results, a user would likely not notice
 * until the wrong note had already been merged. Q35 leaves the app with no undo, so the pairing is
 * pinned here rather than trusted.
 *
 * The properties verified:
 *   - Join Down on X targets X's successor, at every granularity;
 *   - the item Join Down hands onward is the SAME item Join Up would act on if the user had selected
 *     the successor — i.e. down(X) ≡ up(successor(X));
 *   - the pairing survives a passage boundary, including when the successor lives in another part
 *     (the case the user CANNOT reach by selecting it, which is why Join Down exists at all);
 *   - the LAST item in the whole sequence has no successor, and that refusal is permanent — it must
 *     never be phrased as "yet" (§11);
 *   - an ineligible seam refuses from the downward side with the same verdict as the upward side.
 *
 * ⚠️ Pure decision layer, like `verify-sequence-scope.mjs`: it opens no database. It proves the
 * resolution the endpoint performs, not the write the executor then makes.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-join-direction.mjs
 */

import { resolveScope, flattenSequence } from '../src/lib/utils/sequenceScope.js';

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

const w = (book, chapter, verse, word = 1) =>
	`${book}-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-${String(word).padStart(3, '0')}`;

const seg = (id, wordId) => ({ id, startingWordId: wordId });
const sec = (id, wordId, segments) => ({ id, startingWordId: wordId, segments });
const col = (id, wordId, sections) => ({ id, startingWordId: wordId, sections });

const row = (id, bookId, fromChapter, fromVerse, toChapter, toVerse, bookName) => ({
	id,
	testament: 'NT',
	bookId,
	bookName,
	fromChapter,
	fromVerse,
	toChapter,
	toVerse
});

/**
 * The resolution `routeJoin` performs for a Join Down, extracted so the verifier exercises the same
 * decision the endpoint does rather than a paraphrase of it.
 *
 * Mirrors `resolveJoinDownTarget`: resolve the successor with direction 'next', then hand ITS id and
 * ITS passage to the backwards path. The passage must travel too — the successor may live in another
 * passage, and every downstream site resolves the sequence from the passage id it is given.
 */
function joinDownResolvesTo(sequence, granularity, itemId) {
	const scope = resolveScope({ sequence, granularity, itemId, direction: 'next' });
	if (!scope.ok) return { ok: false, reason: scope.reason };
	return { ok: true, itemId: scope.target.id, passageId: scope.target.passageId };
}

// Romans 1–2 then Romans 3–4: contiguous (Rom 2 ends at v29, part two starts 3:1).
const romansOneTwo = row('p1', 'RO', 1, 1, 2, 29, 'Romans');
const romansThreeFour = row('p2', 'RO', 3, 1, 4, 25, 'Romans');

const sequence = [
	{
		passageId: 'p1',
		passage: romansOneTwo,
		tree: [
			col('c1', w('RO', 1, 1), [
				sec('s1', w('RO', 1, 1), [seg('g1', w('RO', 1, 1)), seg('g2', w('RO', 1, 16))]),
				sec('s2', w('RO', 2, 1), [seg('g3', w('RO', 2, 1))])
			])
		]
	},
	{
		passageId: 'p2',
		passage: romansThreeFour,
		tree: [
			col('c2', w('RO', 3, 1), [
				sec('s3', w('RO', 3, 1), [seg('g4', w('RO', 3, 1))]),
				sec('s4', w('RO', 4, 1), [seg('g5', w('RO', 4, 1))])
			])
		]
	}
];

console.log('\n── Join Down targets the successor, at every granularity ──');

check('segment: down(g1) → g2', joinDownResolvesTo(sequence, 'segment', 'g1').itemId, 'g2');
check('section: down(s1) → s2', joinDownResolvesTo(sequence, 'section', 's1').itemId, 's2');
check('column:  down(c1) → c2', joinDownResolvesTo(sequence, 'column', 'c1').itemId, 'c2');

console.log('\n── down(X) ≡ up(successor(X)) — the equivalence the implementation rests on ──');

// For every item that HAS a successor, the item Join Down hands to the backwards path must be the
// very item Join Up would act on had the user selected the successor themselves. Checked across all
// three granularities and every position, so the equivalence is pinned as a general property rather
// than at one convenient index.
for (const granularity of ['segment', 'section', 'column']) {
	const flat = flattenSequence(sequence, granularity);
	for (let i = 0; i < flat.length - 1; i += 1) {
		const x = flat[i];
		const successor = flat[i + 1];

		const down = joinDownResolvesTo(sequence, granularity, x.id);
		// What Join Up does when the user selects the successor directly.
		const up = resolveScope({
			sequence,
			granularity,
			itemId: successor.id,
			direction: 'previous'
		});

		assert(`${granularity}: down(${x.id}) resolves`, down.ok);
		check(`${granularity}: down(${x.id}) acts on ${successor.id}`, down.itemId, successor.id);
		// The acted-on item is the same, AND it folds back into X — the pair is identical either way.
		check(`${granularity}: up(${successor.id}) folds into ${x.id}`, up.target.id, x.id);
		// The passage handed onward is the ACTED-ON item's, not the originally selected item's.
		check(
			`${granularity}: down(${x.id}) carries ${successor.id}'s passage`,
			down.passageId,
			successor.passageId
		);
	}
}

console.log('\n── the pairing survives a passage boundary (why Join Down exists) ──');

// g3 is the LAST segment of passage 1; its successor g4 is the FIRST of passage 2. A user cannot
// reach this join by selecting g4 when passage 2 belongs to another part that isn't on screen —
// which is precisely the case Join Down adds.
const acrossSeam = joinDownResolvesTo(sequence, 'segment', 'g3');
assert('down(g3) resolves across the seam', acrossSeam.ok);
check('to g4, in the NEXT passage', acrossSeam.itemId, 'g4');
check('and carries passage p2, not p1', acrossSeam.passageId, 'p2');

// The equivalent upward join must agree that this crosses a boundary — otherwise Join Down would be
// routed to the within-passage path and the verses would never follow the structure.
const upFromG4 = resolveScope({
	sequence,
	granularity: 'segment',
	itemId: 'g4',
	direction: 'previous'
});
assert('and the resulting Join Up is recognised as crossing a boundary', upFromG4.crossesBoundary);
check('folding g4 back into g3', upFromG4.target.id, 'g3');

console.log('\n── the last item in the sequence has no successor, permanently ──');

const last = joinDownResolvesTo(sequence, 'segment', 'g5');
assert('down(last segment) is refused', !last.ok);
assert('with a reason', typeof last.reason === 'string' && last.reason.length > 0);
// §11: a permanently dead command must never promise a later fix. Nothing follows the last item of
// the last part, and nothing ever will.
assert('that does not say "yet"', !/\byet\b/i.test(last.reason));
assert('and speaks of nothing FOLLOWING, not preceding', /follow/i.test(last.reason));

// The same at the other granularities — a column at the end is as final as a segment.
assert('down(last section) is refused', !joinDownResolvesTo(sequence, 'section', 's4').ok);
assert('down(last column) is refused', !joinDownResolvesTo(sequence, 'column', 'c2').ok);

console.log('\n── an ineligible seam refuses from BOTH directions, with one verdict ──');

// Ephesians → Philippians: adjacent in the canon's table of contents, not in Scripture's text. §8's
// standing example of a permanently ineligible seam.
const eph = row('e1', 'EPH', 1, 1, 6, 24, 'Ephesians');
const phil = row('f1', 'PHP', 1, 1, 4, 23, 'Philippians');

const prisonEpistles = [
	{
		passageId: 'e1',
		passage: eph,
		tree: [col('ec', w('EPH', 1, 1), [sec('es', w('EPH', 1, 1), [seg('eg', w('EPH', 1, 1))])])]
	},
	{
		passageId: 'f1',
		passage: phil,
		tree: [col('fc', w('PHP', 1, 1), [sec('fs', w('PHP', 1, 1), [seg('fg', w('PHP', 1, 1))])])]
	}
];

const downAcrossDeadSeam = joinDownResolvesTo(prisonEpistles, 'segment', 'eg');
const upAcrossDeadSeam = resolveScope({
	sequence: prisonEpistles,
	granularity: 'segment',
	itemId: 'fg',
	direction: 'previous'
});

assert('Join Down across Eph→Php is refused', !downAcrossDeadSeam.ok);
assert('Join Up across the same seam is refused', !upAcrossDeadSeam.ok);
// The SAME sentence from both sides. A seam that was dead one way and alive the other would let the
// user perform, via Join Down, exactly the join Join Up had just told them was impossible.
check('and both give the same reason', downAcrossDeadSeam.reason, upAcrossDeadSeam.reason);
assert(
	'which names both books',
	/Ephesians/.test(downAcrossDeadSeam.reason) && /Philippians/.test(downAcrossDeadSeam.reason)
);
assert('and does not say "yet"', !/\byet\b/i.test(downAcrossDeadSeam.reason));

console.log('\n── a single-item sequence can be joined in neither direction ──');

const lonely = [
	{
		passageId: 'o1',
		passage: romansOneTwo,
		tree: [col('oc', w('RO', 1, 1), [sec('os', w('RO', 1, 1), [seg('og', w('RO', 1, 1))])])]
	}
];

assert('down is refused', !joinDownResolvesTo(lonely, 'segment', 'og').ok);
assert(
	'up is refused',
	!resolveScope({ sequence: lonely, granularity: 'segment', itemId: 'og', direction: 'previous' }).ok
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
