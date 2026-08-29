/**
 * # Cache eviction: enforcing the local-storage clause (COMPLIANCE.md §5 item 1)
 *
 * The ESV API terms:
 *
 * > "You may not locally store more than 500 verses or one-half of any book of the Bible
 * > (whichever is less)."
 *
 * `passage.cachedText` (migration 0035) persisted fetched text **indefinitely and without bound**.
 * COMPLIANCE.md called this "the only item here that is simply wrong rather than arguable" — every other
 * gap in that document is a position one could defend; this one contradicted an explicit clause. This
 * module decides what must be dropped; `$lib/server/db/cacheEvictionRunner.js` performs the writes.
 *
 * ## Why eviction, and not a TTL
 *
 * §5 listed three candidate remedies: a TTL, eviction at the cap, or a manual "clear cached Scripture"
 * button. Only one of them actually enforces the clause:
 *
 * - **A TTL bounds age, not quantity.** A user with thirty studies is over 500 verses the moment they
 *   load them, whatever the expiry is. A 24-hour TTL on 4,000 stored verses is 4,000 stored verses.
 * - **A manual button makes compliance the user's chore**, and a licence term the user must remember to
 *   honour is not honoured. It is worth having *as well* — see the limitation note at the end — but it
 *   cannot be the mechanism.
 * - **Eviction at the cap is the only one that makes the breach impossible** rather than temporary,
 *   because it is triggered by the write that would exceed the cap.
 *
 * ## Least-recently-cached is evicted first
 *
 * The cap forces a choice about *which* text to keep, and the licence does not care. So the tie is
 * broken on the only defensible practical ground: `textCachedAt` descending, keeping the most recently
 * warmed rows. A user's current study is the text they are reading, and evicting it to preserve a study
 * they last opened in March would make the cache useless while remaining equally compliant.
 *
 * ⚠️ **Clearing the cache does not restrict what a user may study.** The clause governs *storage*, not
 * *display* — COMPLIANCE.md says so explicitly — so an evicted passage is simply re-fetched on demand,
 * exactly as a newly-created one is. Eviction costs a provider request, never a user's work.
 *
 * ## Pure, and why that matters here
 *
 * No database, no clock, no network: the same split every other decision layer in this codebase uses.
 * A compliance rule that can only be exercised by standing up Postgres and a provider key is a
 * compliance rule that will not be exercised, and COMPLIANCE.md §1.8 is a record of what never-run
 * checks are worth.
 *
 * @module cacheEviction
 */

import { getBook, getBookVerseTotal, getVerseCount } from './bibleData.js';
import { getCachingLimits, resolveWhicheverIsLess } from './translationLimits.js';

/**
 * Read a cached row's book id, accepting either field name.
 *
 * ⚠️ Not a stylistic nicety — this is the §1.8 defect verbatim. `passage` rows carry `bookId`; passages
 * built in memory carry `book`. Reading only `book` made `validateStudyDisplayLimits()` count zero
 * verses and report compliant, which is indistinguishable from a genuine pass. Here it would be worse:
 * the planner would find nothing to evict and the cache would stay unbounded while reporting success.
 *
 * @param {Object} row
 * @returns {string|undefined}
 */
function rowBookId(row) {
	return row?.book ?? row?.bookId;
}

/**
 * Narrow a row's testament to the union `bibleData` expects, or null.
 *
 * A DB column is a free-text string; every lookup here takes `'OT'|'NT'`. Validating once means an
 * unexpected value becomes an *unmeasurable* row — evicted, per the conservative reading — rather than a
 * lookup that quietly returns 0 verses and reports the row as compliant.
 *
 * @param {Object} row
 * @returns {'OT'|'NT'|null}
 */
function rowTestament(row) {
	return row?.testament === 'OT' || row?.testament === 'NT' ? row.testament : null;
}

/**
 * Verse identities covered by a row, as `chapter:verse` strings.
 *
 * Identities rather than a count, so overlapping rows are not double-counted — see the dedup note on
 * `planCacheEviction()`.
 *
 * @param {Object} row
 * @returns {string[]}
 */
function verseIdsOf(row) {
	const { fromChapter, fromVerse, toChapter, toVerse } = row || {};
	const testament = rowTestament(row);
	const book = rowBookId(row);
	if (!testament || !book) return [];

	const ids = [];
	for (let ch = fromChapter; ch <= toChapter; ch += 1) {
		// Bounded by the real chapter length rather than the row's own `toVerse`: a row saying
		// "Romans 3:1-99" must count 31 verses, not 99, or the planner would evict to satisfy a number
		// that does not exist. Same clamping `countVersesInRange()` does, and the same source, so this
		// module cannot disagree with the validators in translationLimits.js.
		const chapterVerses = getVerseCount(testament, book, ch);
		if (chapterVerses <= 0) continue;
		const start = ch === fromChapter ? Math.max(1, fromVerse) : 1;
		const end = ch === toChapter ? Math.min(toVerse, chapterVerses) : chapterVerses;
		for (let v = start; v <= end; v += 1) ids.push(`${ch}:${v}`);
	}
	return ids;
}

