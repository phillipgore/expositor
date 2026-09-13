/**
 * # May a structural command reach ACROSS the seam at this edge? (SERIES_PLAN §8, §11)
 *
 * Four predicates — Join Up, Join Down, Move Text Up, Move Text Down — answering the one question the
 * per-study flags cannot: the selection sits at an edge of THIS part, so is there a neighbouring part
 * beyond it that the command may legally reach into?
 *
 * ## ⚠️ Why `boundaryBefore === null` could not answer it alone
 *
 * `+layout.server.js` computes the two boundary reasons like this:
 *
 *     boundaryBefore: index > 0 ? getBoundaryDisabledReason(prev, this) : null
 *
 * so `null` carries **two different meanings**: "the previous seam is contiguous, go ahead" and "there
 * is no previous part at all". `MenuStructure.svelte` read it as the first, unconditionally:
 *
 *     return atInternalSeam || (atPartStart && seriesContext?.boundaryBefore === null);
 *
 * On **part 1's first item** that is the second meaning, and the command was therefore ENABLED with
 * nothing above it to reach. Same defect mirrored on the **last part's final item** for the two Down
 * commands. Clicking spent a server round trip to come back with a refusal in an `alert()` — which is
 * precisely the failure the Join Down rewrite removed once (`setJoinNeighbours`: "left it wrongly
 * ENABLED on the final item, where the only feedback was a server refusal after the click"), reappearing
 * one level up at the series' outer edges.
 *
 * The discriminator was already loaded and simply unread: `position` (1-based) and `total`. So an edge
 * is reachable only when a neighbour EXISTS and its own seam is contiguous. The two clauses are
 * independent and both required.
 *
 * ## The two edges are different seams, and must never share a predicate
 *
 * A leading-edge question consults `boundaryBefore`; a trailing-edge question consults `boundaryAfter`.
 * Answering a Down command with the Up rule would enable it whenever the part's *leading* seam happened
 * to be contiguous — a different seam entirely. That trap is why these ship as four named functions over
 * one parameterised helper: there is no argument to get backwards.
 *
 * ## Scope: this is the SERIES half of the rule, never the whole rule
 *
 * Whether a neighbour exists *inside* this study is `joinNeighbours.js` (`hasJoinPredecessor` /
 * `hasJoinSuccessor`) for the Joins, and `isWordInFirst/LastSegment` for the moves. These predicates add
 * back only what lies BEYOND the study's edge, and the server stays the authority on what is reachable.
 *
 * @module crossPartCommands
 */

/**
 * @typedef {Object} SeriesContext
 * @property {number} position - 1-based position of this part within the series
 * @property {number} total - How many parts the series holds
 * @property {string|null} boundaryBefore - Why the seam BEFORE this part is ineligible, or null when it is contiguous (or absent)
 * @property {string|null} boundaryAfter - Why the seam AFTER this part is ineligible, or null when it is contiguous (or absent)
 */

/**
 * @typedef {Object} EdgeContext
 * @property {SeriesContext|null} seriesContext - Series context from the study layout; null for a standalone study
 * @property {number} passageCount - How many passages this study/part holds
 * @property {number|null} activePassageIndex - Which passage the selection sits in, or null when unresolved
 * @property {boolean} isDocument - Whether this is the read-only Document view
 */

/**
 * Is there a part BEFORE this one in the series?
 *
 * Guards on a resolved, sane `position`: a malformed context must not be read as "a neighbour exists",
 * since that is the permissive answer and the one that re-creates the defect.
 *
 * @param {SeriesContext|null} seriesContext
 * @returns {boolean}
 */
export function hasPreviousPart(seriesContext) {
	const position = seriesContext?.position;
	if (!Number.isFinite(position)) return false;
	return position > 1;
}

/**
 * Is there a part AFTER this one in the series?
 *
 * @param {SeriesContext|null} seriesContext
 * @returns {boolean}
 */
export function hasNextPart(seriesContext) {
	const position = seriesContext?.position;
	const total = seriesContext?.total;
	if (!Number.isFinite(position) || !Number.isFinite(total)) return false;
	return position < total;
}

/**
 * Is the selection in the FIRST passage of this study, i.e. at the part's own leading edge?
 *
 * ⚠️ `activePassageIndex === 0` is checked explicitly rather than relying on falsiness: `null` means the
 * page could not place the selection, and treating that as passage 0 would blame a part edge for an
 * internal seam. Silence is correct until we actually know.
 */
function atPartStart({ seriesContext, passageCount, activePassageIndex }) {
	return Boolean(seriesContext) && passageCount > 0 && activePassageIndex === 0;
}

/** Is the selection in the LAST passage of this study, i.e. at the part's own trailing edge? */
function atPartEnd({ seriesContext, passageCount, activePassageIndex }) {
	return Boolean(seriesContext) && passageCount > 0 && activePassageIndex === passageCount - 1;
}

