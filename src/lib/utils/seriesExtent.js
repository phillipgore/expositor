/**
 * # Which verses are still in the study? (SERIES_PLAN §5, §8)
 *
 * Editing a serialized study asks TWO questions, and they are not the same question:
 *
 *   1. **Extent** — which verses does the study cover? Changed by editing the passage list.
 *   2. **Division** — where are the seams between parts? Changed by Manage Serialization.
 *
 * `seriesSeams.js` answers (2). This module answers (1), and it must run FIRST, because a seam
 * diff computed across a changed extent is not merely incomplete — it is wrong in a way that
 * reports success.
 *
 * ## The defect this module exists to prevent
 *
 * Shrinking a study from Matthew 1–8 to Matthew 1–5 was fed straight to `diffSeams()`, which saw
 * eight parts where it wanted five and emitted `join p5 ← [p6, p7, p8]`. But **a join is
 * verse-conservative**: `planPartJoin()` coalesces ranges, so the result is a part covering
 * Matthew 5:1–8:34. The user asked for chapters 6–8 to LEAVE the study; the operation kept every
 * one of them and reported success. Shrinking from the front was worse — it proposed
 * `join p1 ← [p2, p3, p4]`, which keeps the dropped chapters AND discards part 1's title.
 *
 * Neither produced a refusal or a warning. That is the failure COMPLIANCE.md §1.8 calls the worst
 * kind: a check that passes *because* it failed to understand its input.
 *
 * The cause is a category error, not a missing branch. Seam diffing asks "where are the
 * boundaries?" and has no vocabulary for "these verses are gone" — so it answered the only question
 * it knows, which happened to be the wrong one. Adding a special case inside `diffSeams()` would
 * have kept the two questions tangled; separating them is what makes each answerable.
 *
 * ## What this module decides, and what it refuses to decide
 *
 * It classifies each existing part against the new extent — `inside`, `outside`, `partial` — and
 * reports the text that is new. It does NOT decide what happens to structure, notes or commentary
 * in a part that shrinks or disappears: that is `analyzeEdit()`'s job (which offers the user
 * Merge/Delete per item) and `describePartDeletion()`'s (which writes §4's confirmation for a whole part).
 * Deciding here would be a second, quieter answer to a question the user is entitled to be asked.
 *
 * @module seriesExtent
 */

import { getVerseCount } from './bibleData.js';

/**
 * Normalise a range to the shape the helpers expect.
 *
 * DB rows carry `bookId`; ranges built in memory carry `book`. Reading only one is the two-spellings
 * trap `seriesRestructure.js` and `seriesSeams.js` both normalise for.
 */
function normalise(range) {
	if (!range) return null;
	const book = range.book ?? range.bookId ?? null;
	if (!book) return null;
	return {
		testament: range.testament,
		book,
		bookName: range.bookName ?? range.bookId ?? range.book ?? null,
		fromChapter: range.fromChapter,
		fromVerse: range.fromVerse,
		toChapter: range.toChapter,
		toVerse: range.toVerse
	};
}

/** Parts in the user's sequence. §4 forbids re-deriving the order from canonical order. */
function sortParts(parts) {
	return [...(parts ?? [])].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
}

/** A part's ranges, normalised, in display order. */
function rangesOf(part) {
	const list = Array.isArray(part?.passages) ? part.passages : [];
	return list
		.slice()
		.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
		.map(normalise)
		.filter(Boolean);
}

/**
 * Compare two (chapter, verse) positions within one book.
 *
 * Deliberately NOT `compareWordIds`: that needs a book abbreviation and a word index, and every
 * caller here already knows it is comparing inside a single book. Building word ids to compare two
 * integer pairs would add a lookup that can fail (an unknown book yields a wrong-but-plausible
 * abbreviation) to arithmetic that cannot.
 *
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
function comparePosition(aChapter, aVerse, bChapter, bVerse) {
	if (aChapter !== bChapter) return aChapter - bChapter;
	return aVerse - bVerse;
}

/** Is this range inside the same book as that one? Ranges never span books (§5, trap 15). */
function sameBook(a, b) {
	return a.testament === b.testament && a.book === b.book;
}

