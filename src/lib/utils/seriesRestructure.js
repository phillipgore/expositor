/**
 * # Split Part and Join Parts — the planning layer (SERIES_PLAN §8, phase 2)
 *
 * Pure range arithmetic and validation for restructuring an existing series. No database, no
 * transaction: the endpoints in `api/series/[id]/parts` execute what these functions decide, and
 * `scripts/verify-series-restructure.mjs` exercises the decisions against real `bible.json` data.
 *
 * Splitting this out is not ceremony. §5's creation flow already learned the lesson — the preview
 * and the endpoint share `planSeriesParts()` so "what the user approved" and "what got built"
 * cannot diverge. Split and Join need the same property: the confirm dialog must state the
 * outcome, and it can only do that honestly if it asks the function that will produce it.
 *
 * ## What these functions refuse to do
 *
 * They never renumber `seriesOrder` from canonical order. §4's decision — reinforced in §8 step 8
 * and the decisions log — is that `seriesOrder` is seeded once and thereafter belongs to the user.
 * A split inserts one number and shifts the tail; a join removes one and closes the gap. Neither
 * re-derives the sequence, because a user who deliberately teaches Rom 8 first must not have that
 * arrangement silently undone by an unrelated edit. `renumberForInsert` / `renumberForRemoval`
 * exist precisely so the shifting is explicit and local rather than a re-sort.
 *
 * ## Eligibility is borrowed, never re-implemented
 *
 * Join Parts asks `classifyBoundary()` — the same predicate that governs boundary-move
 * eligibility, the delete warning and drag legality (§4: "one concept, two uses", plus the third).
 * A second adjacency rule written here would be a fourth place for the four to disagree.
 *
 * ## Joining across a gap: `allowNonContiguous`
 *
 * A contiguous join **coalesces** two ranges into one. That is why contiguity was required: there
 * is no honest single range spanning Romans 1–3 and Romans 8, and inventing one would silently
 * claim the user studies chapters 4–7, which they excluded.
 *
 * But coalescing is the only part that needs contiguity. Two ranges can be carried by ONE part as
 * two passages — which is not a new shape: §5 decided a gapped study like Romans 1–3 + Romans 8,
 * or a four-book Prison Epistles study, is a first-class thing a series may be made of. So
 * `planPartJoin()` takes `allowNonContiguous`, and under it a gap or a book change merges the two
 * parts while **keeping both ranges separate**.
 *
 * ⚠️ It defaults to `false`, and that default is load-bearing rather than cautious.
 * `api/series/[id]/reserialize` calls this function as an **assertion**: `diffSeams()` only ever
 * proposes joins inside a run, so a refusal there means the two disagree and it throws. Flipping
 * the default would silence that check — a cross-run join would quietly succeed instead of failing
 * loudly, and re-serialization would restructure a series in a way the diff never proposed. Only
 * the Join Parts endpoint passes `true`, and only because a user asked for it in so many words.
 *
 * ⚠️ **Overlap is still refused, under either flag.** Separating the ranges does not cure the
 * duplication — Rom 1–3 with Rom 3–5 repeats chapter 3 whether it is stored as one range or two.
 * Q40 settled overlap as ineligible and nothing here reopens it.
 *
 * @module seriesRestructure
 */

import { getVerseCount, getBookVerseTotal } from './bibleData.js';
import { checkSinglePassageSupport, getDistributionLimits } from './translationLimits.js';

// `classifyBoundary` rather than `isBoundaryContiguous`: the join now branches on WHICH of the
// four states a seam is in — overlap refuses outright, gap and different-books are gated by
// `allowNonContiguous`, contiguous coalesces — and the boolean cannot express that. Still the
// same single predicate (§4), just read at full resolution.
import { classifyBoundary } from './seriesRuns.js';

/**
 * Normalise a passage row to the shape the range helpers expect.
 *
 * DB rows carry `bookId`; ranges built in memory carry `book`. Reading only one of them is the
 * defect COMPLIANCE.md §1.8 records as the worst kind — a check that reports success *because* it
 * failed to understand its input. Normalised once, here, so no caller can reintroduce it.
 */
