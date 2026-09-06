/**
 * # Re-serializing an existing series — the planning layer (SERIES_PLAN §5, §8)
 *
 * "Manage Serialization" on an already-serialized study. The user edits the study the way they
 * created it — one passage list, one chapters-per-part setting — and this module works out the
 * smallest set of Split Part / Join Parts operations that turns the CURRENT parts into the
 * requested shape.
 *
 * Pure: no database, no transaction. `api/series/[id]/reserialize` executes what this decides, and
 * `scripts/verify-series-seams.mjs` exercises the decisions against real `bible.json` data. Same
 * split as `seriesRestructure.js`, and for the same reason — the endpoint imports
 * `$lib/server/db/index.js`, which opens a connection at module load, so a decision layer tangled
 * with it cannot be tested by the plain-Node verifiers.
 *
 * ## The rule this module exists to honour: never touch an untouched part
 *
 * The obvious implementation — re-plan the series and rewrite every part — is a few dozen lines and
 * destroys the user's work. It would rewrite titles the user renamed, and (because
 * `passage_column.passage_id` is `ON DELETE CASCADE`) take every column, section, segment, heading,
 * note and commentary with it, while reporting success. That is the same trap
 * `seriesStructurePlan.js` documents for Join Parts.
 *
 * So nothing here re-plans a part. It diffs SEAMS — the boundaries between parts — and emits an
 * operation only where a seam actually appears or disappears. A part whose seams are unchanged is
 * never named in the output, so the executor never opens it, so nothing in it can be lost. The
 * preservation is structural rather than something the executor has to remember to do.
 *
 * ## Why seams are diffed WITHIN runs only
 *
 * A series decomposes into maximal runs of canonically contiguous parts (§4). The boundary between
 * two runs — Ephesians → Philippians, or a gap left by a part delete — is not a seam the user can
 * open or close by changing chapters-per-part. `planPartJoin()` refuses to join across one
 * ("these parts aren't adjacent in Scripture"), so a whole-series diff would emit joins the
 * endpoint rejects, and the failure would surface at commit rather than in the preview.
 *
 * Diffing per run means every operation this emits is one the existing endpoints accept.
 *
 * ⚠️ It also means **run structure is invariant** under everything here. Splitting inside a run
 * yields two abutting parts; joining inside a run yields one part abutting its neighbours. Neither
 * creates or removes a run boundary. `diffSeams()` returns `runShapePreserved` so a caller can
 * assert that rather than assume it — if it is ever false, an operation is about to change what is
 * reorderable, which §4 treats as a consequence needing a warning.
 *
 * ## What this module never does
 *
 * It never reads or writes `seriesOrder` beyond sorting by it. Reordering permutes RUNS and is
 * `seriesReorder.js`'s job (§4: "parts within a run are rigid"). Manage Serialization changes how
 * text is divided; the order parts are taught in is a separate decision the user has already made,
 * and re-deriving it from canonical order would silently undo a deliberate arrangement.
 *
 * @module seriesSeams
 */

import { classifyBoundary, computeRuns } from './seriesRuns.js';

/**
 * Normalise a range to the shape the helpers expect.
 *
 * DB rows carry `bookId`; ranges built in memory carry `book`. Reading only one of them is the
 * defect COMPLIANCE.md §1.8 records as the worst kind — a check that reports success *because* it
 * failed to understand its input. `seriesRestructure.js` normalises for the same reason.
 */