/**
 * The overlap between two ranges in the same book, or null when they do not meet.
 *
 * Touching endpoints count: a part covering Matthew 5 and an extent ending at Matthew 5:1 overlap
 * in exactly one verse, and that part must be NARROWED rather than deleted. Treating a one-verse
 * overlap as no overlap would delete a part the user still wants, along with everything in it.
 */
function intersect(a, b) {
	if (!sameBook(a, b)) return null;

	const startsLater =
		comparePosition(a.fromChapter, a.fromVerse, b.fromChapter, b.fromVerse) >= 0 ? a : b;
	const endsEarlier = comparePosition(a.toChapter, a.toVerse, b.toChapter, b.toVerse) <= 0 ? a : b;

	const empty =
		comparePosition(
			startsLater.fromChapter,
			startsLater.fromVerse,
			endsEarlier.toChapter,
			endsEarlier.toVerse
		) > 0;
	if (empty) return null;

	return {
		testament: a.testament,
		book: a.book,
		bookName: a.bookName ?? b.bookName,
		fromChapter: startsLater.fromChapter,
		fromVerse: startsLater.fromVerse,
		toChapter: endsEarlier.toChapter,
		toVerse: endsEarlier.toVerse
	};
}

/** Do two ranges describe exactly the same verses? */
function sameRange(a, b) {
	return (
		sameBook(a, b) &&
		comparePosition(a.fromChapter, a.fromVerse, b.fromChapter, b.fromVerse) === 0 &&
		comparePosition(a.toChapter, a.toVerse, b.toChapter, b.toVerse) === 0
	);
}

/**
 * A human reference, for copy that names what is leaving the study.
 *
 * Exported because the review page must say "Matthew 5:21-48 leaves the study" in the user's own
 * vocabulary, and a second formatter would be free to disagree with this one about where the dash
 * goes.
 *
 * ## Why this still exists alongside `formatPassageReference`
 *
 * It takes a RANGE, not a passage row: `normalise()` above accepts `bookId`/`book`/`bookName` and
 * the loose shapes the extent planner works in, where `formatPassageReference` requires a
 * resolved `bookName`. Collapsing the two would mean either widening that formatter — which every
 * Finder row and part title depends on — or resolving book names at each of this module's three
 * call sites.
 *
 * ⚠️ **It used an EN DASH and now uses a hyphen.** That was the disagreement the comment above
 * warns against, present in the very function written to prevent it: the review page showed
 * `Matthew 5:21–48` a line away from part titles reading `Matthew 5:1-20`, two spellings of one
 * thing on one screen. The hyphen wins because `formatPassageReference` is what the Finder rows,
 * the series page's Continue button, Split Part's generated title and now every generated part
 * title use — so it is overwhelmingly the form a user has already read.
 *
 * If these two ever do get merged, the dash is no longer the obstacle.
 */
export function formatExtentReference(range) {
	const r = normalise(range);
	if (!r) return '';
	const book = r.bookName ?? r.book;
	if (r.fromChapter === r.toChapter && r.fromVerse === r.toVerse) {
		return `${book} ${r.fromChapter}:${r.fromVerse}`;
	}
	if (r.fromChapter === r.toChapter) {
		return `${book} ${r.fromChapter}:${r.fromVerse}-${r.toVerse}`;
	}
	return `${book} ${r.fromChapter}:${r.fromVerse}-${r.toChapter}:${r.toVerse}`;
}

/**
 * Classify every part against the study's new extent.
 *
 * @param {Object} params
 * @param {Array<Object>} params.parts - Current parts, with `passages`
 * @param {Array<Object>} params.desiredPassages - The edited passage list (recomposed shape)
 * @returns {{
 *   unchanged: boolean,
 *   keptParts: Array<Object>,
 *   narrowedParts: Array<Object>,
 *   deletedParts: Array<Object>,
 *   addedRanges: Array<Object>,
 *   dissolves: boolean
 * }}
 */
