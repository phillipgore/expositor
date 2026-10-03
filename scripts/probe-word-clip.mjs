/**
 * Read-only: run `clipPassageHtml` over REAL cached passage HTML from the dev database.
 *
 * The verifier's fixture is hand-written HTML; this checks the clip against what `wrapWords()` and
 * the ESV/NET formatters actually produce (paragraph markers, punctuation, em-dash splits), and that
 * splitting a verse at every word partitions it exactly — no word lost, none shown twice.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/probe-word-clip.mjs
 */
import postgres from 'postgres';
import dotenv from 'dotenv';
import { clipPassageHtml } from '../src/lib/utils/passageText.js';

dotenv.config({ quiet: true });
const sql = postgres(process.env.DATABASE_URL);
let pass = 0;
let fail = 0;
const ok = (label, cond) => (cond ? (pass += 1) : (fail += 1, console.log(`✗ ${label}`)));
const ids = (s) => [...s.matchAll(/data-word-id="([^"]+)"/g)].map((m) => m[1]);

try {
	const rows = await sql`
		SELECT id, from_chapter, from_verse, to_chapter, to_verse, cached_text
		FROM passage WHERE cached_text IS NOT NULL ORDER BY length(cached_text) LIMIT 5`;
	console.log(`${rows.length} cached passages sampled`);
	for (const r of rows) {
		const all = ids(r.cached_text);
		const range = { fromChapter: r.from_chapter, fromVerse: r.from_verse, toChapter: r.to_chapter, toVerse: r.to_verse };
		ok(`${r.id}: whole range is untouched`, clipPassageHtml(r.cached_text, range) === r.cached_text);

		// Split the passage's middle verse at every word and check the partition.
		const verses = [...new Set(all.map((w) => w.split('-').slice(0, 3).join('-')))];
		const mid = verses[Math.floor(verses.length / 2)];
		const [, ch, vs] = mid.split('-').map((x, i) => (i ? parseInt(x, 10) : x));
		const words = all.filter((w) => w.startsWith(mid + '-'));
		for (let k = 2; k <= words.length; k += 1) {
			const head = ids(clipPassageHtml(r.cached_text, { ...range, toChapter: ch, toVerse: vs, toWord: k - 1 }));
			const tail = ids(clipPassageHtml(r.cached_text, { ...range, fromChapter: ch, fromVerse: vs, fromWord: k }));
			const overlap = head.filter((w) => tail.includes(w)).length;
			const union = new Set([...head, ...tail]).size;
			ok(`${mid} split at word ${k}: no shared word`, overlap === 0);
			ok(`${mid} split at word ${k}: nothing lost`, union === all.length);
		}
		const tailHtml = clipPassageHtml(r.cached_text, { ...range, fromChapter: ch, fromVerse: vs, fromWord: 2 });
		ok(`${mid}: the tail's first verse is marked "b"`, tailHtml.includes(`data-verse-id="${mid}" data-partial="b"`));
		ok(`${mid}: the tail keeps no verse before it`, !ids(tailHtml).some((w) => w < mid));
	}
} finally {
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exitCode = fail === 0 ? 0 : 1;
}
