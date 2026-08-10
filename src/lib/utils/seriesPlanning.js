/**
 * Series Planning
 *
 * Works out what parts a series would have, WITHOUT creating anything. The creation preview
 * (§5) and the server action that actually inserts the parts both call this, so the preview
 * cannot promise a shape the creation produces differently — the preview is the only place a
 * user sees "150 parts" before committing, so it being merely *approximately* right is not
 * good enough.
 *
 * Two strategies, per SERIES_PLAN §5, chosen by the shape of the source study rather than by
 * user preference:
 *
 *   - `chapters-per-part` for ONE contiguous single-book passage. Chapter arithmetic is
 *     well-defined here and nowhere else.
 *   - `passage-per-part` for a multi-passage study. The user already drew the seams, so there
 *     is nothing to compute — this is the *easier* case, which is the argument against
 *     restricting series creation to contiguous text (trap 15).
 *
 * Deliberately NOT here: any decision to create a series. This module offers a shape; rules 1
 * and 2 of §5 ("a series is never imposed", "the default is always one study") live in the UI
 * that calls it.
 */

import { countVersesInRange, getVerseCount } from './bibleData.js';
import { checkSinglePassageSupport, validateStudyDisplayLimits } from './translationLimits.js';

/**
 * Which parting strategy applies to a study's passages.
 *
 * @param {Array<Object>} passages
 * @returns {'chapters-per-part' | 'passage-per-part' | 'ineligible'}
 */
export function getPartingStrategy(passages) {
	if (!Array.isArray(passages) || passages.length === 0) return 'ineligible';

	if (passages.length > 1) return 'passage-per-part';

	const [p] = passages;
	// A single passage can only be parted by chapter if it actually spans chapters. One
	// chapter (or part of one) has no internal seam to cut on.
	const spansChapters = (p.toChapter ?? p.fromChapter) > (p.fromChapter ?? 0);
	return spansChapters ? 'chapters-per-part' : 'ineligible';
}

/**
 * Is a study eligible to become a series at all?
 *
 * Eligibility is 2+ chapters and is NEVER tightened (§5): two sessions on Haggai is a real
 * teaching plan. This is distinct from *solicitation* — whether the app volunteers the offer —
 * which is a tunable UX judgement. Conflating the two removes capability instead of noise
 * (trap 10).
 *
 * @param {Array<Object>} passages
 * @returns {boolean}
 */
export function isSeriesEligible(passages) {
	return getPartingStrategy(passages) !== 'ineligible';
}

/**
 * Plan the parts of a series.
 *
 * @param {Object} options
 * @param {Array<Object>} options.passages - The source study's passages
 * @param {number} [options.chaptersPerPart] - Only used by the `chapters-per-part` strategy
 * @param {string} options.translationId
 * @param {string} [options.baseTitle] - Source study title, used to name parts
 * @param {boolean} [options.balanceByLength] - Opt in to "Balance by length" (§5 option (b), Q11)
 * @param {number} [options.targetParts] - How many parts to balance into; required by `balanceByLength`
 * @returns {{ strategy: string, parts: Array<Object>, totalVerses: number, warnings: Array<Object> }}
 */
export function planSeriesParts({
	passages,
	chaptersPerPart = 1,
	translationId,
	baseTitle = '',
	balanceByLength = false,
	targetParts = 0
}) {
	const strategy = getPartingStrategy(passages);

	if (strategy === 'ineligible') {
		return { strategy, parts: [], totalVerses: 0, warnings: [] };
	}

	// "Balance by length" (§5 option (b), Q11) is an OPT-IN alternative to fixed chapters-per-part, and
	// only for the chapters-per-part strategy: with one part per passage the seams are already drawn by
	// the user, so re-balancing them would be the app overriding a choice it was told to respect.
	//
	// §5 is explicit that (a) stays the default — "chapter boundaries are meaningful to readers in a way
	// equal verse counts are not" — and that (b) is "an option the user may choose, never a re-balancing
	// the app applies on their behalf". So this is reached only when the caller asks by name.
	const useBalance = balanceByLength && strategy === 'chapters-per-part' && targetParts > 1;

	const parts =
		strategy === 'passage-per-part'
			? planByPassage(passages, baseTitle)
			: useBalance
				? planByBalance(passages[0], targetParts, baseTitle)
				: planByChapters(passages[0], chaptersPerPart, baseTitle);

	const totalVerses = parts.reduce((sum, part) => sum + part.verseCount, 0);

	return {
		strategy,
		parts,
		totalVerses,
		warnings: assessPlan(parts, passages, translationId)
	};
}

/**
 * One part per passage. No arithmetic — the seams already exist.
 */
function planByPassage(passages, baseTitle) {
	return passages.map((p, index) => {
		const range = {
			testament: p.testament,
			book: p.book ?? p.bookId,
			fromChapter: p.fromChapter,
			fromVerse: p.fromVerse,
			toChapter: p.toChapter,
			toVerse: p.toVerse
		};
		return {
			seriesOrder: index + 1,
			title: baseTitle ? `${baseTitle} — Part ${index + 1}` : `Part ${index + 1}`,
			passages: [range],
			verseCount: verseCountOf(range)
		};
	});
}