export function classifyExtent({ parts, desiredPassages }) {
	const ordered = sortParts(parts);
	const desired = (desiredPassages ?? []).map(normalise).filter(Boolean);

	const keptParts = [];
	const narrowedParts = [];
	const deletedParts = [];

	for (const part of ordered) {
		const current = rangesOf(part);

		// Each of the part's ranges, clipped to whatever the new extent still covers. A part may
		// hold several ranges (the part-per-passage strategy), and they are judged individually —
		// one can survive while another leaves entirely.
		const survivingRanges = [];
		const removedRanges = [];

		for (const range of current) {
			let bestOverlap = null;
			for (const want of desired) {
				const overlap = intersect(range, want);
				if (!overlap) continue;
				// Widest overlap wins. Desired passages do not overlap each other in practice, so
				// this matters only for malformed input — where taking the largest is the reading
				// that discards least.
				if (!bestOverlap) {
					bestOverlap = overlap;
					continue;
				}
				const isWider =
					comparePosition(
						overlap.fromChapter,
						overlap.fromVerse,
						bestOverlap.fromChapter,
						bestOverlap.fromVerse
					) < 0 ||
					comparePosition(
						overlap.toChapter,
						overlap.toVerse,
						bestOverlap.toChapter,
						bestOverlap.toVerse
					) > 0;
				if (isWider) bestOverlap = overlap;
			}

			if (bestOverlap) {
				survivingRanges.push({ from: range, to: bestOverlap });
			} else {
				removedRanges.push(range);
			}
		}

		if (survivingRanges.length === 0) {
			// Nothing of this part remains in the study. Deleting it destroys its structure, notes
			// and commentary, so it is reported — never acted on here.
			deletedParts.push({
				part,
				ranges: current,
				reference: current.map(formatExtentReference).join(', ')
			});
			continue;
		}

		const narrowed = survivingRanges.filter((s) => !sameRange(s.from, s.to));

		if (narrowed.length === 0 && removedRanges.length === 0) {
			keptParts.push(part);
		} else {
			narrowedParts.push({
				part,
				// Ranges whose bounds move: `analyzeEdit()` turns each into add/remove edges and
				// asks the user what to do with any content that would be orphaned.
				changes: narrowed.map((s) => ({ old: s.from, next: s.to })),
				// Whole ranges of a MULTI-range part that left entirely, while the part survives
				// through its other ranges. Distinct from `deletedParts`, where the part itself goes.
				removedRanges,
				reference: survivingRanges.map((s) => formatExtentReference(s.to)).join(', ')
			});
		}
	}

	// Text in the new extent that no current part covers.
	const addedRanges = findAddedRanges(ordered, desired);

	// ⚠️ Added text must be ATTACHED to a part, or it is silently dropped.
	//
	// Reporting `addedRanges` alone was not enough: the reserialize endpoint acts on per-part range
	// CHANGES, so text belonging to no part was never written. Growing a study from Matthew 1–3 to
	// 1–6 reported "Matthew 4:1–6:34 added", changed nothing, and returned success — the same class
	// of silent wrong answer this module was written to eliminate, reintroduced one layer up.
	//
	// Each added range is absorbed by the part it abuts, which is what the review page promises
	// ("these verses join the part next to them"). Extending an existing part also preserves that
	// part's structure, whereas creating a new part would leave the added text unstructured and
	// change the part count without the user asking.
	attachAddedRanges({ ordered, addedRanges, keptParts, narrowedParts });

	const survivingCount = keptParts.length + narrowedParts.length;

	return {
		// True when every part is untouched AND nothing new arrives — the case the seam diff may
		// safely proceed on.
		unchanged: deletedParts.length === 0 && narrowedParts.length === 0 && addedRanges.length === 0,
		keptParts,
		narrowedParts,
		deletedParts,
		addedRanges,
		// §4: a one-part series is a study wearing a costume, so it dissolves. Reported rather than
		// applied — the endpoint owns the write, and the review must say so before it happens.
		dissolves: survivingCount === 1 && addedRanges.length === 0
	};
}

/**
 * Absorb each added range into the part it abuts, so the extension is actually written.
 *
 * Mutates `keptParts` / `narrowedParts` in place: a kept part that gains text is no longer merely
 * kept — it becomes a narrowing (a range CHANGE), which is the only shape the executor acts on.
 *
 * ## Which part absorbs it
 *
 * The one whose range touches the addition, preferring the part BEFORE it. Extending the end of a
 * part is the common case (a study grown from Matthew 1–3 to 1–6), and it keeps the added verses in
 * reading order behind the structure already there. Only if nothing precedes it — the study grew at
 * the front — does the following part take it.
 *
 * A range abutting nothing (a gap re-filled in the middle of a non-contiguous series) is left
 * unattached and remains in `addedRanges` for the review to report. Attaching it to a distant part
 * would silently make that part cover verses the user never associated with it.
 */