/**
 * Whether a row currently holds cached text.
 *
 * ⚠️ Both spellings are accepted, exactly as `seriesPrefetch.js` does and for the same measured reason:
 * a caller holding full rows has `cachedText`, while a caller that selected a boolean to avoid pulling
 * megabytes of HTML into memory has `hasCachedText`. Reading only one spelling would make every row look
 * cold, the planner would find nothing to evict, and the cap would silently go unenforced.
 *
 * @param {Object} row
 * @returns {boolean}
 */
function isWarm(row) {
	if (!row?.id) return false;
	return row.hasCachedText === undefined ? Boolean(row.cachedText) : Boolean(row.hasCachedText);
}

/**
 * The verse ceiling that binds for one book under the storage clause.
 *
 * @param {'OT'|'NT'} testament
 * @param {string} book
 * @param {{ maxVerses: number|null, maxBookPortion: number|null, shortBookChapterThreshold: number|null }} limits
 * @returns {number|null}
 */
function bookAllowance(testament, book, limits) {
	const bookMeta = getBook(testament, book);
	return resolveWhicheverIsLess({
		bookTotal: getBookVerseTotal(testament, book),
		chapterCount: bookMeta?.chapterCount ?? 0,
		maxVerses: limits.maxVerses,
		maxBookPortion: limits.maxBookPortion,
		shortBookChapterThreshold: limits.shortBookChapterThreshold
	}).allowed;
}

/**
 * Decide which cached rows must have their text dropped to satisfy the storage clause.
 *
 * ## The algorithm, and the two reasons it is shaped this way
 *
 * Rows are sorted newest-cached first, then admitted one at a time while they fit. A row that would
 * breach either the per-book portion cap or the global verse cap is evicted, and **iteration continues**
 * rather than stopping — a later row may be a short book that still fits under its own limit, and
 * stopping at the first failure would evict text the licence permits us to keep.
 *
 * Verse **identities** are accumulated in Sets rather than counts summed, for the same reason
 * `validateStudyDisplayLimits()` does it: two studies of Romans 1–8 store 208 distinct verses between
 * them, not 416. Counting instead of deduplicating would evict aggressively to fix a breach that is not
 * happening — the clause limits what is *stored*, and the same verse stored twice is still one verse of
 * Scripture in the database.
 *
 * ⚠️ **Cold rows are ignored entirely, not admitted.** They occupy no storage; `cachedText` is the whole
 * subject of the clause. Counting a cold row toward the cap would evict warm rows to make room for text
 * that is not there.
 *
 * @param {Array<Object>} rows - Cached passage rows: `{ id, testament, bookId|book, fromChapter,
 *   fromVerse, toChapter, toVerse, textCachedAt, cachedText|hasCachedText }`
 * @param {string} translationId
 * @returns {{ evictIds: string[], keptVerses: number, evictedVerses: number, limited: boolean,
 *   reasons: Array<{ id: string, reason: 'book-portion'|'total-verses'|'unmeasurable' }> }}
 */
