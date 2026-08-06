/**
 * Probe: does a whole book load as ONE passage via chunked retrieval?
 *
 * Verifies the claim the chunked-fetch change rests on — that a passage larger
 * than the per-request cap can be assembled from several requests without losing
 * or duplicating verses. It checks the split arithmetic against bible.json AND
 * against the live API, because a split that looks right locally but that the
 * provider answers differently would still corrupt the text.
 *
 * Note the book title used in the API reference comes from bible.json, not from a
 * literal here: Psalms is stored as "Psalm" (singular), and guessing the plural
 * would send a reference the provider may interpret differently.
 *
 * Run: npx tsx scripts/probe-chunked-fetch.ts
 */

import { splitRangeIntoPassages, getRequestLimits } from '../src/lib/utils/translationLimits.js';
import { countVersesInRange, getBookVerseTotal, getVerseCount } from '../src/lib/utils/bibleData.js';
import bibleData from '../src/lib/data/bible.json';

const NET_API = 'https://labs.bible.org/api/';

/** Genesis and Psalms are the two books from the report; Philemon is the control. */
const CASES: Array<{ testament: 'OT' | 'NT'; book: string }> = [
	{ testament: 'OT', book: 'GE' },
	{ testament: 'OT', book: 'PS' },
	{ testament: 'NT', book: 'PN' }
];

/** Look up a book's stored title and chapter count so references are exact. */
function getBookMeta(testament: 'OT' | 'NT', bookId: string) {
	const testaments = (bibleData as any)[0].testamentData;
	const td = testaments.find((t: any) => t._id === testament);
	const book = td.bookData.find((b: any) => b._id === bookId);
	return { title: book.title as string, chapterCount: book.chapterCount as number };
}

/** Fetch one range from the NET API and report how many verses came back. */
async function fetchNetVerseCount(reference: string): Promise<number> {
	const url = new URL(NET_API);
	url.searchParams.set('passage', reference);
	url.searchParams.set('type', 'json');
	url.searchParams.set('formatting', 'para');

	const res = await fetch(url.toString());
	if (!res.ok) throw new Error(`HTTP ${res.status} for "${reference}"`);
	const data = await res.json();
	return Array.isArray(data) ? data.length : 0;
}

async function main() {
	const { maxVerses } = getRequestLimits('net');
	console.log(`NET per-request limit: ${maxVerses} verses\n`);

	let allOk = true;

	for (const { testament, book } of CASES) {
		const { title, chapterCount } = getBookMeta(testament, book);
		const lastVerse = getVerseCount(testament, book, chapterCount);
		const total = getBookVerseTotal(testament, book);

		// Request the whole book exactly as the app now does: one passage.
		const range = {
			testament,
			book,
			fromChapter: 1,
			fromVerse: 1,
			toChapter: chapterCount,
			toVerse: lastVerse
		};

		const chunks = splitRangeIntoPassages(range, 'net');
		console.log(`${title} (${book}): ${total} verses → ${chunks.length} request(s)`);

		let sumLocal = 0;
		let sumRemote = 0;

		for (const c of chunks as any[]) {
			const local = countVersesInRange(
				c.testament,
				c.book,
				c.fromChapter,
				c.fromVerse,
				c.toChapter,
				c.toVerse
			);
			sumLocal += local;

			const reference = `${title} ${c.fromChapter}:${c.fromVerse}-${c.toChapter}:${c.toVerse}`;
			const remote = await fetchNetVerseCount(reference);
			sumRemote += remote;

			const overCap = maxVerses !== null && local > maxVerses ? '  ⚠️ OVER CAP' : '';
			const mismatch = remote !== local ? `  ⚠️ API returned ${remote}` : '';
			console.log(`   ${reference.padEnd(28)} local=${String(local).padStart(4)}${overCap}${mismatch}`);
		}

		const ok = sumLocal === total && sumRemote === total;
		if (!ok) allOk = false;
		console.log(
			`   → local ${sumLocal}, API ${sumRemote}, book total ${total} ${ok ? '✅' : '❌'}\n`
		);
	}

	console.log(allOk ? 'All books assemble completely ✅' : 'MISMATCH — see above ❌');
}

main().catch((err) => {
	console.error(err);
	// @ts-expect-error - process is available under tsx/node at runtime
	process.exit(1);
});
