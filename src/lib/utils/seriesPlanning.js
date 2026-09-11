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

import { countVersesInRange, getVerseCount, getBook } from './bibleData.js';
import { checkSinglePassageSupport, validateStudyDisplayLimits } from './translationLimits.js';
// The SAME formatter the Finder rows, the series page's Continue button and Split Part's
// `titleForSecondPart` use. A second reference formatter here would be free to disagree with
// them about where the dash goes — see `partTitle()`.
import { formatPassageReference } from './passageFormatting.js';

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
 * @param {Array<number>} [options.chaptersPerPassage] - Per-passage chapters-per-part, positionally
 *   matching `passages`. Only used by the `passage-per-part` strategy. `0`/absent means "this
 *   passage stays whole", which is the pre-existing behaviour for every entry.
 * @returns {{ strategy: string, parts: Array<Object>, totalVerses: number, warnings: Array<Object> }}
 */
export function planSeriesParts({
	passages,
	chaptersPerPart = 1,
	translationId,
	baseTitle = '',
	balanceByLength = false,
	targetParts = 0,
	chaptersPerPassage = []
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

	// ⚠️ The single-passage strategies are named for the BOOK, not for `baseTitle`.
	//
	// `partTitle()` now builds a passage reference, and a reference is only a reference if it
	// begins with a book name. `baseTitle` is the STUDY title — free text the user typed — so
	// feeding it through produced "The Road to Romans 1:1-32", which reads as a citation of a
	// book that does not exist. It was survivable while the title was `${baseTitle} ${chapters}`
	// and is not now.
	//
	// `planByPassage` already did this for exactly the adjacent reason (its own comment: a
	// multi-passage study spans books, so the study title names chapters of an unstated book).
	// The two strategies now agree, and `baseTitle` survives only as the fallback for a range
	// whose book id will not resolve.
	const bookTitle = passages.length > 0 ? bookLabelOf(passages[0]) || baseTitle : baseTitle;

	const parts =
		strategy === 'passage-per-part'
			? planByPassage(passages, baseTitle, chaptersPerPassage)
			: useBalance
				? planByBalance(passages[0], targetParts, bookTitle)
				: planByChapters(passages[0], chaptersPerPart, bookTitle);

	const totalVerses = parts.reduce((sum, part) => sum + part.verseCount, 0);

	return {
		strategy,
		parts,
		totalVerses,
		warnings: assessPlan(parts, translationId)
	};
}

/**
 * One part per passage — or, where the user asked for it, several parts per passage.
 *
 * ## Why this may now subdivide
 *
 * The original version emitted exactly one part per passage, on the reasoning that "the seams
 * already exist". That is true of the seams BETWEEN passages and false of the text inside one: a
 * study of Revelation plus Matthew has two user-drawn seams and 50 chapters, and locking it to two
 * parts of 404 and 1071 verses is the app deciding the shape, which §5 rule 1 forbids. §5's table
 * routed that case to "part-per-passage, then Split Part" — 48 modal round-trips to reach a shape
 * the creation preview could have offered directly, and never visible before committing, which
 * rule 3 asks for.
 *
 * ⚠️ **The scalar `book` is NOT generalised** (§5, trap 15). Each passage is parted on its own by
 * `planByChapters()`, which receives a single contiguous single-book range — exactly the input it
 * already accepts. The unanswerable cross-gap question ("is part 4 Romans 8, or Romans 4 which is
 * not in this study?") never arises, because no division ever spans two passages. Contiguity
 * constrains the algorithm, not the feature; this honours that by calling the algorithm N times
 * rather than by widening it once.
 *
 * @param {Array<Object>} passages
 * @param {string} baseTitle
 * @param {Array<number>} [chaptersPerPassage] - Positional; `0`/absent leaves that passage whole.
 */
function planByPassage(passages, baseTitle, chaptersPerPassage = []) {
	const parts = [];

	passages.forEach((p, index) => {
		const range = {
			testament: p.testament,
			book: p.book ?? p.bookId,
			fromChapter: p.fromChapter,
			fromVerse: p.fromVerse,
			toChapter: p.toChapter,
			toVerse: p.toVerse
		};

		const requested = Math.floor(Number(chaptersPerPassage?.[index]) || 0);
		const spansChapters = range.toChapter > range.fromChapter;

		if (requested >= 1 && spansChapters) {
			// Delegated, not re-implemented: partial-chapter bounds at the range's own edges
			// (Q12) are handled there, and duplicating that arithmetic is how the two copies
			// start disagreeing about whether Rom 1:18–8:39 begins at verse 1.
			// Titled by BOOK, not by the study title: a multi-passage study spans books, so
			// "Prison Epistles 1:1-3:21" is wrong twice over — it cites a book that does not
			// exist, and four passages would each restart at chapter 1, giving repeated titles.
			for (const sub of planByChapters(range, requested, bookLabelOf(range))) {
				parts.push(sub);
			}
			return;
		}

		parts.push({
			seriesOrder: 0,
			// Named for the book and chapters it covers, matching the chapters-per-part strategy.
			// The old `Part 2` gave the Finder a list of parts distinguishable only by number — and
			// with subdivision that is now actively ambiguous, since several parts come from one
			// passage.
			title: partTitle(bookLabelOf(range), range, index + 1),
			passages: [range],
			verseCount: verseCountOf(range)
		});
	});

	// Renumbered ACROSS the whole series, after all passages are expanded. `planByChapters()`
	// numbers from 1 each time it is called, so without this a two-passage study subdivided on
	// both sides would produce two parts numbered 1 — and `seriesOrder` is the column the Finder
	// orders by and the boundary commands identify neighbours with.
	return parts.map((part, order) => ({ ...part, seriesOrder: order + 1 }));
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
 * A range's readable book name, falling back to the raw id.
 *
 * `getBook()` returns null for an unknown id, and a part titled "undefined 3–5" in the Finder
 * would be worse than one titled "MT 3–5".
 */
function bookLabelOf(range) {
	const book = range.book ?? range.bookId;
	return getBook(range.testament, book)?.title || book || '';
}

/**
 * Name a part after the PASSAGE REFERENCE it covers — "Romans 1:1-32", not "Romans 1".
 *
 * ## Why the full reference, verses included
 *
 * This function is the single source of every part name in the app. The preview lists in
 * `ManageSerializationModal` and `SplitIntoSeriesModal`, the "Merge **X**" copy in
 * `JoinPartsModal` and `SplitPartModal`, the review page's deleted-parts and discarded-titles
 * lists, and `describePartDeletion`'s consequence sentences all render the string produced
 * here. So a lossy name is lossy in seven places at once, and fixing it at any one of them
 * puts that surface into disagreement with the other six.
 *
 * It WAS lossy. "Romans 1" names a chapter; the part covers `Romans 1:1-32`, and at the range's
 * own edges the difference is load-bearing — a study of Rom 1:18–8:39 produced a part titled
 * "Romans 1" that did not start where Romans 1 starts (Q12 allows partial chapters). The verses
 * were dropped from the name while being preserved everywhere else, which is the one place the
 * user reads it.
 *
 * This also settles a discrepancy rather than creating one: Split Part has always named the part
 * it creates by full reference (`titleForSecondPart` in `api/series/[id]/split/+server.js`, which
 * calls `formatPassageReference` directly, with the reason given there — a name derived from
 * content is stable under reordering and a number is not). Parts created by splitting and parts
 * created by parting now follow the same rule.
 *
 * ⚠️ **HYPHEN, not en dash**, matching `formatPassageReference` — which is what the Finder rows
 * and the series page's Continue button show, and therefore where a part's name is read most
 * often. `seriesExtent.js`'s `formatExtentReference` uses an en dash for the review page's
 * "what is leaving the study" copy; that divergence predates this and is left alone deliberately
 * rather than half-corrected here.
 *
 * ⚠️ **This is a stored title, not a display string.** The preview must show what will be
 * written (`seriesPlanning`'s header comment: the preview "cannot promise a shape the creation
 * produces differently"), which is why the fix belongs here rather than in the two modals that
 * render it. Existing series are NOT migrated: `study.title` is user-editable, and a rename is
 * indistinguishable from a generated title at the row level, so rewriting them would silently
 * destroy deliberate renames.
 *
 * `order` remains the last-resort fallback for a range with no resolvable book name — a part
 * titled "undefined 1:1-32" would be worse than "Part 7".
 */
function partTitle(baseTitle, range, order) {
	if (!baseTitle) return `Part ${order}`;
	// Same shape as `formatPassageReference`, taking the book name the caller already resolved:
	// the planner's ranges carry a scalar book ID (`RO`), not the `bookName` that formatter
	// reads, so passing a range straight to it would yield "undefined 1:1-32".
	return formatPassageReference({
		bookName: baseTitle,
		fromChapter: range.fromChapter,
		fromVerse: range.fromVerse,
		toChapter: range.toChapter,
		toVerse: range.toVerse
	});
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
 * The first part a translation genuinely cannot serve, or `null` when every part is servable.
 *
 * ## Why this is the only unit the request limits may be asked about
 *
 * Crossway's caps are per REQUEST and per PAGE, and a part is its own study on its own page
 * fetched by its own request — so the PARTS are what those clauses govern, never the source
 * range they were derived from (COMPLIANCE §1.10). Asking `validatePassagesLimits()` about the
 * recomposed whole instead is the defect recorded twice now: once on the New Study server
 * action (`verify-series-save-gate.mjs`) and once on the series-EDIT path, where reopening a
 * 28-part Matthew series and changing only its subtitle was refused with "This passage spans
 * 1071 verses… add it as several smaller passages" — advice the user had already taken, since
 * the series they were editing WAS the division. That is COMPLIANCE §1.9: a check belongs at
 * every chokepoint, on the correct unit, not the one that came to mind first.
 *
 * ## Every range of every part, not just the first
 *
 * `assessPlan()` above reads `part.passages[0]` because a PLANNED part has exactly one range by
 * construction. Parts loaded from the database do not: a part can carry several passage rows,
 * and after `projectExtent()` narrows one it can carry several again. Checking only the first
 * would let an over-limit second range through — a check that passes because it did not look,
 * which is the shape COMPLIANCE §1.8 calls the worst kind of failure. So this iterates.
 *
 * Returns the OFFENDER rather than a boolean, so the caller can name which part is at fault:
 * "Part 3 cannot be loaded: …" is actionable in a way that "this series is too large" is not.
 *
 * @param {Array<Object>} parts - Parts, each with a `passages` array; `seriesOrder` when known
 * @param {string} translationId
 * @returns {{ seriesOrder: number|null, reason: string, message: string|null }|null}
 */
export function findUnservablePart(parts, translationId) {
	for (const [index, part] of (Array.isArray(parts) ? parts : []).entries()) {
		const ranges = Array.isArray(part?.passages) ? part.passages : [];

		for (const range of ranges) {
			const support = checkSinglePassageSupport(range, translationId);

			// `canBeSinglePassage === false`, never `!support.canBeSinglePassage`: a wrong or
			// missing property would be silently falsy and quietly disable this check, which is
			// the trap `assessPlan()` documents against `supported`.
			if (support && support.canBeSinglePassage === false) {
				return {
					// Fall back to position when a part has no `seriesOrder` — a planned part
					// carries one, a projected row always does, but a caller assembling parts
					// by hand should still get a number the user can count to.
					seriesOrder: part?.seriesOrder ?? index + 1,
					reason: support.reason,
					message: support.message
				};
			}
		}
	}

	return null;
}

/**
 * Assess a plan for compliance, per SERIES_PLAN §5 and Q33.
 *
 * Two checks, BOTH scoped to a single part:
 *
 *   1. Per-part display limits — delegated to `validateStudyDisplayLimits()`. This is the one
 *      that catches "too few parts": Galatians at 5 chapters per part puts 131 of its 149 verses
 *      in part 1, over the half-book cap of 74. Fetchable, so nothing blocks — and genuinely
 *      non-compliant on the page it will be shown on. Adding parts clears it, which is why it
 *      belongs beside a stepper.
 *   2. `checkSinglePassageSupport` per part, so a stepper setting that makes a part unservable
 *      is caught while the stepper is still on screen.
 *
 * ⚠️ There is deliberately NO series-level aggregate here; see the comment at the end of this
 * function before adding one back. Trap 8 is real but is answered at the export boundary, where
 * the aggregate can BLOCK rather than merely mention.
 *
 * ⚠️ Both checks DELEGATE rather than re-deriving the limit. A first
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
function assessPlan(parts, translationId) {
	const warnings = [];

	for (const part of parts) {
		const range = part.passages[0];

		// `canBeSinglePassage` — NOT `supported`, which is what an earlier draft guessed at.
		// A wrong property name here would be silently falsy and quietly disable this check.
		const support = checkSinglePassageSupport(range, translationId);
		const unservable = Boolean(support && support.canBeSinglePassage === false);

		if (unservable) {
			warnings.push({
				level: 'warning',
				scope: 'part',
				seriesOrder: part.seriesOrder,
				reason: support.reason,
				message: `Part ${part.seriesOrder}: ${support.message}`
			});
		}

		// Retrieval takes precedence over display, exactly as the New Study form already does for
		// the non-series case (see StudyForm.svelte, the `{#if !hasPassageIssues}` guard and its
		// comment). A part ESV will not serve produces BOTH messages, and they are the same fact
		// twice: "does not serve the complete book of Matthew" already says the licence limits
		// what one page may display, so appending "allows at most 500 verses of a single book"
		// adds a number to a part that cannot be fetched at all. The retrieval message is the
		// more actionable of the two — it names the remedy — so it is the one that survives.
		const display = validateStudyDisplayLimits(part.passages, translationId);
		for (const message of display.warnings) {
			if (unservable) continue;
			warnings.push({
				level: 'warning',
				scope: 'part',
				seriesOrder: part.seriesOrder,
				message: `Part ${part.seriesOrder}: ${message}`
			});
		}
	}

	// NOTHING is emitted for the series as a whole. A deliberate removal, not an omission.
	//
	// This spot has now been wrong twice, in opposite directions. It first reported the aggregate
	// as a DISPLAY violation ("the complete book of Matthew … on one page"), which is a category
	// error: a series is many pages. Re-scoping it to EXPORT fixed the wording and left the real
	// defect — it still fired on every whole-book ESV series, could not be cleared by any control
	// on the form, and warned about a boundary the user had not reached and might never reach.
	//
	// The aggregate IS enforced, and more strictly than a notice here could be:
	// `MenuExport.guardExport()` runs `checkSeriesExport()` at the moment of export and per Q32
	// BLOCKS, where per-part export only warns. It also knows more — the loaded part ranges
	// rather than a plan — and already says the useful thing ("Each part on its own is within the
	// limit, but exporting them all reproduces more than the licence allows").
	//
	// Trap 8's worry is "validation goes quiet as parting gets finer". That is answered by the
	// export gate, not from here. What remains above is the per-part loop, which is the only
	// check that is BOTH true at creation and fixable at creation: a part over the half-book
	// display cap is cleared by the stepper sitting beside the message. Galatians at 5 chapters
	// per part is the case — 131 of 149 verses in part 1, fetchable (under the 500-verse request
	// cap) yet over half the book, so Save is enabled and the part is still non-compliant.
	//
	// ⚠️ Do not reinstate a series-wide message here. If the export gate is ever weakened, fix
	// the gate.
	return warnings;
}
