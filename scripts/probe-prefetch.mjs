/**
 * Exercise adjacent-part prefetch against a REAL database (SERIES_PLAN §11, phase 2).
 *
 * The selector is verified purely by `verify-series-prefetch.mjs`. What that cannot check is the part
 * that touches the world: `warmAdjacentPart` reads the cache, calls the provider, and writes
 * `passage.cachedText`. Three of its properties only mean anything against a database:
 *
 *   - a cold part gets its `cachedText` filled, so the next visit is a cache hit;
 *   - an already-warm part is skipped WITHOUT a provider request;
 *   - it never throws into its caller, because the study layout does not await it — a provider outage
 *     must not surface on the page the user is currently reading.
 *
 * ⚠️ This probe does NOT hit the real translation API. It injects a stub fetcher, because the point is
 * the caching and the guards, not the provider — and a probe that spent real ESV quota on every run
 * would stop being run. The one thing that costs: it therefore does not prove the real provider call
 * works, which the ordinary page load already exercises daily.
 *
 * Run with `npm run probe:prefetch`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-pf-';
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
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	await cleanup();

	// Two-part series: part 1 warm (as if just read), part 2 entirely cold.
	const seriesId = `${PREFIX}series`;
	const partA = `${PREFIX}pA`;
	const partB = `${PREFIX}pB`;
	const passA = `${PREFIX}gA`;
	const passB1 = `${PREFIX}gB1`;
	const passB2 = `${PREFIX}gB2`;

	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, 'Probe PF', ${owner.id}, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partA}, 'A', 'esv', ${owner.id}, ${seriesId}, 0, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partB}, 'B', 'esv', ${owner.id}, ${seriesId}, 1, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at) VALUES (${passA}, ${partA}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, 'WARM-A', now(), now())`;
	// Part 2 has TWO passages, both cold, so the all-or-nothing rule has something to be tested on.
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passB1}, ${partB}, 'NT', 'RO', 'Romans', 3, 1, 3, 31, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passB2}, ${partB}, 'NT', 'RO', 'Romans', 4, 1, 4, 25, 1, now())`;

	console.log('\nFixture: part 1 warm, part 2 cold with two passages.\n');

	const { selectPrefetchTarget } = await import('../src/lib/utils/seriesPrefetch.js');

	// ── The selector, on rows shaped as the layout supplies them ──────────────
	console.log('── the selector picks part 2 from the real rows ──');
	const rows = await sql`
		SELECT s.id AS study_id, s.series_order, p.id AS passage_id,
			(p.cached_text IS NOT NULL) AS has_cached_text
		FROM study s JOIN passage p ON p.study_id = s.id
		WHERE s.series_id = ${seriesId}
		ORDER BY s.series_order, p.display_order
	`;
	const parts = [partA, partB].map((id) => ({
		id,
		seriesOrder: rows.find((r) => r.study_id === id).series_order,
		passages: rows
			.filter((r) => r.study_id === id)
			.map((r) => ({ id: r.passage_id, hasCachedText: r.has_cached_text }))
	}));

	const target = selectPrefetchTarget({ parts, currentPartId: partA });
	check('part 2 is the target', target?.partId, partB);
	check('both of its passages are listed as cold', target?.passages.length, 2);
	check(
		'and from part 2 there is nothing further to warm',
		selectPrefetchTarget({ parts, currentPartId: partB }),
		null
	);

	// ── The runner, with the provider stubbed at `globalThis.fetch` ────────────
	//
	// Stubbed at the global rather than by editing the module: bibleApi.js calls `fetch` through the
	// global, so this intercepts the real code path (URL building, response parsing, the cache write)
	// while spending no provider quota. `calls` is what proves the "skip if warm" guard actually skips
	// rather than merely producing the same end state.
	const realFetch = globalThis.fetch;
	let calls = 0;
	globalThis.fetch = async (url) => {
		calls += 1;
		const target = String(url);

		// ⚠️ The stub must return VERSE-MARKED text of roughly the right length, not a placeholder.
		//
		// My first version returned a single `<p>STUBBED VERSE TEXT</p>` and the probe failed with
		// `warmed: 0` — which was the real code being right and the stub being wrong. bibleApi.js counts
		// `[n]` markers against the range's true verse count and rejects a response missing more than
		// 10% AND more than 15 verses, because Crossway truncates silently at HTTP 200. A one-line stub
		// looks exactly like that truncation, so it was correctly refused and nothing was cached.
		//
		// So the stub reads the requested reference and emits that many markers. This is a better test
		// than a placeholder would have been: it exercises the truncation detector on the happy path
		// too, proving the prefetch stores text the detector accepts.
		const q = new URL(target).searchParams.get('q') ?? '';
		const [, fromCh, fromV, toCh, toV] =
			/(\d+):(\d+)-(?:(\d+):)?(\d+)/
				.exec(q)
				?.map((v) => (v === undefined ? undefined : Number(v))) ?? [];
		// Single-chapter ranges in the fixture, so the count is toV − fromV + 1; a couple extra markers
		// are harmless because the detector only penalises a shortfall.
		const verseCount =
			Number.isFinite(fromV) && Number.isFinite(toV) && (toCh === undefined || toCh === fromCh)
				? toV - fromV + 2
				: 40;
		const body = Array.from(
			{ length: Math.max(1, verseCount) },
			(_, i) => `[${i + 1}] verse text.`
		).join(' ');

		return new Response(JSON.stringify({ passages: [body], canonical: q }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	};

	try {
		const { warmAdjacentPart } = await import('../src/lib/server/db/seriesPrefetchRunner.js');

		console.log('\n── warming the cold part fills its cache ──');
		const result = await warmAdjacentPart(target, 'esv');
		check('it reports warming two passages', result.warmed, 2);
		check('and did not skip', result.skipped, false);
		assert('the provider was called at least once', calls > 0);

		const warmedRows = await sql`
			SELECT id, cached_text, text_cached_at FROM passage
			WHERE id IN (${passB1}, ${passB2}) ORDER BY display_order
		`;
		assert('the first passage now has cached text', Boolean(warmedRows[0].cached_text));
		assert('the second passage does too', Boolean(warmedRows[1].cached_text));
		assert('and textCachedAt was stamped', warmedRows[0].text_cached_at !== null);

		// The point of the whole feature: the next visit is now a cache hit.
		const stillCold = await sql`
			SELECT COUNT(*)::int AS n FROM passage WHERE study_id = ${partB} AND cached_text IS NULL
		`;
		check('no passage of part 2 is cold any more', stillCold[0].n, 0);

		console.log('\n── a warm part is skipped WITHOUT a provider request ──');
		const callsBefore = calls;
		const second = await warmAdjacentPart(target, 'esv');
		check('it reports skipping', second.skipped, true);
		check('nothing was warmed', second.warmed, 0);
		check('and the provider was not called again', calls, callsBefore);

		console.log('\n── the current part’s cache is untouched throughout ──');
		const [partAAfter] = await sql`SELECT cached_text FROM passage WHERE id = ${passA}`;
		check('part 1 still holds its original text', partAAfter.cached_text, 'WARM-A');

		console.log('\n── a provider failure is swallowed, never thrown at the caller ──');
		// The layout does not await this call, so a rejection would become an unhandled rejection rather
		// than a handled error. Asserted directly.
		await sql`UPDATE passage SET cached_text = NULL, text_cached_at = NULL WHERE id = ${passB1}`;
		globalThis.fetch = async () => {
			throw new Error('simulated provider outage');
		};
		let threw = false;
		let outageResult = null;
		try {
			outageResult = await warmAdjacentPart({ partId: partB, passages: [{ id: passB1 }] }, 'esv');
		} catch {
			threw = true;
		}
		assert('it did not throw', !threw);
		check('it reports nothing warmed', outageResult?.warmed, 0);

		const [afterOutage] = await sql`SELECT cached_text FROM passage WHERE id = ${passB1}`;
		check('and the row is left cold rather than half-written', afterOutage.cached_text, null);
	} finally {
		globalThis.fetch = realFetch;
	}
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}`);
	console.log(error.stack?.split('\n').slice(1, 4).join('\n') ?? '');
} finally {
	await cleanup();
	const [left] = await sql`SELECT COUNT(*)::int AS n FROM study WHERE id LIKE ${PREFIX + '%'}`;
	console.log(`\nFixture removed (${left.n} studies left — expected 0).`);
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