/**
 * Divide one contiguous single-book range into `targetParts` parts of similar verse length,
 * breaking only on chapter boundaries ("Balance by length", §5 option (b), Q11).
 *
 * ## Why chapter boundaries are still respected
 *
 * §5 specifies "balance by verse count, **breaking on chapter boundaries**", and the reason is in the
 * same paragraph: chapter boundaries are meaningful to readers in a way equal verse counts are not.
 * So this never splits a chapter to even out the arithmetic — it chooses *where among the chapter
 * seams* to cut. Psalms is the case that motivates it: at one chapter per part, Psalm 117 (2 verses)
 * and Psalm 119 (176) become parts of wildly different size.
 *
 * ## Why it takes a part COUNT rather than a target length
 *
 * §5 rule 1 is that a series is never imposed and the shape is always the user's choice. A part count
 * is a number the user can see the consequence of — the preview lists that many parts. A target verse
 * length is not: it yields an unpredictable number of parts, so the user would be choosing an input
 * whose output they cannot picture, which is exactly what the preview exists to prevent.
 *
 * ## The algorithm, and its stated limitation
 *
 * Greedy: walk the chapters, accumulating into the current part until adding the next chapter would
 * take it further from the ideal average than closing it here. That is not a globally optimal
 * partition — a dynamic-programming pass would do better on pathological inputs — and it is chosen
 * deliberately: the result must be *explainable* in the preview ("parts of roughly N verses"), and a
 * greedy walk in canonical order never reorders or skips a chapter, so what the user sees is what the
 * arithmetic did. Recorded rather than left as an unexamined choice.
 *
 * @param {Object} passage - A single contiguous range in one book
 * @param {number} targetParts - How many parts the user asked for
 * @param {string} baseTitle
 * @returns {Array<Object>}
 */
function planByBalance(passage, targetParts, baseTitle) {
	const testament = passage.testament;
	const book = passage.book ?? passage.bookId;

	// Each chapter's verse count, and the portion of the first/last that the range actually covers —
	// a range may start or end mid-chapter (Q12), and balancing on the whole chapter's length would
	// then weight a partial chapter as if it were complete.
	const chapters = [];
	for (let ch = passage.fromChapter; ch <= passage.toChapter; ch += 1) {
		const length = getVerseCount(testament, book, ch);
		if (!length) return planByChapters(passage, 1, baseTitle);
		const from = ch === passage.fromChapter ? passage.fromVerse : 1;
		const to = ch === passage.toChapter ? Math.min(passage.toVerse, length) : length;
		chapters.push({ chapter: ch, from, to, verses: Math.max(0, to - from + 1) });
	}

	const total = chapters.reduce((sum, c) => sum + c.verses, 0);
	// Clamp to something achievable: never more parts than chapters (a part must hold at least one
	// chapter, since chapters are not split), and never fewer than one.
	const wanted = Math.max(1, Math.min(Math.floor(targetParts), chapters.length));
	const ideal = total / wanted;

	/** @type {Array<Array<Object>>} */
	const groups = [];
	let current = [];
	let currentVerses = 0;

	for (let i = 0; i < chapters.length; i += 1) {
		const chapter = chapters[i];
		const remainingChapters = chapters.length - i;
		const remainingGroups = wanted - groups.length;

		// Reserve one chapter per group still to be opened, so the last groups cannot be starved of
		// chapters entirely — without this a greedy fill can consume everything and emit fewer parts
		// than asked for.
		const mustCloseNow = current.length > 0 && remainingChapters < remainingGroups;

		if (mustCloseNow) {
			groups.push(current);
			current = [chapter];
			currentVerses = chapter.verses;
			continue;
		}

		if (current.length === 0) {
			current = [chapter];
			currentVerses = chapter.verses;
			continue;
		}

		// Close here, or take this chapter too? Whichever leaves the group closer to the ideal.
		const withoutIt = Math.abs(currentVerses - ideal);
		const withIt = Math.abs(currentVerses + chapter.verses - ideal);
		const roomForMore = groups.length < wanted - 1;

		if (withIt <= withoutIt || !roomForMore) {
			current.push(chapter);
			currentVerses += chapter.verses;
		} else {
			groups.push(current);
			current = [chapter];
			currentVerses = chapter.verses;
		}
	}
	if (current.length > 0) groups.push(current);

	return groups.map((group, index) => {
		const first = group[0];
		const last = group[group.length - 1];
		const range = {
			testament,
			book,
			fromChapter: first.chapter,
			fromVerse: first.from,
			toChapter: last.chapter,
			toVerse: last.to
		};
		return {
			seriesOrder: index + 1,
			title: partTitle(baseTitle, range, index + 1),
			passages: [range],
			verseCount: verseCountOf(range)
		};
	});
}

/**
 * Divide one contiguous single-book range into parts of N chapters.
 *
 * Only valid for a single passage in a single book: `splitRangeIntoPassages()` destructures a
 * scalar `book` and counts chapters upward, and across a gap "3 chapters per part" is not
 * merely undefined but unanswerable (§5). `getPartingStrategy` is what keeps us out of that
 * case; this function assumes it was consulted.
 */