function normaliseRange(range) {
	if (!range) return null;
	const book = range.book ?? range.bookId ?? null;
	if (!book) return null;
	return {
		testament: range.testament,
		book,
		bookName: range.bookName ?? null,
		fromChapter: range.fromChapter,
		fromVerse: range.fromVerse,
		toChapter: range.toChapter,
		toVerse: range.toVerse
	};
}

/** Passages of a part, normalised and in display order. */
function rangesOf(part) {
	const list = Array.isArray(part?.passages) ? part.passages : [];
	return list
		.slice()
		.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
		.map(normaliseRange)
		.filter(Boolean);
}

function sortParts(parts) {
	return (parts ?? []).slice().sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
}

/**
 * Where a part may be divided.
 *
 * Two shapes, because §5 builds parts two ways and a split has to answer for both:
 *
 * - a single-passage part divides at a **chapter** line, which is the only place the arithmetic
 *   is defined (the same constraint §5 records for the chapters-per-part stepper);
 * - a multi-passage part divides at a **passage seam**, where there is no arithmetic at all —
 *   the seams are already drawn.
 *
 * A part of one single-chapter passage has neither, and says so rather than offering a split that
 * would produce an empty half.
 *
 * @param {Object} part
 * @returns {{ kind: 'chapter'|'passage'|'none', chapters: number[], seams: number[], reason: string|null }}
 */
export function getSplitPoints(part) {
	const ranges = rangesOf(part);

	if (ranges.length === 0) {
		return { kind: 'none', chapters: [], seams: [], reason: 'This part has no passages.' };
	}

	if (ranges.length > 1) {
		// Seam i means "passages 0..i-1 stay, i.. move to the new part", so the usable seams are
		// 1..len-1: seam 0 would leave the first part empty.
		return {
			kind: 'passage',
			chapters: [],
			seams: Array.from({ length: ranges.length - 1 }, (_, i) => i + 1),
			reason: null
		};
	}

	const range = ranges[0];
	if (range.toChapter <= range.fromChapter) {
		return {
			kind: 'none',
			chapters: [],
			seams: [],
			reason: 'This part covers a single chapter, so it cannot be divided further.'
		};
	}

	// "Split after chapter N" for every N with at least one chapter left on each side.
	const chapters = [];
	for (let c = range.fromChapter; c < range.toChapter; c += 1) chapters.push(c);
	return { kind: 'chapter', chapters, seams: [], reason: null };
}

/**
 * Plan the division of one part into two (§8, "Split Part").
 *
 * Returns the two resulting parts as ranges plus the `seriesOrder` shift the caller must apply.
 * Compliance is *reported*, never enforced: §5's decisions log is explicit that a user may
 * knowingly create a part that will warn at export, and refusing here would remove the choice.
 *
 * @param {Object} params
 * @param {Object} params.part - The part to divide, with `passages`
 * @param {number} [params.afterChapter] - Split after this chapter (single-passage parts)
 * @param {number} [params.atPassageSeam] - Split before this passage index (multi-passage parts)
 * @param {string} params.translationId
 * @returns {{ ok: boolean, error: string|null, first: Object[], second: Object[], warnings: Object[] }}
 */
