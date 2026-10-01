/**
 * Pure rules behind the series parting controls (`SeriesPartingControls.svelte`).
 *
 * ## Why this file exists
 *
 * Manage Serialization and Split into a Series each carried their own copy of these rules, and the
 * copies drifted: one modal's per-passage row reported the chapters shape while in balance mode, the
 * other had no per-passage rows at all. Held here, the rules are written once and can be checked by
 * `scripts/verify-parting-draft.mjs` in plain Node — a Svelte component cannot be.
 *
 * Nothing here decides what a translation allows. That is `allowedDivisionBounds()`; these
 * functions only turn its answer into control state.
 */

import { getBook } from './bibleData.js';
import { planSeriesParts } from './seriesPlanning.js';

/**
 * Every passage starts divided at one chapter per part, in both modals. The finest division is
 * the shape the part list is most useful for confirming, and each stepper press from there is a
 * coarsening the user can see. `0` ("Whole") stays reachable where the translation allows it.
 */
export const DEFAULT_CHAPTERS_PER_PASSAGE = 1;

/**
 * One passage in the shape the planner and the bounds read. Split hands over saved rows, which
 * carry `bookId`; the form hands over selector rows, which carry `book`.
 * @param {Object} p
 */
export function normalizePassage(p) {
	return {
		id: p.id,
		testament: p.testament,
		book: p.book ?? p.bookId,
		fromChapter: p.fromChapter,
		fromVerse: p.fromVerse,
		toChapter: p.toChapter,
		toVerse: p.toVerse
	};
}

/** A passage's human reference, e.g. "Revelation 1–22". */
export function passageLabel(p) {
	const book = getBook(p.testament, p.book)?.title || p.book || '';
	return p.fromChapter === p.toChapter
		? `${book} ${p.fromChapter}`
		: `${book} ${p.fromChapter}–${p.toChapter}`;
}

/**
 * Bounds for the SINGLE-passage stepper. Half the span is the most chapters per part that still
 * yields the 2 parts a series needs (§4); the translation can lower it. The balance floor is 2,
 * raised to the translation's, and held inside the span so the control always has somewhere to be.
 *
 * @param {number} totalChapters
 * @param {{ maxChaptersPerPart: number, minBalanceParts: number } | null} limits
 */
export function singleBounds(totalChapters, limits) {
	const maxChaptersPerPart = Math.max(
		1,
		Math.min(
			totalChapters > 1 ? Math.floor(totalChapters / 2) : 1,
			limits?.maxChaptersPerPart ?? Infinity
		)
	);
	const minBalanceParts = Math.min(
		Math.max(2, limits?.minBalanceParts ?? 2),
		Math.max(2, totalChapters)
	);
	const maxBalanceParts = Math.max(minBalanceParts, totalChapters);
	return { maxChaptersPerPart, minBalanceParts, maxBalanceParts };
}

/**
 * Parse a stepper's raw text and clamp it into [min, max]. Unparseable text (mid-edit) falls back
 * to `fallback`, so a half-typed field cannot reach the planner as NaN.
 */
export function clampInt(raw, min, max, fallback = min) {
	const n = parseInt(raw, 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(n, max));
}

/**
 * The state of one per-passage row: its bounds, its clamped values, and what it contributes.
 *
 * @param {Object} p - A normalized passage
 * @param {Object|null} limits - `allowedDivisionBounds(p)`, or null while closed
 * @param {{ chaptersRaw?: string, balanceRaw?: string, balanceByLength: boolean,
 *           translationId: string, title: string }} opts
 */