function attachAddedRanges({ ordered, addedRanges, keptParts, narrowedParts }) {
	if (addedRanges.length === 0) return;

	/** Move a kept part into `narrowedParts`, or find its existing entry. */
	const asNarrowing = (part) => {
		const existing = narrowedParts.find((n) => n.part.id === part.id);
		if (existing) return existing;

		const keptIndex = keptParts.findIndex((p) => p.id === part.id);
		if (keptIndex !== -1) keptParts.splice(keptIndex, 1);

		const entry = { part, changes: [], removedRanges: [], reference: '' };
		narrowedParts.push(entry);
		return entry;
	};

	/** The range currently proposed for a part, so several additions compose. */
	const currentRange = (entry, original) => {
		const pending = entry.changes.find((c) => sameBook(c.old, original));
		return pending ? pending.next : original;
	};

	const remaining = [];

	for (const added of addedRanges) {
		let attached = false;

		// Prefer the part that ENDS where this begins.
		for (let i = ordered.length - 1; i >= 0 && !attached; i -= 1) {
			const part = ordered[i];
			if (!keptParts.includes(part) && !narrowedParts.some((n) => n.part.id === part.id)) continue;

			for (const range of rangesOf(part)) {
				if (!sameBook(range, added)) continue;
				const entry = asNarrowing(part);
				const from = currentRange(entry, range);
				// Abuts the end: the addition starts immediately after this range finishes.
				if (comparePosition(added.fromChapter, added.fromVerse, from.toChapter, from.toVerse) > 0) {
					upsertChange(entry, range, {
						...from,
						toChapter: added.toChapter,
						toVerse: added.toVerse
					});
					attached = true;
					break;
				}
			}
		}

		// Otherwise the part that BEGINS where this ends.
		for (let i = 0; i < ordered.length && !attached; i += 1) {
			const part = ordered[i];
			if (!keptParts.includes(part) && !narrowedParts.some((n) => n.part.id === part.id)) continue;

			for (const range of rangesOf(part)) {
				if (!sameBook(range, added)) continue;
				const entry = asNarrowing(part);
				const from = currentRange(entry, range);
				if (comparePosition(added.toChapter, added.toVerse, from.fromChapter, from.fromVerse) < 0) {
					upsertChange(entry, range, {
						...from,
						fromChapter: added.fromChapter,
						fromVerse: added.fromVerse
					});
					attached = true;
					break;
				}
			}
		}

		if (!attached) remaining.push(added);
	}

	// Only genuinely unattachable ranges are still reported as "added".
	addedRanges.length = 0;
	addedRanges.push(...remaining);

	for (const entry of narrowedParts) {
		entry.reference = entry.changes.map((c) => formatExtentReference(c.next)).join(', ');
	}
}

/**
 * The parts as they WILL BE once an extent change is applied — computed without touching anything.
 *
 * ## Why this exists
 *
 * Editing a serialized study can change its extent (which verses it covers) and its division (where
 * the seams fall) in one save. `diffSeams()` refuses to answer a division question across a changed
 * extent, and rightly so: asked that, it once produced a "join" that silently kept verses the user
 * had removed.
 *
 * The way out is not to weaken the guard but to ask the question in the right order. Applying the
 * extent change here, in memory, yields the parts the division step should actually reason about —
 * so `diffSeams()` sees a consistent extent and its precondition is SATISFIED rather than bypassed.
 *
 * ⚠️ Pure and non-destructive. Nothing here writes; the caller executes the extent change and this
 * projection separately, inside one transaction. If the two ever disagree, the executor is wrong —
 * this is the description the preview shows the user, so it must describe what the executor does.
 *
 * @param {Array<Object>} parts - Current parts, with `passages`
 * @param {Object} extent - `classifyExtent()` output for the same parts
 * @returns {Array<Object>} Surviving parts with their post-edit ranges
 */