export function planPartSplit({ part, afterChapter, atPassageSeam, translationId }) {
	const points = getSplitPoints(part);
	const ranges = rangesOf(part);

	if (points.kind === 'none') {
		return { ok: false, error: points.reason, first: [], second: [], warnings: [] };
	}

	let first = [];
	let second = [];

	if (points.kind === 'passage') {
		const seam = Number(atPassageSeam);
		if (!points.seams.includes(seam)) {
			return {
				ok: false,
				error: 'That is not a seam between this part’s passages.',
				first: [],
				second: [],
				warnings: []
			};
		}
		first = ranges.slice(0, seam);
		second = ranges.slice(seam);
	} else {
		const at = Number(afterChapter);
		if (!points.chapters.includes(at)) {
			return {
				ok: false,
				error: 'That chapter is not inside this part.',
				first: [],
				second: [],
				warnings: []
			};
		}

		const range = ranges[0];
		const chapterEnd = getVerseCount(range.testament, range.book, at);
		if (!chapterEnd) {
			// Without a real verse count the first half's end is a guess, and a guessed range is
			// silently wrong text rather than a visible failure.
			return {
				ok: false,
				error: 'The length of that chapter is unknown, so the split point cannot be placed.',
				first: [],
				second: [],
				warnings: []
			};
		}

		first = [{ ...range, toChapter: at, toVerse: chapterEnd }];
		second = [{ ...range, fromChapter: at + 1, fromVerse: 1 }];
	}

	return {
		ok: true,
		error: null,
		first,
		second,
		warnings: [
			...assessRanges(first, translationId, 'The first part'),
			...assessRanges(second, translationId, 'The second part')
		]
	};
}

/**
 * Plan a merge of two adjacent parts (§8, "Join Parts").
 *
 * Q27 — next and previous only, never arbitrary: joining two parts that are not neighbours in the
 * sequence would have to invent an order for the result.
 *
 * Q26 — a merged range over one passage's worth is **reported, not blocked**. The recommendation
 * was to ask `checkSinglePassageSupport` and branch: NET merges silently because its cap is our own
 * guardrail with nothing to warn about, while ESV needs the user told how many passages the merged
 * part will need. Blocking would refuse a legal arrangement; silently restructuring would change
 * the user's document shape without saying so.
 *
 * @param {Object} params
 * @param {Array<Object>} params.parts - All parts of the series
 * @param {string} params.partId - The part the user invoked the command on
 * @param {'previous'|'next'} params.direction
 * @param {string} params.translationId
 * @param {boolean} [params.allowNonContiguous=false] - Permit a gap or a book change by keeping
 *   the two ranges as separate passages of one part. Never permits overlap. See the module
 *   docblock for why the default must stay `false`.
 * @returns {{ ok: boolean, error: string|null, keep: Object|null, absorb: Object|null, passages: Object[], warnings: Object[], discards: string[], coalesced: boolean, seamKind: string }}
 */
