/**
 * Study-level engineering limits.
 *
 * ## Why these live HERE and not in translations.json
 *
 * Every number in this file is **ours**. None of it comes from a publisher, an
 * API's terms of use, or a copyright permission. These are properties of our
 * renderer: how many DOM nodes the Analyze view can lay out and scroll smoothly.
 * They would be identical if we served a public-domain translation with no
 * licence at all.
 *
 * Putting them in `translations.json` would repeat a mistake this codebase has
 * now made twice — filing a limit under the wrong boundary, where a later reader
 * mistakes it for an external constraint and goes looking for the provider
 * documentation that supposedly justifies it. Once was `maxBookPortion` (a
 * copyright rule enforced at fetch time, which made every book in the Bible
 * unstudyable); once was NET's 500-verse cap (our own guardrail, reported to the
 * user as the provider's rule). Both wasted real time. See COMPLIANCE.md §3 and
 * §13.2.
 *
 * So: translation limits describe *what the publisher allows*. This file
 * describes *what our renderer handles well*. Never merge them.
 *
 * ## Why these are warnings and not a hard cap
 *
 * There is deliberately no enforced maximum. The reported scroll choppiness in
 * Safari begins around 400 verses, which is BELOW any round number we would pick
 * as a cap — so a 500-verse limit would permit the bad experience it was meant to
 * prevent while blocking legitimate multi-passage studies. That is the worst of
 * both outcomes.
 *
 * The leading suspects for that choppiness are the `transform: scale()` layer on
 * `.analyze-content-inner` and absent CSS containment — neither of which is a
 * node-count problem, and both of which would be fixed in CSS rather than by
 * restricting what a user may study. Until that is measured rather than guessed,
 * a hard cap would be encoding a rendering bug into the data model permanently.
 * See LINKED_STUDIES_PLAN.md §13.1.
 *
 * Warn, explain, and let the user decide. Revisit only with measurements.
 */

/**
 * Approximate DOM spans emitted per verse (one per word plus separators).
 *
 * Derived from the observed Psalms figure: 2,461 verses produced roughly 55,000
 * word/space spans. Used only to explain magnitude in warning copy, never for
 * layout decisions.
 */
export const SPANS_PER_VERSE = 22;

/**
 * Verse count above which a study is worth mentioning to the user.
 *
 * Set just above the ~400-verse mark where choppiness has been observed, so the
 * first tier lands close to real-world onset rather than at a round number.
 */
export const VERSE_COUNT_NOTICE = 600;

/**
 * Verse count above which the warning becomes prominent.
 *
 * Chosen to sit clear of 1,000 on purpose. Crossway's quotation permission is
 * also 1,000 verses, and two unrelated limits sharing a value is precisely how
 * the earlier confusion in this codebase started — someone reads "1,000" and
 * assumes copyright when it is really about DOM nodes.
 */
export const VERSE_COUNT_WARNING = 1200;

/**
 * Assess a study's total verse count for rendering performance.
 *
 * Advisory only: `level` is never anything a caller should treat as a failure.
 * Copy avoids promising a specific outcome, since the underlying cause is not yet
 * confirmed — it describes what may happen, not what will.
 *
 * @param {number} totalVerses - Total verses across every passage in the study
 * @returns {{ level: 'ok'|'notice'|'warning', totalVerses: number, estimatedSpans: number, message: string|null }}
 */
export function assessStudySize(totalVerses) {
	const verses = Number.isFinite(totalVerses) && totalVerses > 0 ? Math.floor(totalVerses) : 0;
	const estimatedSpans = verses * SPANS_PER_VERSE;

	if (verses >= VERSE_COUNT_WARNING) {
		return {
			level: 'warning',
			totalVerses: verses,
			estimatedSpans,
			message: `This study contains ${verses.toLocaleString()} verses. Studies this large can scroll and zoom slowly, particularly in Safari. You can still create it — consider whether a smaller range would suit how you plan to work.`
		};
	}

	if (verses >= VERSE_COUNT_NOTICE) {
		return {
			level: 'notice',
			totalVerses: verses,
			estimatedSpans,
			message: `This study contains ${verses.toLocaleString()} verses. Large studies may feel less responsive when scrolling or zooming.`
		};
	}

	return { level: 'ok', totalVerses: verses, estimatedSpans, message: null };
}