function normaliseRange(range) {
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

/** Parts in the user's sequence. `seriesOrder` is theirs; §4 forbids re-deriving it. */
function sortParts(parts) {
	return [...(parts ?? [])].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
}

/** A part's ranges, normalised, in display order. */
function rangesOf(part) {
	const list = Array.isArray(part?.passages) ? part.passages : [];
	return list
		.slice()
		.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
		.map(normaliseRange)
		.filter(Boolean);
}

/**
 * Do two ranges abut, such that they are one continuous stretch of text?
 *
 * ⚠️ BORROWED, never re-implemented. `classifyBoundary()` is the single adjacency predicate (§4:
 * "one concept, two uses", plus the third and now the fourth). It already knows that Matthew 5:48 →
 * Matthew 6:1 is contiguous only because 48 is the last verse of Matthew 5, which needs real verse
 * counts. A second rule written here would be a fifth place for the five to disagree.
 */
function abuts(left, right) {
	return classifyBoundary({ passages: [left] }, { passages: [right] }) === 'contiguous';
}

/**
 * Merge abutting ranges into continuous ones.
 *
 * Used to reconstitute "the passages as originally listed" from a series' parts: a Romans 1–16
 * study divided into sixteen parts must edit as ONE passage reading Romans 1–16, not as sixteen
 * rows the user never typed.
 *
 * Only ranges that genuinely abut are merged. A gap or a book change ends the run and starts a new
 * range, so Prison Epistles recomposes to the four passages it was created from.
 *
 * @param {Array<Object>} ranges - In sequence order
 * @returns {Array<Object>} Coalesced ranges
 */
export function coalesceRanges(ranges) {
	const input = (ranges ?? []).map(normaliseRange).filter(Boolean);
	if (input.length === 0) return [];

	const out = [{ ...input[0] }];

	for (let i = 1; i < input.length; i += 1) {
		const next = input[i];
		const current = out[out.length - 1];

		if (abuts(current, next)) {
			// One continuous stretch: extend the end, keep the start.
			current.toChapter = next.toChapter;
			current.toVerse = next.toVerse;
		} else {
			out.push({ ...next });
		}
	}

	return out;
}

/**
 * Reconstitute the passage list a series was created from.
 *
 * Walks parts in the USER'S order (`seriesOrder`), not canonical order. For a contiguous series
 * those coincide, because parts within a run are rigid. For a multi-run series — Prison Epistles,
 * or a series taught Philippians-first — they may not, and the user's arrangement is the one that
 * must survive the round trip.
 *
 * @param {Array<Object>} parts - Parts with `passages`
 * @returns {Array<Object>} The passages as originally listed
 */
export function recomposePassages(parts) {
	return coalesceRanges(sortParts(parts).flatMap(rangesOf));
}

/**
 * A seam's canonical position: the first word of the part that FOLLOWS it.
 *
 * Position rather than part index, because indices shift the moment one split is applied and a diff
 * keyed on them would be wrong after its own first operation. A canonical position is stable under
 * every operation in this module — the same property that lets structure be re-parented without
 * re-keying (`startingWordId` is globally canonical, §8).
 */
function seamKey(range) {
	return `${range.testament}:${range.book}:${range.fromChapter}:${range.fromVerse}`;
}

function seamAt(range) {
	return {
		key: seamKey(range),
		testament: range.testament,
		book: range.book,
		bookName: range.bookName,
		fromChapter: range.fromChapter,
		fromVerse: range.fromVerse
	};
}

/**
 * The seams that exist inside the current parts — one per contiguous boundary.
 *
 * Run boundaries are deliberately absent: they are not seams this feature can open or close. See
 * the module docblock.
 *
 * @param {Array<Object>} parts
 * @returns {Array<Object>} Seams, each tagged with the parts either side
 */
export function getCurrentSeams(parts) {
	const seams = [];

	for (const run of computeRuns(parts)) {
		for (let i = 1; i < run.length; i += 1) {
			const before = run[i - 1];
			const after = run[i];
			const start = rangesOf(after)[0];
			if (!start) continue;
			seams.push({ ...seamAt(start), beforeId: before.id, afterId: after.id });
		}
	}

	return seams;
}

/**
 * The seams a planned shape implies.
 *
 * Reads `planSeriesParts()` output. Only boundaries that abut are seams — a planned series of
 * Ephesians then Philippians has a run boundary between them, and nothing here should propose
 * operating on it.
 *
 * @param {Array<Object>} plannedParts - `planSeriesParts().parts`
 * @returns {Array<Object>}
 */
export function getDesiredSeams(plannedParts) {
	const ordered = sortParts(plannedParts);
	const seams = [];

	for (let i = 1; i < ordered.length; i += 1) {
		const previousRanges = rangesOf(ordered[i - 1]);
		const currentRanges = rangesOf(ordered[i]);
		const end = previousRanges[previousRanges.length - 1];
		const start = currentRanges[0];
		if (!end || !start) continue;
		if (!abuts(end, start)) continue;
		seams.push(seamAt(start));
	}

	return seams;
}

/**
 * Which current part contains a canonical position strictly inside it?
 *
 * "Strictly" matters: a position equal to a part's own start is that part's leading edge, not a
 * seam within it, and splitting there would produce an empty half.
 */
function findContainingPart(parts, seam) {
	for (const part of sortParts(parts)) {
		for (const range of rangesOf(part)) {
			if (range.testament !== seam.testament || range.book !== seam.book) continue;

			const afterStart =
				seam.fromChapter > range.fromChapter ||
				(seam.fromChapter === range.fromChapter && seam.fromVerse > range.fromVerse);
			const beforeEnd =
				seam.fromChapter < range.toChapter ||
				(seam.fromChapter === range.toChapter && seam.fromVerse <= range.toVerse);

			if (afterStart && beforeEnd) return part;
		}
	}
	return null;
}

/**
 * Do the current parts and the planned parts cover exactly the same verses?
 *
 * Compares the COALESCED extent of each side rather than range-by-range: the whole point of a seam
 * change is that ranges are redrawn, so a range-level comparison would report a difference for
 * every legitimate re-division. Recomposing first reduces both sides to "what text is in this
 * study", which is invariant under any division.
 *
 * @returns {string|null} A reason to refuse, or null when the extents match
 */
function assertSameExtent(parts, plannedParts) {
	const before = coalesceRanges(sortParts(parts).flatMap(rangesOf));
	const after = coalesceRanges(sortParts(plannedParts).flatMap(rangesOf));

	const describe = (ranges) =>
		ranges
			.map(
				(r) =>
					`${r.testament}/${r.book}/${r.fromChapter}:${r.fromVerse}-${r.toChapter}:${r.toVerse}`
			)
			.join(',');

	if (describe(before) === describe(after)) return null;

	return 'The passages of this study changed, so its parts cannot be re-divided in the same step. Extent changes are handled before division.';
}

/**
 * Diff the current seams against the desired ones.
 *
 * ## The output is declarative, and keyed by part id rather than index
 *
 * Each split carries the id of the part to divide and the chapters to divide it after, ascending.
 * The executor applies them in order, following the NEW part each time — `planPartSplit()` leaves
 * the first half on the original id and puts the second half on a new one, so the remaining seams
 * of a multi-way split live in the part most recently created. Emitting positions rather than
 * indices is what makes that replay deterministic.
 *
 * Each join carries the part that survives and the parts it absorbs, in order. Q28: the earlier
 * part in sequence keeps its title, and the absorbed titles are reported as discards by
 * `planPartJoin()` before they go.
 *
 * @param {Object} params
 * @param {Array<Object>} params.parts - Current parts, with `passages`
 * @param {Array<Object>} params.plannedParts - `planSeriesParts().parts`
 * @returns {{ splits: Array<{partId: string, afterChapters: number[]}>, joins: Array<{keepId: string, absorbIds: string[]}>, unchangedPartIds: string[], touchedPartIds: string[], refusals: string[], runShapePreserved: boolean }}
 */
export function diffSeams({ parts, plannedParts }) {
	// ⚠️ PRECONDITION: both sides must cover the same verses.
	//
	// This function answers "where are the boundaries?" and has no vocabulary for "these verses are
	// gone". Asked about a study whose EXTENT changed, it answered anyway — and the answer was
	// silently wrong. Shrinking Matthew 1–8 to Matthew 1–5 produced `join p5 ← [p6,p7,p8]`, but a
	// join is verse-conservative (`planPartJoin()` coalesces ranges), so chapters 6–8 would have
	// STAYED in the study while the operation reported success. Shrinking from the front was worse:
	// it kept the dropped chapters and discarded part 1's title as well.
	//
	// Extent is `seriesExtent.js`'s question, and it must be settled BEFORE this one is asked. So
	// this refuses rather than guessing. A refusal is recoverable; a confident wrong answer that
	// destroys a title and keeps verses the user removed is not.
	const extentError = assertSameExtent(parts, plannedParts);
	if (extentError) {
		return {
			splits: [],
			joins: [],
			unchangedPartIds: sortParts(parts).map((part) => part.id),
			touchedPartIds: [],
			refusals: [extentError],
			runShapePreserved: true
		};
	}

	const current = getCurrentSeams(parts);
	const desired = getDesiredSeams(plannedParts);

	const currentByKey = new Map(current.map((seam) => [seam.key, seam]));
	const desiredKeys = new Set(desired.map((seam) => seam.key));

	const refusals = [];
	const touched = new Set();

	// ── Seams to OPEN: desired, not currently present ────────────────────────
	//
	// Grouped by the part that must be divided, because a part may need dividing more than once and
	// the endpoint splits in two.
	const splitsByPart = new Map();

	for (const seam of desired) {
		if (currentByKey.has(seam.key)) continue;

		const host = findContainingPart(parts, seam);
		if (!host) {
			// The planned shape wants a boundary inside text this series does not contain. That is a
			// recomposition fault, not a user error, and it must be reported rather than silently
			// dropped — a dropped seam would make the saved shape quietly differ from the approved
			// preview, which is the one property §5 insists on.
			refusals.push(
				`No part of this series contains ${seam.bookName ?? seam.book} ${seam.fromChapter}:${seam.fromVerse}, so that division cannot be made.`
			);
			continue;
		}

		// The seam begins a chapter, so the division falls after the preceding one. Every seam
		// `planSeriesParts()` produces starts at a chapter boundary; a mid-chapter position would
		// have no `afterChapter` to name, so it is refused rather than rounded.
		if (seam.fromVerse !== 1) {
			refusals.push(
				`${seam.bookName ?? seam.book} ${seam.fromChapter}:${seam.fromVerse} is not a chapter boundary, so a part cannot be divided there.`
			);
			continue;
		}

		const list = splitsByPart.get(host.id) ?? [];
		list.push(seam.fromChapter - 1);
		splitsByPart.set(host.id, list);
		touched.add(host.id);
	}

	const splits = [...splitsByPart.entries()].map(([partId, afterChapters]) => ({
		partId,
		afterChapters: [...afterChapters].sort((a, b) => a - b)
	}));

	// ── Seams to CLOSE: currently present, not desired ───────────────────────
	//
	// Consecutive closures collapse into ONE join group: closing both seams of a three-part block
	// merges all three into the first, and emitting three pairwise joins against stale ids would
	// name a part that the previous join had already absorbed.
	const groups = [];
	const ordered = sortParts(parts);
	const indexById = new Map(ordered.map((part, index) => [part.id, index]));

	let group = null;
	for (const seam of current) {
		if (desiredKeys.has(seam.key)) {
			group = null;
			continue;
		}

		const continuesGroup =
			group !== null && indexById.get(seam.beforeId) === indexById.get(group.lastId);

		if (continuesGroup) {
			group.absorbIds.push(seam.afterId);
			group.lastId = seam.afterId;
		} else {
			group = { keepId: seam.beforeId, absorbIds: [seam.afterId], lastId: seam.afterId };
			groups.push(group);
		}

		touched.add(seam.beforeId);
		touched.add(seam.afterId);
	}

	// `lastId` is bookkeeping for the grouping loop above, not part of the contract.
	const joins = groups.map(({ keepId, absorbIds }) => ({ keepId, absorbIds }));

	// ── Run shape ────────────────────────────────────────────────────────────
	//
	// Asserted, not assumed. Splitting inside a run leaves two abutting parts and joining inside a
	// run leaves one; neither adds or removes a run boundary. If this is ever false, the operation
	// is about to change what can be reordered, which §4 requires a warning for.
	const currentRunCount = computeRuns(parts).length;
	const desiredRunCount = computeRuns(plannedParts).length;

	return {
		splits,
		joins,
		unchangedPartIds: ordered.filter((part) => !touched.has(part.id)).map((part) => part.id),
		touchedPartIds: [...touched],
		refusals,
		runShapePreserved: currentRunCount === desiredRunCount
	};
}

/**
 * The chapters-per-part a series is CURRENTLY divided at, or null when it has no single answer.
 *
 * Seeds the Manage Serialization stepper when editing an existing series, so it opens showing the
 * division the user actually has rather than a default that would silently propose re-dividing
 * everything the moment the modal appeared.
 *
 * ## Why this can return null, and must
 *
 * A division is only describable by one number when every part spans the same number of chapters.
 * A series that has been hand-shaped with Split Part or Join Parts may be 2, 2, 5, 1 — there is no
 * "chapters per part" there, and inventing one (an average, or the first part's span) would be a
 * confident claim about a shape the user built deliberately. The caller shows the parts as they are
 * instead, and treats any stepper change as a fresh division from that point.
 *
 * ⚠️ Deliberately NOT stored on `study_series`. Split Part and Join Parts change the division
 * without going through this form, so a persisted number would be stale the moment either ran —
 * `schema.ts` calls an authoritative value with no reliable writer worse than no column at all.
 * The parts are the truth; this reads them.
 *
 * @param {Array<Object>} parts
 * @returns {number|null} Chapters per part, or null when the division is ragged
 */
export function deriveChaptersPerPart(parts) {
	const ordered = sortParts(parts);
	if (ordered.length === 0) return null;

	let span = null;

	for (const part of ordered) {
		const ranges = rangesOf(part);
		// A multi-range part is the part-per-passage strategy, which chapters-per-part does not
		// describe at all.
		if (ranges.length !== 1) return null;

		const range = ranges[0];
		const chapters = range.toChapter - range.fromChapter + 1;
		if (chapters < 1) return null;

		if (span === null) {
			span = chapters;
			continue;
		}
		// The LAST part is allowed to be shorter: dividing 5 chapters at 2 per part leaves a
		// remainder of 1, which is a uniform division, not a ragged one. Any other mismatch is.
		if (chapters !== span) {
			const isLast = part === ordered[ordered.length - 1];
			if (!isLast || chapters > span) return null;
		}
	}

	return span;
}

/**
 * A fingerprint of the parts a plan was computed against.
 *
 * There is no optimistic concurrency anywhere in the series endpoints — no version column, no
 * `If-Match`. So a user who opens Manage Serialization, splits a part in another tab, and then
 * saves would commit seam operations computed against parts that no longer exist. The dry run
 * returns this; the commit sends it back and is refused if it no longer matches.
 *
 * ⚠️ Deliberately NOT `study_series.updatedAt`. Split Part updates part rows and does not reliably
 * bump the series row, so a timestamp would report "unchanged" for exactly the mutation most likely
 * to invalidate a plan — a check that passes because it failed to look, which COMPLIANCE.md §1.8
 * records as the worst kind.
 *
 * Recomputed from live rows at both ends, so it stores nothing and cannot go stale.
 *
 * @param {Array<Object>} parts
 * @returns {string}
 */
export function fingerprintParts(parts) {
	return sortParts(parts)
		.map((part) => {
			const ranges = rangesOf(part)
				.map(
					(r) =>
						`${r.testament}/${r.book}/${r.fromChapter}:${r.fromVerse}-${r.toChapter}:${r.toVerse}`
				)
				.join(',');
			return `${part.id}@${part.seriesOrder ?? 0}[${ranges}]`;
		})
		.join('|');
}
