/**
 * Exercise cache eviction against a REAL database (COMPLIANCE.md §5 item 1).
 *
 * `verify-cache-eviction.mjs` proves the *decision* purely, against the real `bible.json`. What it
 * cannot prove is the part that touches the world, and for a compliance fix that part is the whole
 * point: the clause is about what is **in the database**, so "the planner would have evicted it" is not
 * the same claim as "the row is empty now".
 *
 * Four properties only mean something here:
 *
 *   - an over-cap cache is actually REDUCED — `cached_text` becomes NULL in the table;
 *   - `text_cached_at` is cleared with it, so no row claims a cache time while holding nothing;
 *   - **ESV and NET are scoped separately** — a NET study is not evicted to satisfy a Crossway term,
 *     and NET rows do not consume the ESV allowance;
 *   - **another user's cache is untouched**, since the eviction is per user.
 *
 * ⚠️ No provider requests: the fixture writes `cached_text` directly. The subject is the eviction, not
 * the fetch, and a probe that spent ESV quota on every run would stop being run.
 *
 * Run with `npm run probe:eviction`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-ev-';
let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
		console.log(`  ✓ ${label}`);
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
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}

const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM "user" WHERE id LIKE ${PREFIX + '%'}`;
}

/**
 * Create a throwaway user.
 *
 * ⚠️ **Dedicated users, not the first row of `user`.** The probe originally reused an existing account
 * and reported 174 stored verses where the fixture supplies 105 — the difference was that developer's own
 * cached studies, which the report was correctly counting. Enforcement is per user, so borrowing a real
 * account means the fixture's arithmetic is only right on an empty database, and it would also EVICT that
 * developer's cached text as a side effect of running a probe. Both are fixed by owning the user.
 */
