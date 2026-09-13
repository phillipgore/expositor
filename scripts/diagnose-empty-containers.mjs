/**
 * Report structural debris left in EXISTING studies: empty containers and drifted anchors.
 *
 * ## Why this exists
 *
 * A cross-part Join or Move Text re-parents a section or segment into the other part's container. If
 * the row it left behind was its parent's last child, that parent survives as a CHILDLESS container.
 * Nothing in `crossPartJoin.js` / `crossPartMove.js` removed it — the within-passage joins call
 * `reanchorAndPrune()` in `passageJoin.js`, but the cross-part paths only ever called
 * `reanchorPassages()`, which re-anchors and never prunes.
 *
 * The user-visible symptom is a GAP between columns: `analyze/+page.svelte` emits the `.column` div for
 * every row and only then guards `{#if column.sections.length > 0}`, so a sectionless column renders as
 * a fixed-width (27.8rem / 49.8rem wide) box containing nothing.
 *
 * ⚠️ **Read-only.** This writes nothing. It exists to prove the cause before `repair-empty-containers.mjs`
 * changes anything, and to confirm afterwards that the sweep left nothing behind.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/diagnose-empty-containers.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const sql = postgres(process.env.DATABASE_URL);

/**
 * Canonical word order. Anchors are zero-padded `BB-CCC-VVV-WWW` strings, so lexical comparison
 * normally agrees — but every other site in the codebase compares explicitly, and an anchor audit is
 * the last place to rest on "normally".
 */
function compareWordIds(a, b) {
	if (a === b) return 0;
	if (!a) return -1;
	if (!b) return 1;
	return a < b ? -1 : 1;
}