export function derivePassageRow(p, limits, opts) {
	const { chaptersRaw, balanceRaw, balanceByLength, translationId, title } = opts;
	const chapterSpan = (p.toChapter ?? p.fromChapter) - (p.fromChapter ?? 0) + 1;

	// One short of the span, and no more than the translation lets one part hold. NOT
	// `floor(span / 2)`: the 2-part minimum belongs to the SERIES, and other passages add parts.
	const spanCeiling = Math.max(0, chapterSpan - 1);
	const maxPer =
		spanCeiling === 0
			? 0
			: Math.max(1, Math.min(spanCeiling, limits?.maxChaptersPerPart ?? spanCeiling));
	const wholeAllowed = limits?.wholeAllowed ?? true;

	const parsed =
		chaptersRaw === undefined ? DEFAULT_CHAPTERS_PER_PASSAGE : parseInt(chaptersRaw, 10);
	const requested = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxPer) : 0;
	// A "Whole" the translation refuses (one switched since the draft was set) reads as the
	// finest division, the one setting every book allows.
	const chapters = requested === 0 && maxPer > 0 && !wholeAllowed ? 1 : requested;

	// Seeded from the chapters shape, so switching mode keeps roughly the parts already on screen.
	const chapterParts = chapters > 0 ? Math.ceil(chapterSpan / chapters) : 1;
	const minBalance = Math.max(1, Math.min(chapterSpan, limits?.minBalanceParts ?? 1));
	const parsedBalance = parseInt(balanceRaw, 10);
	const balanceTarget = Number.isFinite(parsedBalance)
		? Math.max(minBalance, Math.min(parsedBalance, chapterSpan))
		: Math.max(minBalance, Math.min(chapterParts, chapterSpan));

	// ⚠️ One passage plans under the `chapters-per-part` strategy, which ignores
	// `balancePerPassage`, so the balance goes in as `balanceByLength` + `targetParts`. A target of
	// 1 is the whole passage, which the balance path (`targetParts > 1`) does not take.
	const ownPlan = planSeriesParts({
		passages: [p],
		chaptersPerPart: balanceByLength && balanceTarget === 1 ? chapterSpan : Math.max(1, chapters),
		chaptersPerPassage: [chapters],
		balanceByLength: balanceByLength && balanceTarget > 1,
		targetParts: balanceByLength ? balanceTarget : 0,
		translationId,
		baseTitle: title
	});
	const ownParts = ownPlan?.parts ?? [];

	return {
		id: p.id,
		label: passageLabel(p),
		canDivide: chapterSpan > 1,
		chapterSpan,
		chapters,
		maxPer,
		wholeAllowed,
		minBalance,
		balanceTarget,
		// The ACTUAL count, read back from the plan, so the pill agrees with the part list.
		partCount: ownParts.length || (balanceByLength ? balanceTarget : chapterParts),
		averageVerses: ownParts.length > 0 ? Math.round(ownPlan.totalVerses / ownParts.length) : 0
	};
}

/** Can a row's minus / plus move, in the current mode? */
export function rowCanStep(entry, balanceByLength) {
	if (balanceByLength) {
		return {
			down: entry.balanceTarget > entry.minBalance,
			up: entry.balanceTarget < entry.chapterSpan
		};
	}
	return {
		down: entry.chapters > 1 || (entry.chapters === 1 && entry.wholeAllowed),
		up: entry.chapters === 0 || entry.chapters < entry.maxPer
	};
}

/** A divisible row the translation leaves with exactly one setting: its field is disabled. */
export function isRowLocked(entry, balanceByLength) {
	if (!entry.canDivide) return false;
	const { down, up } = rowCanStep(entry, balanceByLength);
	return !down && !up;
}

/** The next value for a row after a press, or null when the press does nothing. */
export function stepRow(entry, balanceByLength, direction) {
	const { down, up } = rowCanStep(entry, balanceByLength);
	if (direction < 0 && !down) return null;
	if (direction > 0 && !up) return null;
	if (balanceByLength) return entry.balanceTarget + direction;
	// Below 1 is "Whole" (0); above "Whole" is 1.
	if (direction < 0) return entry.chapters <= 1 ? 0 : entry.chapters - 1;
	return entry.chapters === 0 ? 1 : entry.chapters + 1;
}

/**
 * A value typed into a row's field, clamped to the bounds the buttons obey. "Whole" (or 0) is
 * undivided where allowed. Returns null for anything unparseable, so the field reverts.
 */
export function clampTypedRow(entry, balanceByLength, raw) {
	const text = String(raw ?? '').trim();
	if (balanceByLength) {
		const n = parseInt(text, 10);
		if (!Number.isFinite(n)) return null;
		return Math.max(entry.minBalance, Math.min(n, entry.chapterSpan));
	}
	const n = /^whole$/i.test(text) ? 0 : parseInt(text, 10);
	if (!Number.isFinite(n)) return null;
	if (n <= 0) return entry.wholeAllowed ? 0 : 1;
	return Math.min(n, entry.maxPer);
}

/** The blue note naming why locked rows cannot move, or '' when none are locked. */
export function lockedRowsMessage(entries, balanceByLength, translationId) {
	const locked = entries.filter((entry) => isRowLocked(entry, balanceByLength));
	if (locked.length === 0) return '';
	const clauses = locked
		.map((entry) =>
			balanceByLength
				? `${entry.label} can only be balanced into ${entry.balanceTarget} parts`
				: `${entry.label} can only be divided at one chapter per part`
		)
		.join('; ');
	return `${clauses} in ${String(translationId).toUpperCase()}. A larger part would show more of the book than the translation allows on one page.`;
}

