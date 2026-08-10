/**
 * # Adding a standalone study to an existing series (SERIES_PLAN §4 invariants, Q17, phase 3)
 *
 * Q17: "Drag a standalone study into a series? _Rec: phase 3 — needs invariant checks._" This is those
 * checks. §4's invariant table is the specification, and it is deliberately uneven about what blocks:
 *
 * | Invariant                   | Rule                        |
 * | --------------------------- | --------------------------- |
 * | Same translation across parts | **Enforce** — this refuses |
 * | Same book across parts        | Allow multi-book            |
 * | Contiguous, non-overlapping   | **Warn, don't block**       |
 * | Max parts                     | No hard cap; soft-warn ~30, confirm at 150 |
 *
 * ## Why translation blocks and contiguity does not
 *
 * §4: "Mixed translations would break the export attribution story. `studySeries.translation` is
 * authoritative." An exported series carries one attribution, so a part in another translation makes
 * that attribution false — a compliance statement about text the document does not contain. There is no
 * warning that repairs that, so it is the one refusal here.
 *
 * Contiguity is different: §4 calls a gap and an overlap both legal, and Q7 says a series need not be
 * contiguous at all. Prison Epistles is four books with three permanently ineligible boundaries and is
 * the motivating example, not an edge case. So a non-adjacent addition is reported and allowed — the
 * cost being that its boundaries are dead for the five structural commands (§8), which is worth saying
 * out loud rather than discovering later.
 *
 * @module seriesMembership
 */

import { classifyBoundary } from './seriesRuns.js';

/**
 * Assess adding `study` to `series` at the end of its parts.
 *
 * Appends rather than inserting: §4 forbids re-deriving `seriesOrder` from canonical order, so placing
 * a new part by where its verses fall would impose an arrangement the user did not ask for. The end is
 * the only position that assumes nothing; the user can then reorder runs (phase 3 item 3) if they want
 * it elsewhere.
 *
 * @param {Object} params
 * @param {Object} params.study - The standalone study, with `passages` and `translation`
 * @param {Object} params.series - The target series, with `translation` if known
 * @param {Array<Object>} params.parts - Existing parts, each with `passages`
 * @returns {{ ok: boolean, error: string|null, warnings: string[], seriesOrder: number }}
 */
export function planAddToSeries({ study, series, parts }) {
	const ordered = [...(parts ?? [])].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));

	const fail = (error) => ({ ok: false, error, warnings: [], seriesOrder: 0 });

	if (!study) return fail('That study could not be found.');
	if (study.seriesId) {
		// A part already belongs somewhere; moving it between series is a different operation with its
		// own consequences for the series it leaves (§4: down to one part, that series dissolves).
		return fail('That study is already part of a series.');
	}

	// ── The one invariant that refuses (§4) ───────────────────────────────────
	//
	// `studySeries.translation` is authoritative where present; otherwise the existing parts define it,
	// since every part of a series already shares one by construction.
	const seriesTranslation = series?.translation ?? ordered[0]?.translation ?? null;
	if (seriesTranslation && study.translation && study.translation !== seriesTranslation) {
		return fail(
			`This series uses ${String(seriesTranslation).toUpperCase()} and that study uses ${String(
				study.translation
			).toUpperCase()}. A series must use one translation, so its parts can carry a single attribution.`
		);
	}

	const warnings = [];

	// ── Everything else reports rather than refuses ───────────────────────────
	const last = ordered[ordered.length - 1];
	if (last) {
		const kind = classifyBoundary(last, study);
		if (kind !== 'contiguous') {
			// §8's own vocabulary, so the message matches what the disabled commands will later say.
			const reason =
				kind === 'different-books'
					? 'it starts a different book'
					: kind === 'overlap'
						? 'it overlaps the previous part'
						: 'there is a gap in Scripture before it';
			warnings.push(
				`This part will not be adjacent to the one before it — ${reason}. That is allowed, but structural commands will not work across that boundary.`
			);
		}
	}

	// Q10 / §4's max-parts row: soft-warn above ~30. No hard cap, because §5 treats Psalms at one
	// chapter per part — 150 parts — as a legitimate choice.
	const newCount = ordered.length + 1;
	if (newCount > 30) {
		warnings.push(`This series will have ${newCount} parts, which is a lot to navigate.`);
	}

	return {
		ok: true,
		error: null,
		warnings,
		// Appended after the current highest, never renumbered (§4).
		seriesOrder: ordered.length > 0 ? (last?.seriesOrder ?? ordered.length - 1) + 1 : 0
	};
}