export function planPartJoin({
	parts,
	partId,
	direction,
	translationId,
	allowNonContiguous = false
}) {
	const ordered = sortParts(parts);
	const index = ordered.findIndex((p) => p.id === partId);

	const fail = (error) => ({
		ok: false,
		error,
		keep: null,
		absorb: null,
		passages: [],
		warnings: [],
		discards: [],
		coalesced: false,
		seamKind: 'gap'
	});

	if (index === -1) return fail('That part is not in this series.');

	const otherIndex = direction === 'previous' ? index - 1 : index + 1;
	if (otherIndex < 0 || otherIndex >= ordered.length) {
		return fail(
			direction === 'previous'
				? 'This is the first part, so there is nothing before it to join.'
				: 'This is the last part, so there is nothing after it to join.'
		);
	}

	// The earlier part in sequence keeps its identity; Q28 keeps its title too.
	const before = direction === 'previous' ? ordered[otherIndex] : ordered[index];
	const after = direction === 'previous' ? ordered[index] : ordered[otherIndex];

	// Borrowed, not re-derived — see the module docblock. `getBoundaryDisabledReason` is not used
	// here because its copy is written for a *disabled command*; a join attempt needs to say what
	// went wrong with this gesture.
	const seamKind = classifyBoundary(before, after);

	/**
	 * Why this seam is not contiguous, in the user's terms — WITHOUT the consequence.
	 *
	 * ⚠️ One clause, completed two ways. The refusal finishes it with what cannot happen ("so
	 * joining them would leave a gap"); the warning finishes it with what will ("They will be
	 * joined as separate passages"). Only the shared diagnosis lives here, because that is the
	 * part that must never drift: a seam described one way when refused and another when allowed
	 * is the §11 failure of a boundary named inconsistently. The consequences legitimately differ,
	 * so they are written at the two call sites rather than forced into one string.
	 */
	const describeSeam = () => {
		if (seamKind === 'different-books') {
			const left = rangesOf(before).at(-1)?.bookName ?? 'These parts';
			const right = rangesOf(after)[0]?.bookName ?? 'the next part';
			return `${left} and ${right} aren’t adjacent in Scripture`;
		}
		return 'These parts aren’t adjacent in Scripture';
	};

	if (seamKind !== 'contiguous') {
		// ⚠️ Overlap is refused FIRST and unconditionally, before `allowNonContiguous` is consulted.
		// Keeping the ranges separate is what rescues a gap, but it does nothing for an overlap:
		// Rom 1–3 plus Rom 3–5 repeats chapter 3 either way, so the flag must not reach it (Q40).
		if (seamKind === 'overlap') {
			return fail('These parts overlap, so joining them would repeat the same verses.');
		}

		// The refusal completes the clause with what cannot happen.
		if (!allowNonContiguous) {
			return fail(`${describeSeam()}, so joining them would leave a gap.`);
		}
	}

	// Concatenate, then coalesce the seam: the whole point of a contiguous join is that the two
	// ranges become one continuous range rather than two passages that happen to abut.
	const beforeRanges = rangesOf(before);
	const afterRanges = rangesOf(after);
	const passages = [...beforeRanges];
	const seamLeft = passages.at(-1);
	const seamRight = afterRanges[0];

	// ⚠️ `seamKind === 'contiguous'` is part of the condition, not merely implied by it. Same-book
	// was a sufficient test only while contiguity was enforced above; under `allowNonContiguous` a
	// Romans 1–3 / Romans 8 seam is same-book AND gapped, so the old test would coalesce it into
	// "Romans 1–8" and hand the user four chapters they deliberately excluded. That is the silent
	// data-claiming failure this whole flag exists to avoid.
	if (
		seamKind === 'contiguous' &&
		seamLeft &&
		seamRight &&
		seamLeft.book === seamRight.book &&
		seamLeft.testament === seamRight.testament
	) {
		passages[passages.length - 1] = {
			...seamLeft,
			toChapter: seamRight.toChapter,
			toVerse: seamRight.toVerse
		};
		passages.push(...afterRanges.slice(1));
	} else {
		passages.push(...afterRanges);
	}

	// Q28: the absorbed part's title and subtitle have nowhere to go. Its passages — and therefore
	// every column, section, segment, note and commentary hanging off them — are re-parented
	// intact, so this list is deliberately short and must not be padded to look thorough.
	const discards = [];
	if (after.title) discards.push(after.title);

	const warnings = assessRanges(passages, translationId, 'The joined part');

	// A non-contiguous join is legal but not what "join" usually means, so it says so in the same
	// words the refusal would have used. Reported as a warning rather than blocking: §5's rule is
	// that a user may knowingly build a part that will warn, and the user asked for this one.
	// First in the list — it describes the operation itself, where the others describe the result.
	if (seamKind !== 'contiguous') {
		warnings.unshift({
			severity: 'warning',
			reason: 'non-contiguous-join',
			// Completes the same clause with what WILL happen. Stated as fact, not permission —
			// the user has already asked for the join, so this reports the outcome rather than
			// posing a question the live Join button has already answered.
			message: `${describeSeam()}. They will be joined as separate passages.`
		});
	}

	return {
		ok: true,
		error: null,
		keep: before,
		absorb: after,
		passages,
		warnings,
		discards,
		// Whether the two ranges became one. The endpoint derives the same fact by counting rows
		// (it must, since only it knows how many passage rows exist), but callers that hold only
		// the plan — the modal, the verification scripts — would otherwise have to re-derive it
		// from the seam, which is the duplication this module's docblock warns against.
		coalesced: seamKind === 'contiguous',
		seamKind
	};
}

