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
import {
	checkSinglePassageSupport,
	validateStudyDisplayLimits
} from './translationLimits.js';


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
 * @returns {{ strategy: string, parts: Array<Object>, totalVerses: number, warnings: Array<Object> }}
 */
export function planSeriesParts({ passages, chaptersPerPart = 1, translationId, baseTitle = '' }) {
	const strategy = getPartingStrategy(passages);

	if (strategy === 'ineligible') {
		return { strategy, parts: [], totalVerses: 0, warnings: [] };
	}

	const parts =
		strategy === 'passage-per-part'
			? planByPassage(passages, baseTitle)
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
