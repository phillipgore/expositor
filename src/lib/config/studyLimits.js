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
 * user as the provider's rule). Both wasted real time.
 *
 * See COMPLIANCE.md, "Translation limits" (§3) and "The third axis: retrieval"
 * (§1.5, which is where the NET cap's `source: self-imposed` is set out).
 *
 * Cited by heading TEXT with the number in parentheses, deliberately. This read
 * "See COMPLIANCE.md §3 and §13.2" — and there is no §13.2 in that document, nor
 * any successor with that number; it went stale when the sections were renumbered
 * and pointed nowhere for long enough to be recorded as a trap in SERIES_PLAN.md.
 * A heading can be grepped when it moves. A bare number cannot, and fails
 * silently, which is the sharper half of the lesson: the dangling reference sat
 * three lines above the comment explaining why references go stale.
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
 * See the "Safari scroll choppiness" section of SERIES_PLAN.md (formerly
 * LINKED_STUDIES_PLAN.md). Cited by section *name* rather than number on purpose: this
 * reference was already stale once when that document was renumbered. Note that the filename
 * then went stale too, which is the same lesson one level up — cite the most stable handle
 * available, and expect even that to move.
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
 * Assess a verse count for rendering performance.
 *
 * Advisory only: `level` is never anything a caller should treat as a failure.
 * Copy avoids promising a specific outcome, since the underlying cause is not yet
 * confirmed — it describes what may happen, not what will.
 *
 * ## Why `unit` exists
 *
 * Every threshold in this file measures ONE RENDERED PAGE — DOM spans laid out by
 * one Analyze view. So the caller must pass the count of a thing that will actually
 * be rendered as a page, and for a series that is a PART, not the source range the
 * parts were cut from. A whole-Psalms series was reporting 2,461 verses; no page in
 * it renders more than 176.
 *
 * The remedy differs with the unit, which is why this is a copy variant and not one
 * unit-neutral sentence: "consider a smaller range" is useless advice to a user who
 * has already divided the range — their control is chapters per part.
 *
 * This is the third appearance in this codebase of one bug: a count that measures a
 * different unit from the sentence reporting it. See COMPLIANCE.md §1.10 and the
 * sibling suppression in StudyForm.svelte, where the licence alert is withheld under
 * a series for the same reason ("a series is not one page").
 *
 * @param {number} totalVerses - Verses in the unit being assessed
 * @param {{ unit?: 'study'|'part' }} [options] - `'part'` when the count is the largest part of a series
 * @returns {{ level: 'ok'|'notice'|'warning', totalVerses: number, estimatedSpans: number, message: string|null }}
 */
export function assessStudySize(totalVerses, options = {}) {
	const verses = Number.isFinite(totalVerses) && totalVerses > 0 ? Math.floor(totalVerses) : 0;
	const estimatedSpans = verses * SPANS_PER_VERSE;
	const isPart = options.unit === 'part';
	const count = verses.toLocaleString();

	if (verses >= VERSE_COUNT_WARNING) {
		return {
			level: 'warning',
			totalVerses: verses,
			estimatedSpans,
			message: isPart
				? `The largest part contains ${count} verses. Parts this large can scroll and zoom slowly, particularly in Safari. You can still create the series — consider fewer chapters per part.`
				: `This study contains ${count} verses. Studies this large can scroll and zoom slowly, particularly in Safari. You can still create it — consider whether a smaller range would suit how you plan to work.`
		};
	}

	if (verses >= VERSE_COUNT_NOTICE) {
		return {
			level: 'notice',
			totalVerses: verses,
			estimatedSpans,
			message: isPart
				? `The largest part contains ${count} verses. Large parts may feel less responsive when scrolling or zooming.`
				: `This study contains ${count} verses. Large studies may feel less responsive when scrolling or zooming.`
		};
	}

	return { level: 'ok', totalVerses: verses, estimatedSpans, message: null };
}