/**
 * Compliance and retrieval assessment for a proposed set of ranges.
 *
 * Two distinct questions, and conflating them is COMPLIANCE.md's recurring error:
 * `checkSinglePassageSupport` asks whether the *provider* will serve this as one passage, while
 * the complete-book note is a *licence* observation. Both are reported; neither blocks.
 *
 * ⚠️ The licence question must be asked of the licence. The first version of this function warned
 * about a complete book for *every* translation, which would have told a NET user their merge was
 * a problem when `allowCompleteBook` is `true` for NET — the decisions log's "limit message
 * attribution" row is exactly this bug ("`validatePassageLimits` once blamed the provider for our
 * own cap"), and its instruction is that any new limit copy must check the source first.
 */
function assessRanges(ranges, translationId, subject) {
	const warnings = [];
	// Read once, outside the loop: the licence governs the translation, not the range.
	const allowsCompleteBook = getDistributionLimits(translationId)?.allowCompleteBook !== false;

	for (const range of ranges) {
		// The field is `canBeSinglePassage`, NOT `supported`. Written as `supported` first and
		// caught by the type-checker: an invented field name would have been permanently falsy,
		// so this branch would never have fired and Join Parts would have reported every merge as
		// serviceable in one passage — silent, and exactly the failure COMPLIANCE.md §1.8 records.
		const support = checkSinglePassageSupport(range, translationId);
		if (support && support.canBeSinglePassage === false) {
			warnings.push({
				severity: 'notice',
				reason: support.reason ?? 'exceeds-request',
				message: `${subject} needs more than one passage: ${support.message ?? 'the translation cannot serve this range in one request.'}`
			});
		}

		// Only worth saying where the licence actually forbids it. NET permits complete books
		// outright, so the same merge must produce no warning there.
		if (!allowsCompleteBook) {
			const bookTotal = getBookVerseTotal(range.testament, range.book);
			if (bookTotal > 0 && versesIn(range) >= bookTotal) {
				warnings.push({
					severity: 'warning',
					reason: 'complete-book',
					message: `${subject} would cover the complete book of ${range.bookName ?? range.book}, which this translation’s licence does not permit.`
				});
			}
		}
	}

	return warnings;
}

/** Verse count of one range, summing real chapter lengths rather than assuming they are equal. */
function versesIn(range) {
	let total = 0;
	for (let c = range.fromChapter; c <= range.toChapter; c += 1) {
		const length = getVerseCount(range.testament, range.book, c);
		if (!length) return 0;
		const from = c === range.fromChapter ? range.fromVerse : 1;
		const to = c === range.toChapter ? Math.min(range.toVerse, length) : length;
		total += Math.max(0, to - from + 1);
	}
	return total;
}

/**
 * `seriesOrder` values after inserting one part directly behind `afterOrder`.
 *
 * Shifts the tail rather than re-deriving the sequence — see the module docblock. Returns only the
 * parts whose value actually changes, so the caller writes the minimum.
 *
 * @returns {{ inserted: number, updates: Array<{ id: string, seriesOrder: number }> }}
 */
export function renumberForInsert(parts, afterOrder) {
	const updates = [];
	for (const part of sortParts(parts)) {
		if ((part.seriesOrder ?? 0) > afterOrder) {
			updates.push({ id: part.id, seriesOrder: (part.seriesOrder ?? 0) + 1 });
		}
	}
	return { inserted: afterOrder + 1, updates };
}

/**
 * `seriesOrder` values after removing the part at `removedOrder`, closing the gap.
 *
 * @returns {Array<{ id: string, seriesOrder: number }>}
 */
export function renumberForRemoval(parts, removedOrder) {
	const updates = [];
	for (const part of sortParts(parts)) {
		if ((part.seriesOrder ?? 0) > removedOrder) {
			updates.push({ id: part.id, seriesOrder: (part.seriesOrder ?? 0) - 1 });
		}
	}
	return updates;
}
