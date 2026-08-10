/**
 * # Whole-series export and its compliance check (SERIES_PLAN §10, Q32/Q33, phase 3)
 *
 * §10's central worry, and the reason this exists:
 *
 * > A user selects the whole of John (879 verses, ESV) and chooses 21 parts, one chapter each. Every
 * > part is a single chapter, so every per-part check passes and **not one warning fires anywhere**.
 * > The series nonetheless covers the complete book of John, which ESV's display clause caps at 439.
 *
 * "The finer the parting, the more thoroughly per-part validation goes quiet." Splitting into a series
 * is therefore the most effective way to make compliance warnings disappear without changing what the
 * user ends up looking at — `COMPLIANCE.md` §1.6 one level up.
 *
 * ## Why this reuses `validateExportLimits()` rather than adding arithmetic
 *
 * That function already aggregates per book across passages using a **verse-identity `Set`**, which is
 * exactly what a series needs: parts may overlap (Q7 calls overlap normal), and counting Romans 3 twice
 * because two parts contain it would invent a breach. §10 says so directly — "it needs the series' full
 * passage set, not one part's" — so the whole job is collecting that set and handing it over.
 *
 * ⚠️ **Do not re-implement the aggregation here.** A second implementation is a second place for the
 * "whichever is less" rule and the short-book carve-out to drift, and `COMPLIANCE.md` §0 records that
 * transcribing limits while dropping their logic is this codebase's recurring error.
 *
 * ## Q32: this blocks where per-part export warns
 *
 * §10: "This is the most likely way to breach the ESV quotation terms, so it deserves `'block'` even
 * while per-part export stays `'warn'`." The asymmetry is deliberate and is the one place in the
 * feature where compliance stops a user rather than informing them — justified because the per-part
 * checks that would otherwise catch this have been silenced by the parting itself.
 *
 * @module seriesExport
 */

import { validateExportLimits } from './translationLimits.js';

/**
 * Every passage across every part of a series, in reading order.
 *
 * Ordered by `seriesOrder` then `displayOrder` — the user's arrangement (§4), never canonical order.
 * The compliance check is order-insensitive, but an export is not: the assembled document must read in
 * the order the series declares.
 *
 * @param {Array<{ seriesOrder?: number|null, passages?: Array<Object> }>} parts
 * @returns {Array<Object>}
 */
export function collectSeriesPassages(parts) {
	return (parts ?? [])
		.slice()
		.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0))
		.flatMap((part) =>
			(part.passages ?? []).slice().sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
		);
}

/**
 * The series-wide compliance position for an export (Q32).
 *
 * @param {Array<Object>} parts - Every part, each with `passages`
 * @param {string} translationId
 * @returns {{ compliant: boolean, blocked: boolean, warnings: string[], totalVerses: number, partCount: number, passageCount: number }}
 */
export function checkSeriesExport(parts, translationId) {
	const passages = collectSeriesPassages(parts);
	const result = validateExportLimits(passages, translationId);

	return {
		compliant: result.compliant,
		// ⚠️ Q32: blocked where a single study would merely warn. `validateExportLimits()` reports
		// `blocked` from the translation's own `enforcement` setting, which is 'warn' everywhere today —
		// so relying on it alone would let a whole-book series export silently, which is the exact
		// outcome §10 says this feature must not have. A breach here blocks regardless.
		blocked: !result.compliant,
		warnings: result.warnings,
		totalVerses: result.totalVerses,
		partCount: (parts ?? []).length,
		passageCount: passages.length
	};
}