/**
 * Is the selection at an INTERNAL passage seam on the leading side?
 *
 * A part may hold several passages (the part-per-passage strategy, §5). The second passage's first item
 * is a seam *within* the part — always joinable, never a series matter — so it must not be subjected to
 * any part-edge test.
 */
function atInternalSeamBefore({ passageCount, activePassageIndex }) {
	return passageCount > 1 && Number.isFinite(activePassageIndex) && activePassageIndex !== 0;
}

/** The trailing mirror: an internal passage seam below the selection. */
function atInternalSeamAfter({ passageCount, activePassageIndex }) {
	return (
		passageCount > 1 &&
		Number.isFinite(activePassageIndex) &&
		activePassageIndex !== passageCount - 1
	);
}

/**
 * May a Join Up reach past this part's LEADING edge?
 *
 * True at an internal passage seam, or at the part's leading edge when a previous part exists AND the
 * seam to it is contiguous. False for the first part of a series — nothing precedes it — and for a
 * permanently ineligible seam.
 *
 * @param {EdgeContext} context
 * @returns {boolean}
 */
export function canJoinUpAcross(context) {
	if (context.isDocument) return false;
	if (atInternalSeamBefore(context)) return true;
	return (
		atPartStart(context) &&
		hasPreviousPart(context.seriesContext) &&
		context.seriesContext?.boundaryBefore === null
	);
}

/**
 * May a Join Down reach past this part's TRAILING edge?
 *
 * The mirror of {@link canJoinUpAcross}, consulting `boundaryAfter` and the NEXT part. Deliberately its
 * own function rather than a direction argument — see the module header on why the two edges must never
 * share a predicate.
 *
 * @param {EdgeContext} context
 * @returns {boolean}
 */
export function canJoinDownAcross(context) {
	if (context.isDocument) return false;
	if (atInternalSeamAfter(context)) return true;
	return (
		atPartEnd(context) &&
		hasNextPart(context.seriesContext) &&
		context.seriesContext?.boundaryAfter === null
	);
}

/**
 * May a Move Text Up reach past this part's LEADING edge?
 *
 * Identical seam rule to Join Up: the edge either has a reachable neighbour or it does not, and that
 * fact does not depend on which command is asking. The commands differ in their WITHIN-study
 * preconditions (a word selection, a caret not already at the segment start), which the caller still
 * applies — those are not this module's business.
 *
 * ⚠️ A cross-part move additionally requires the caret to sit at the START of a verse, because passage
 * ranges are verse-granular while segment anchors are word-granular. That is resolved server-side from
 * the actual word id (`crossPartMove.js`), which this module does not have.
 *
 * @param {EdgeContext} context
 * @returns {boolean}
 */
export function canMoveTextUpAcross(context) {
	return canJoinUpAcross(context);
}

/**
 * May a Move Text Down reach past this part's TRAILING edge?
 *
 * @param {EdgeContext} context
 * @returns {boolean}
 */
export function canMoveTextDownAcross(context) {
	return canJoinDownAcross(context);
}

/**
 * May a **Move Selected Up** reach past this part's leading edge into the previous PART?
 *
 * ## ⚠️ Why this is not `canJoinUpAcross`
 *
 * It is that predicate **minus the internal-seam clause**, and the difference is the whole point.
 * `canJoinUpAcross` returns true at an internal passage seam because a Join there is a legitimate
 * within-study operation that the old passage-scoped code refused. Move Selected has no such debt: at
 * an internal seam it is served by the WITHIN-PASSAGE tier (`itemTransfer.js`'s adjacent-column
 * resolution), which needs no series context at all and must not be overridden by a part-tier answer.
 *
 * Reusing the Join predicate here would report "yes, cross into the previous part" for an item whose
 * real destination is the column immediately beside it — sending a section across a study boundary
 * while its true neighbour sat one column away. That is the precedence rule of `itemTransfer.js`
 * inverted, and it would be invisible until a user noticed their section had left the part.
 *
 * So this answers only the narrow question the within-passage tier cannot: **the item is at the part's
 * own outer edge, and there is a reachable part beyond it.**
 *
 * @param {EdgeContext} context
 * @returns {boolean}
 */
export function canMoveSelectedUpAcross(context) {
	if (context.isDocument) return false;
	return (
		atPartStart(context) &&
		hasPreviousPart(context.seriesContext) &&
		context.seriesContext?.boundaryBefore === null
	);
}

/**
 * May a **Move Selected Down** reach past this part's trailing edge into the next PART?
 *
 * The mirror of {@link canMoveSelectedUpAcross}, consulting `boundaryAfter` and the NEXT part. Its own
 * function rather than a direction argument, for the reason the module header gives: there is no
 * argument to get backwards.
 *
 * @param {EdgeContext} context
 * @returns {boolean}
 */
export function canMoveSelectedDownAcross(context) {
	if (context.isDocument) return false;
	return (
		atPartEnd(context) &&
		hasNextPart(context.seriesContext) &&
		context.seriesContext?.boundaryAfter === null
	);
}