function planByChapters(passage, chaptersPerPart, baseTitle) {
	const testament = passage.testament;
	const book = passage.book ?? passage.bookId;
	const step = Math.max(1, Math.floor(chaptersPerPart));

	const parts = [];
	let order = 1;

	for (let ch = passage.fromChapter; ch <= passage.toChapter; ch += step) {
		const lastChapter = Math.min(ch + step - 1, passage.toChapter);

		// Only the first and last parts inherit the source range's partial-chapter bounds; the
		// interior parts are whole chapters. A study of Rom 1:18–8:39 must not silently become
		// Rom 1:1–… — the user chose to start at verse 18 (Q12 allows partial chapters).
		const fromVerse = ch === passage.fromChapter ? passage.fromVerse : 1;
		const toVerse =
			lastChapter === passage.toChapter
				? passage.toVerse
				: getVerseCount(testament, book, lastChapter);

		const range = {
			testament,
			book,
			fromChapter: ch,
			fromVerse,
			toChapter: lastChapter,
			toVerse
		};

		parts.push({
			seriesOrder: order,
			title: partTitle(baseTitle, range, order),
			passages: [range],
			verseCount: verseCountOf(range)
		});
		order += 1;
	}

	return parts;
}

/**
 * Name a chapter-derived part after the chapters it covers, which is more use in the Finder
 * than "Part 7" alone.
 */
function partTitle(baseTitle, range, order) {
	const label =
		range.fromChapter === range.toChapter
			? `${range.fromChapter}`
			: `${range.fromChapter}–${range.toChapter}`;
	if (!baseTitle) return `Part ${order}`;
	return `${baseTitle} ${label}`;
}

function verseCountOf(range) {
	return (
		countVersesInRange(
			range.testament,
			range.book,
			range.fromChapter,
			range.fromVerse,
			range.toChapter,
			range.toVerse
		) || 0
	);
}

/**
 * Assess a plan for compliance, per SERIES_PLAN §5 and Q33.
 *
 * Three checks, and the third is the one that is easy to omit:
 *
 *   1. Per-part display limits — delegated to `validateStudyDisplayLimits()`.
 *   2. `checkSinglePassageSupport` per part, so a stepper setting that makes a part unservable
 *      is caught while the stepper is still on screen.
 *   3. The SERIES-LEVEL aggregate, computed by running the same page validator over ALL the
 *      parts at once. Per-part checks go quiet as the parting gets finer — 21 one-chapter parts
 *      of John each pass while the series still covers a book ESV caps at 439 verses on a page.
 *      "No warnings" would otherwise be read as "compliant" when it only means the check that
 *      could see the problem was never run (trap 8).
 *
 * ⚠️ The per-part and aggregate checks both DELEGATE rather than re-deriving the limit. A first
 * draft of this function hand-rolled `min(maxVersesPerPage, bookTotal × maxBookPortion)`, which
 * was wrong in two ways that matter: it would have reported the cap as two competing numbers
 * instead of resolving "whichever is less" to the one that binds (COMPLIANCE §1.7 — the error
 * that document records four times), and it omitted the licence's short-book exception, so it
 * would have warned about a 2-chapter Haggai series that the terms expressly permit whole.
 * `validateStudyDisplayLimits()` already handles both, plus verse-identity de-duplication for
 * overlapping ranges. Do not re-implement it here.
 *
 * Informational, never blocking: compliance is the study owner's obligation and refusing
 * creation would remove the choice §5 exists to protect.
 */
function assessPlan(parts, sourcePassages, translationId) {
	const warnings = [];

	for (const part of parts) {
		const range = part.passages[0];

		const display = validateStudyDisplayLimits(part.passages, translationId);
		for (const message of display.warnings) {
			warnings.push({
				level: 'warning',
				scope: 'part',
				seriesOrder: part.seriesOrder,
				message: `Part ${part.seriesOrder}: ${message}`
			});
		}

		// `canBeSinglePassage` — NOT `supported`, which is what an earlier draft guessed at.
		// A wrong property name here would be silently falsy and quietly disable this check.
		const support = checkSinglePassageSupport(range, translationId);
		if (support && support.canBeSinglePassage === false) {
			warnings.push({
				level: 'warning',
				scope: 'part',
				seriesOrder: part.seriesOrder,
				reason: support.reason,
				message: `Part ${part.seriesOrder}: ${support.message}`
			});
		}
	}

	// The series-level aggregate — the check that per-part parting silences.
	//
	// Run over the SOURCE passages, so the aggregate reflects what the series covers rather
	// than the sum of the parts; the validator's verse-identity Set means overlapping parts
	// (Q40) are counted once, not twice.
	const seriesWide = validateStudyDisplayLimits(sourcePassages, translationId);
	if (!seriesWide.compliant) {
		for (const message of seriesWide.warnings) {
			warnings.push({
				level: 'notice',
				scope: 'series',
				message: `Across the whole series: ${message} Each part is checked on its own, so this will not warn again until export.`
			});
		}
	}

	return warnings;
}