export function projectExtent(parts, extent) {
	const deleted = new Set((extent?.deletedParts ?? []).map((d) => d.part.id));
	const narrowedById = new Map((extent?.narrowedParts ?? []).map((n) => [n.part.id, n]));

	const projected = [];

	for (const part of sortParts(parts)) {
		if (deleted.has(part.id)) continue;

		const narrowed = narrowedById.get(part.id);
		if (!narrowed) {
			projected.push(part);
			continue;
		}

		// Ranges that left this part entirely, while the part survives through another range.
		const removed = narrowed.removedRanges ?? [];

		const passages = rangesOf(part)
			.filter((range) => !removed.some((gone) => sameRange(range, gone)))
			.map((range) => {
				const change = narrowed.changes.find((c) => sameRange(c.old, range));
				// The projected range carries `book`, matching what `rangesOf()` normalises to, so
				// the division step reads the same shape whether a part moved or not.
				return change ? { ...range, ...change.next } : range;
			});

		projected.push({ ...part, passages });
	}

	return projected;
}

/** Record a range change, replacing any pending change for the same original range. */
function upsertChange(entry, original, next) {
	const existing = entry.changes.find((c) => sameRange(c.old, original));
	if (existing) {
		existing.next = next;
		return;
	}
	entry.changes.push({ old: original, next });
}

/**
 * Text in the new extent that no current part covers.
 *
 * Subtracts every existing range from each desired range, leaving the gaps. Growing a study from
 * Matthew 1–8 to Matthew 1–12 yields one added range of Matthew 9:1–12:50; re-extending a study
 * that was previously trimmed at both ends yields two.
 *
 * ⚠️ Verse-level, not chapter-level. Extending Matthew 5:1–20 to 5:1–48 adds 5:21–48 — a range
 * inside a single chapter that a chapter-granular subtraction would miss entirely, silently
 * dropping text the user asked for.
 *
 * @param {Array<Object>} parts
 * @param {Array<Object>} desired - Already normalised
 */
function findAddedRanges(parts, desired) {
	const covered = parts.flatMap(rangesOf);
	const added = [];

	for (const want of desired) {
		// The pieces of `want` still unaccounted for. Starts as the whole range and is carved up as
		// each existing range is subtracted.
		let remaining = [want];

		for (const have of covered) {
			if (!sameBook(have, want)) continue;

			const next = [];
			for (const piece of remaining) {
				const overlap = intersect(piece, have);
				if (!overlap) {
					next.push(piece);
					continue;
				}

				// The part of `piece` before the overlap.
				if (
					comparePosition(
						piece.fromChapter,
						piece.fromVerse,
						overlap.fromChapter,
						overlap.fromVerse
					) < 0
				) {
					const before = stepBack(overlap.fromChapter, overlap.fromVerse, piece);
					if (before) {
						next.push({
							...piece,
							toChapter: before.chapter,
							toVerse: before.verse
						});
					}
				}

				// The part of `piece` after the overlap.
				if (
					comparePosition(piece.toChapter, piece.toVerse, overlap.toChapter, overlap.toVerse) > 0
				) {
					const after = stepForward(overlap.toChapter, overlap.toVerse, piece);
					if (after) {
						next.push({
							...piece,
							fromChapter: after.chapter,
							fromVerse: after.verse
						});
					}
				}
			}
			remaining = next;
			if (remaining.length === 0) break;
		}

		added.push(...remaining);
	}

	return added;
}

/**
 * The verse immediately before (chapter, verse), rolling back a chapter when needed.
 *
 * Uses real verse counts rather than assuming chapters are equal length — the same reason
 * `classifyBoundary()` reaches for `getVerseCount`. Returns null when there is no earlier verse
 * inside `bounds`.
 */
function stepBack(chapter, verse, bounds) {
	if (verse > 1) return { chapter, verse: verse - 1 };
	const previousChapter = chapter - 1;
	if (previousChapter < bounds.fromChapter) return null;
	const length = getVerseCount(bounds.testament, bounds.book, previousChapter);
	// An unknown chapter length would make the boundary a guess, and a guessed range is silently
	// wrong text rather than a visible failure — the same refusal `planPartSplit()` makes.
	if (!length) return null;
	return { chapter: previousChapter, verse: length };
}

/**
 * The verse immediately after (chapter, verse), rolling forward a chapter when needed.
 */
function stepForward(chapter, verse, bounds) {
	const length = getVerseCount(bounds.testament, bounds.book, chapter);
	if (!length) return null;
	if (verse < length) return { chapter, verse: verse + 1 };
	const nextChapter = chapter + 1;
	if (nextChapter > bounds.toChapter) return null;
	return { chapter: nextChapter, verse: 1 };
}