async function makeUser(suffix) {
	const id = `${PREFIX}user-${suffix}`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, first_name, last_name, created_at, updated_at)
	          VALUES (${id}, ${'Probe ' + suffix}, ${id + '@probe.invalid'}, false, 'Probe', ${suffix}, now(), now())`;
	return { id };
}

/** Insert a study with one cached passage. */
async function seed({
	id,
	translation,
	userId,
	book,
	bookName,
	testament,
	fromCh,
	fromV,
	toCh,
	toV,
	cachedAt
}) {
	await sql`INSERT INTO study (id, title, translation, user_id, created_at, updated_at)
	          VALUES (${id}, ${'Probe ' + id}, ${translation}, ${userId}, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse,
	                              to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
	          VALUES (${id + '-p'}, ${id}, ${testament}, ${book}, ${bookName}, ${fromCh}, ${fromV},
	                  ${toCh}, ${toV}, 0, ${'CACHED-' + id}, ${cachedAt}, now())`;
	return `${id}-p`;
}

const warm = async (passageId) => {
	const [r] = await sql`SELECT cached_text, text_cached_at FROM passage WHERE id = ${passageId}`;
	return r;
};

try {
	// Cleaned FIRST, so a previous crashed run cannot leave rows that skew this one's counts.
	await cleanup();

	const owner = await makeUser('a');
	const other = await makeUser('b');

	// ── Fixture ───────────────────────────────────────────────────────────────
	//
	// Galatians entire is 149 verses against an allowance of 74 (half the book), so ONE ESV study is
	// already over the cap — no need to manufacture 500 verses to demonstrate the breach. That is worth
	// noticing: the old `maxVerses: 500`-only reading would have called this fixture compliant.
	//
	// ⚠️ **Two disjoint 45- and 60-verse halves, not 74 + 75.** My first fixture used Ga 1:1–3:29 (74,
	// exactly the allowance) and Ga 4:1–6:18 (75). The probe reported the OLDER row surviving and the
	// newer one evicted, which looked like a recency bug and was not: 75 verses ALONE exceeds the 74-verse
	// allowance, so the newer row could never be kept, and the older row then fitted on its own. The
	// fixture was asserting something arithmetically impossible. 45 + 60 = 105 is over the cap while
	// EITHER row fits alone, which is what makes "the newer one wins" a real test.
	const esvOld = await seed({
		id: `${PREFIX}esv-old`,
		translation: 'esv',
		userId: owner.id,
		book: 'GA',
		bookName: 'Galatians',
		testament: 'NT',
		fromCh: 1,
		fromV: 1,
		toCh: 2,
		toV: 21,
		cachedAt: '2026-01-01T00:00:00Z'
	});
	const esvNew = await seed({
		id: `${PREFIX}esv-new`,
		translation: 'esv',
		userId: owner.id,
		book: 'GA',
		bookName: 'Galatians',
		testament: 'NT',
		fromCh: 3,
		fromV: 1,
		toCh: 4,
		toV: 31,
		cachedAt: '2026-06-01T00:00:00Z'
	});
	// NET, same over-cap shape. NET declares no storage cap, so it must survive untouched.
	const netAll = await seed({
		id: `${PREFIX}net`,
		translation: 'net',
		userId: owner.id,
		book: 'GA',
		bookName: 'Galatians',
		testament: 'NT',
		fromCh: 1,
		fromV: 1,
		toCh: 6,
		toV: 18,
		cachedAt: '2026-01-01T00:00:00Z'
	});
	const otherUsers = await seed({
		id: `${PREFIX}other`,
		translation: 'esv',
		userId: other.id,
		book: 'GA',
		bookName: 'Galatians',
		testament: 'NT',
		fromCh: 1,
		fromV: 1,
		toCh: 6,
		toV: 18,
		cachedAt: '2026-01-01T00:00:00Z'
	});

	console.log('\nFixture: Ga 1-2 (45) + Ga 3-4 (60) in ESV = 105 against a 74 allowance,');
	console.log('plus whole Galatians in NET, plus a second user over the cap.\n');

	console.log('── before: everything is cached ──');
	assert('the older ESV half is cached', Boolean((await warm(esvOld)).cached_text));
	assert('the newer ESV half is cached', Boolean((await warm(esvNew)).cached_text));
	assert('the NET study is cached', Boolean((await warm(netAll)).cached_text));

	const { reportCacheUsage, enforceCacheLimit } = await import(
		'../src/lib/server/db/cacheEvictionRunner.js'
	);

	console.log('\n── the report sees the breach, per translation ──');
	const before = await reportCacheUsage(owner.id);
	const esvBefore = before.find((r) => r.translation === 'esv');
	const netBefore = before.find((r) => r.translation === 'net');
	check('ESV stores 105 verses of Galatians', esvBefore?.summary.totalVerses, 105);
	check('and is reported as over the limit', esvBefore?.summary.overLimit, true);
	check('with the binding allowance named as 74', esvBefore?.summary.byBook[0]?.allowed, 74);
	check('NET stores all 149', netBefore?.summary.totalVerses, 149);
	// The point of grouping by translation: the same 149 verses are a breach under one licence and not
	// under the other.
	check('but NET is NOT over any limit', netBefore?.summary.overLimit, false);

	// ── The enforcement ───────────────────────────────────────────────────────
	console.log('\n── enforcement actually empties the column ──');
	const result = await enforceCacheLimit(owner.id);
	check('one passage is evicted', result.evicted, 1);
	check('and it is counted under ESV', result.byTranslation.esv?.evicted, 1);

	// The claim that matters for the licence: not "the planner would have", but "the row is empty".
	const oldAfter = await warm(esvOld);
	const newAfter = await warm(esvNew);
	check('the OLDER ESV half is now empty in the database', oldAfter.cached_text, null);
	// text_cached_at goes with it: a timestamp on an empty cache would claim the row was cached at a
	// moment when it holds nothing, and the planner sorts on that field.
	check('and its cache timestamp is cleared too', oldAfter.text_cached_at, null);
	assert('the NEWER ESV half survives', Boolean(newAfter.cached_text));

	console.log('\n── NET is not policed by a Crossway term ──');
	assert('the whole-Galatians NET study is untouched', Boolean((await warm(netAll)).cached_text));
	check('and nothing was evicted under NET', result.byTranslation.net?.evicted ?? 0, 0);

	console.log('\n── the result is within the cap, and stays there ──');
	const after = await reportCacheUsage(owner.id);
	const esvAfter = after.find((r) => r.translation === 'esv');
	check('ESV storage is now under its allowance', esvAfter?.summary.overLimit, false);
	check('and is the 60 verses of the newer half', esvAfter?.summary.totalVerses, 60);
	assert('which is within the 74-verse allowance', (esvAfter?.summary.totalVerses ?? 0) <= 74);

	// Idempotence. Running twice must not evict a second time: a compliance pass that keeps deleting on
	// every page load would empty the cache entirely and re-fetch forever.
	const second = await enforceCacheLimit(owner.id);
	check('running it again evicts nothing', second.evicted, 0);
	assert('and the surviving half is still cached', Boolean((await warm(esvNew)).cached_text));

	console.log("\n── another user's cache is untouched ──");
	// Eviction is per user. A shared pool would mean one user's studies evicting another's — stricter on
	// paper, unexplainable in practice. This user is over the cap and stays that way until THEY trigger a
	// fill, which is the documented behaviour rather than an oversight.
	assert('their over-cap study is still cached', Boolean((await warm(otherUsers)).cached_text));
} catch (error) {
	fail += 1;
	console.error('\nProbe failed:', error);
} finally {
	await cleanup();
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