try {
	const columns = await sql`
		SELECT c.id, c.passage_id, c.starting_word_id, p.study_id, s.title AS study_name
		FROM passage_column c
		JOIN passage p ON p.id = c.passage_id
		JOIN study s ON s.id = p.study_id
	`;
	const sections = await sql`
		SELECT id, passage_column_id, starting_word_id FROM passage_section
	`;
	const segments = await sql`
		SELECT id, passage_section_id, starting_word_id FROM passage_segment
	`;

	// `repair-…` and the ordering pass below both need the repair message to name a study, and the
	// message is worth more than the extra column costs.

	const segmentsBySection = new Map();
	for (const seg of segments) {
		const list = segmentsBySection.get(seg.passage_section_id);
		if (list) list.push(seg);
		else segmentsBySection.set(seg.passage_section_id, [seg]);
	}

	const sectionsByColumn = new Map();
	for (const sec of sections) {
		const list = sectionsByColumn.get(sec.passage_column_id);
		if (list) list.push(sec);
		else sectionsByColumn.set(sec.passage_column_id, [sec]);
	}

	const emptySections = [];
	const emptyColumns = [];
	const driftedSections = [];
	const driftedColumns = [];

	for (const column of columns) {
		const own = sectionsByColumn.get(column.id) ?? [];
		const live = [];

		for (const section of own) {
			const segs = (segmentsBySection.get(section.id) ?? [])
				.slice()
				.sort((a, b) => compareWordIds(a.starting_word_id, b.starting_word_id));

			if (segs.length === 0) {
				emptySections.push({ ...section, study: column.study_name });
				continue;
			}
			live.push({ section, first: segs[0].starting_word_id });

			if (section.starting_word_id !== segs[0].starting_word_id) {
				driftedSections.push({
					id: section.id,
					study: column.study_name,
					anchor: section.starting_word_id,
					firstChild: segs[0].starting_word_id
				});
			}
		}

		if (live.length === 0) {
			emptyColumns.push({
				id: column.id,
				study: column.study_name,
				passageId: column.passage_id,
				anchor: column.starting_word_id
			});
			continue;
		}

		live.sort((a, b) => compareWordIds(a.first, b.first));
		if (column.starting_word_id !== live[0].first) {
			driftedColumns.push({
				id: column.id,
				study: column.study_name,
				anchor: column.starting_word_id,
				firstChild: live[0].first
			});
		}
	}

	// ── Ordering: the check whose absence let this script report a clean study ──
	//
	// ⚠️ Emptiness and anchor-correctness are NOT sufficient. A section can hold a segment, be anchored
	// honestly to it, and still sit under the wrong column — and every check above passes while the page
	// renders duplicate text.
	//
	// The renderer derives a segment's END from the next anchor in tree order
	// (`nextSegment → nextSection → nextColumn`, see `analyze/+page.svelte`). If a column's word range
	// interleaves another's, some segment's computed end lands BEFORE its own start. `extractSegmentText`
	// then scans forward for an end word that is behind it, never matches, and runs to the end of the
	// passage — re-emitting text already shown elsewhere. Because `data-word-id` is then duplicated in the
	// DOM, every `document.querySelector('.selectable-word[data-word-id=…]')` in the selection code
	// resolves to the WRONG copy, and word selection silently stops working.
	//
	// So this asks the renderer's own question rather than the database's: walk the tree exactly as the
	// page does, and assert every computed range moves strictly forwards.
	const byPassage = new Map();
	for (const column of columns) {
		const list = byPassage.get(column.passage_id);
		if (list) list.push(column);
		else byPassage.set(column.passage_id, [column]);
	}

	const backwardRanges = [];
	const interleavedColumns = [];

	for (const [passageId, passageColumns] of byPassage) {
		// Tree order, as `loadPassageTree()` builds it and the page consumes it.
		const tree = passageColumns
			.slice()
			.sort((a, b) => compareWordIds(a.starting_word_id, b.starting_word_id))
			.map((column) => ({
				column,
				sections: (sectionsByColumn.get(column.id) ?? [])
					.slice()
					.sort((a, b) => compareWordIds(a.starting_word_id, b.starting_word_id))
					.map((section) => ({
						section,
						segments: (segmentsBySection.get(section.id) ?? [])
							.slice()
							.sort((a, b) => compareWordIds(a.starting_word_id, b.starting_word_id))
					}))
					.filter((s) => s.segments.length > 0)
			}))
			.filter((c) => c.sections.length > 0);

		for (let ci = 0; ci < tree.length; ci++) {
			const col = tree[ci];

			// A column's run is its first segment through its last. Two runs must never overlap.
			const first = col.sections[0].segments[0].starting_word_id;
			const lastSection = col.sections[col.sections.length - 1];
			const last = lastSection.segments[lastSection.segments.length - 1].starting_word_id;
			const nextCol = tree[ci + 1];
			const nextFirst = nextCol?.sections[0]?.segments[0]?.starting_word_id ?? null;
			if (nextFirst && compareWordIds(last, nextFirst) >= 0) {
				interleavedColumns.push({
					id: col.column.id,
					study: col.column.study_name,
					anchor: `${first}…${last} overlaps next column starting ${nextFirst}`
				});
			}

			for (let si = 0; si < col.sections.length; si++) {
				const sec = col.sections[si];
				for (let gi = 0; gi < sec.segments.length; gi++) {
					const start = sec.segments[gi].starting_word_id;
					const end =
						sec.segments[gi + 1]?.starting_word_id ??
						col.sections[si + 1]?.segments[0]?.starting_word_id ??
						nextCol?.sections[0]?.segments[0]?.starting_word_id ??
						null;
					if (end && compareWordIds(start, end) >= 0) {
						backwardRanges.push({
							id: sec.segments[gi].id,
							study: col.column.study_name,
							anchor: `renders ${start} → ${end} (end precedes start; duplicates text to end of passage)`,
							passageId
						});
					}
				}
			}
		}
	}

	const report = (label, rows) => {
		console.log(`\n${label}: ${rows.length}`);
		for (const row of rows.slice(0, 25)) {
			const detail =
				row.firstChild != null
					? `anchor ${row.anchor} → should be ${row.firstChild}`
					: `anchor ${row.anchor ?? row.starting_word_id}`;
			console.log(`  • [${row.study}] ${row.id}  ${detail}`);
		}
		if (rows.length > 25) console.log(`  … and ${rows.length - 25} more`);
	};

	console.log('─── Structural debris across ALL studies ───');
	console.log(
		`Scanned ${columns.length} columns, ${sections.length} sections, ${segments.length} segments.`
	);

	report('Empty COLUMNS (render as a blank gap)', emptyColumns);
	report('Empty SECTIONS', emptySections);
	report('Columns whose anchor is not their first section-segment', driftedColumns);
	report('Sections whose anchor is not their first segment', driftedSections);
	report('Columns whose word range OVERLAPS the next column', interleavedColumns);
	report('Segments that render BACKWARDS (duplicate text, breaks word selection)', backwardRanges);

	const total =
		emptyColumns.length +
		emptySections.length +
		driftedColumns.length +
		driftedSections.length +
		interleavedColumns.length +
		backwardRanges.length;
	console.log(
		total === 0
			? '\n✅ Nothing to repair.'
			: `\n⚠️  ${total} row(s) need repair. Run scripts/repair-empty-containers.mjs.`
	);
} catch (error) {
	console.error('❌ Diagnosis failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