export function planCacheEviction(rows, translationId) {
	const limits = getCachingLimits(translationId);

	/** @type {string[]} */
	const evictIds = [];
	/** @type {Array<{ id: string, reason: 'book-portion'|'total-verses'|'unmeasurable' }>} */
	const reasons = [];
	const warm = (rows || []).filter(isWarm);

	// `allowed: false` would mean "never persist at all". No translation says that today; it is handled
	// rather than assumed, so a licence change stays a data edit.
	if (!limits.allowed) {
		return {
			evictIds: warm.map((r) => r.id),
			keptVerses: 0,
			evictedVerses: warm.reduce((sum, r) => sum + verseIdsOf(r).length, 0),
			limited: true,
			reasons: warm.map((r) => ({ id: r.id, reason: /** @type {const} */ ('total-verses') }))
		};
	}

	// A translation declaring no storage cap (NET) is not policed at all. `limited: false` lets a caller
	// distinguish "no cap exists" from "nothing is over the line" — the same distinction
	// `selectPrefetchTarget()` draws, and the reason NET is untouched by any of this.
	if (limits.maxVerses === null && limits.maxBookPortion === null) {
		return { evictIds, keptVerses: 0, evictedVerses: 0, limited: false, reasons };
	}

	// Newest cached first. ⚠️ A null `textCachedAt` sorts LAST rather than first: legacy rows predate the
	// column, and treating "unknown age" as "brand new" would let them displace text the user is actually
	// reading. Ties broken on `id`, so the plan is deterministic — a planner that answers differently for
	// the same input cannot be verified.
	const ordered = [...warm].sort((a, b) => {
		const at = a.textCachedAt ? new Date(a.textCachedAt).getTime() : -Infinity;
		const bt = b.textCachedAt ? new Date(b.textCachedAt).getTime() : -Infinity;
		if (at !== bt) return bt - at;
		return String(a.id).localeCompare(String(b.id));
	});

	/** @type {Map<string, Set<string>>} Verse identities kept, per `testament:book` */
	const keptByBook = new Map();
	/** @type {Set<string>} Every verse identity kept, globally deduplicated */
	const keptAll = new Set();
	let evictedVerses = 0;

	for (const row of ordered) {
		const testament = rowTestament(row);
		const book = rowBookId(row);
		const verses = verseIdsOf(row);

		// An unidentifiable row stores text we cannot measure. Evicting is the conservative reading:
		// keeping it would mean carrying storage no cap can account for, which is exactly the unbounded
		// state this module exists to end. Reported under its own reason so it is not silently counted as
		// an ordinary over-limit eviction.
		if (!testament || !book || verses.length === 0) {
			evictIds.push(row.id);
			reasons.push({ id: row.id, reason: 'unmeasurable' });
			continue;
		}

		const key = `${testament}:${book}`;
		const bookKept = keptByBook.get(key) ?? new Set();

		// Prospective state, computed before committing so a row that does not fit leaves no trace.
		const nextBook = new Set(bookKept);
		for (const v of verses) nextBook.add(v);
		const nextAll = new Set(keptAll);
		for (const v of verses) nextAll.add(`${key}:${v}`);

		const allowed = bookAllowance(testament, book, limits);
		if (allowed !== null && nextBook.size > allowed) {
			evictIds.push(row.id);
			reasons.push({ id: row.id, reason: 'book-portion' });
			evictedVerses += verses.length;
			continue;
		}

		// The global ceiling is measured across every book, because the clause's "500 verses" is not
		// per-book: a study of Matthew plus a study of Luke store their sum.
		if (limits.maxVerses !== null && nextAll.size > limits.maxVerses) {
			evictIds.push(row.id);
			reasons.push({ id: row.id, reason: 'total-verses' });
			evictedVerses += verses.length;
			continue;
		}

		keptByBook.set(key, nextBook);
		for (const v of nextAll) keptAll.add(v);
	}

	return { evictIds, keptVerses: keptAll.size, evictedVerses, limited: true, reasons };
}

/**
 * Summarise how much Scripture is currently stored, for reporting rather than deciding.
 *
 * Exists so a log line or a back-office page can state the position without duplicating the dedup rules
 * the planner uses — a second counter that disagreed with the enforcer would make both untrustworthy.
 *
 * @param {Array<Object>} rows
 * @param {string} translationId
 * @returns {{ totalVerses: number, maxVerses: number|null, overLimit: boolean,
 *   byBook: Array<{ testament: 'OT'|'NT', book: string, bookLabel: string, stored: number,
 *   allowed: number|null, overLimit: boolean }> }}
 */
export function summariseCacheUsage(rows, translationId) {
	const limits = getCachingLimits(translationId);
	/** @type {Map<string, { testament: 'OT'|'NT', book: string, verses: Set<string> }>} */
	const byBook = new Map();
	const all = new Set();

	for (const row of (rows || []).filter(isWarm)) {
		const testament = rowTestament(row);
		const book = rowBookId(row);
		if (!testament || !book) continue;
		const key = `${testament}:${book}`;
		if (!byBook.has(key)) byBook.set(key, { testament, book, verses: new Set() });
		const entry = byBook.get(key);
		if (!entry) continue;
		for (const v of verseIdsOf(row)) {
			entry.verses.add(v);
			all.add(`${key}:${v}`);
		}
	}

	const books = [...byBook.values()].map(({ testament, book, verses }) => {
		const allowed = bookAllowance(testament, book, limits);
		return {
			testament,
			book,
			// The readable title: `book` is an internal id ('GA'), and COMPLIANCE.md §1.8 records shipping
			// one of those into user copy as a defect in its own right.
			bookLabel: getBook(testament, book)?.title || book,
			stored: verses.size,
			allowed,
			overLimit: allowed !== null && verses.size > allowed
		};
	});

	return {
		totalVerses: all.size,
		maxVerses: limits.maxVerses,
		overLimit:
			(limits.maxVerses !== null && all.size > limits.maxVerses) || books.some((b) => b.overLimit),
		byBook: books
	};
}
