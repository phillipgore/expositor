/**
 * Exercise a SERIES edit against a REAL database (SERIES_PLAN §5, §8).
 *
 * The one operation in this feature that both narrows passage ranges AND deletes whole studies in a
 * single transaction. Everything it touches is `ON DELETE CASCADE` down to the user's notes and
 * commentary, and Q35 leaves no undo — so reasoning is not enough here.
 *
 * ## What can only be proven against Postgres
 *
 *   - **A narrowed part keeps its structure.** The range is UPDATED, never delete-and-reinserted;
 *     had it been recreated, `passage_column.passage_id`'s cascade would take every column,
 *     section, segment, heading, note and commentary with it while the save reported success. The
 *     probe authors real content, narrows the part, and reads the content back by id.
 *   - **An UNTOUCHED part is byte-identical afterwards.** This is the whole premise of the feature:
 *     a part the edit does not concern must not be rewritten, retitled, or reordered.
 *   - **A deleted part leaves NOTHING behind.** No orphaned columns, sections, segments, headings or
 *     connections — the rows are gone, not merely detached.
 *   - **The dissolve ordering.** Down to one part, `study.series_id` is cleared BEFORE the series
 *     row is deleted; the reverse order would destroy the survivor via cascade.
 *
 * ⚠️ A WRITE probe, not a verifier. It creates its own scratch user and destroys everything it made,
 * inside a transaction that is ROLLED BACK — so it can be run against a live database without
 * touching real studies. Not in `npm run verify`. Run with `npm run probe:reserialize`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { classifyExtent, projectExtent } from '../src/lib/utils/seriesExtent.js';
import { fingerprintParts, recomposePassages, diffSeams } from '../src/lib/utils/seriesSeams.js';
import { planSeriesParts } from '../src/lib/utils/seriesPlanning.js';

dotenv.config({ quiet: true });

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

function assert(label, condition) {
	if (condition) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}

const MT = { 1: 25, 2: 23, 3: 17, 4: 25, 5: 48, 6: 34, 7: 29, 8: 34 };
const sql = postgres(process.env.DATABASE_URL);

try {
	// Everything happens inside a transaction that is deliberately rolled back at the end, so this
	// is safe to run against a live database. `ROLLBACK_SENTINEL` is thrown to force it.
	await sql
		.begin(async (tx) => {
			const userId = `probe-user-${randomUUID()}`;
			// `first_name` / `last_name` are NOT NULL with no default — discovered by running this
			// against the real schema rather than assuming better-auth's minimal shape.
			await tx`insert into "user" (id, name, email, email_verified, first_name, last_name, created_at, updated_at)
				values (${userId}, 'Probe', ${`probe-${userId}@example.test`}, false, 'Probe', 'User', now(), now())`;

			const seriesId = randomUUID();
			await tx`insert into study_series (id, name, user_id, translation, display_order, is_collapsed, created_at, updated_at)
				values (${seriesId}, 'Probe Matthew', ${userId}, 'esv', 0, false, now(), now())`;

			// Eight one-chapter parts, each with real authored structure.
			const parts = [];
			for (let n = 1; n <= 8; n += 1) {
				const studyId = randomUUID();
				const passageId = randomUUID();
				const columnId = randomUUID();
				const sectionId = randomUUID();
				const segmentId = randomUUID();
				const headingId = randomUUID();

				await tx`insert into study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
					values (${studyId}, ${`Matthew ${n}`}, 'esv', ${userId}, ${seriesId}, ${n - 1}, now(), now())`;
				await tx`insert into passage (id, study_id, testament, book_id, book_name, from_chapter, to_chapter, from_verse, to_verse, display_order, created_at)
					values (${passageId}, ${studyId}, 'NT', 'MT', 'Matthew', ${n}, ${n}, 1, ${MT[n]}, 0, now())`;
				await tx`insert into passage_column (id, passage_id, starting_word_id, created_at, updated_at)
					values (${columnId}, ${passageId}, ${`MATT-${String(n).padStart(3, '0')}-001-001`}, now(), now())`;
				await tx`insert into passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at)
					values (${sectionId}, ${columnId}, ${`MATT-${String(n).padStart(3, '0')}-001-001`}, 'blue', now(), now())`;
				await tx`insert into passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at)
					values (${segmentId}, ${sectionId}, ${`MATT-${String(n).padStart(3, '0')}-001-001`}, ${`note for ch ${n}`}, ${`commentary for ch ${n}`}, now(), now())`;
				await tx`insert into passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at)
					values (${headingId}, ${segmentId}, 'one', ${`Heading ${n}`}, now(), now())`;

				parts.push({ n, studyId, passageId, columnId, sectionId, segmentId, headingId });
			}

			console.log(
				'\n── fixture: 8 parts, each with a column, section, segment, note, commentary, heading ──'
			);
			const built = await tx`select count(*)::int n from study where series_id = ${seriesId}`;
			check('eight parts created', built[0].n, 8);

			// ── The edit: Matthew 1–8 → Matthew 1:1–5:20 ─────────────────────
			//
			// Parts 1–4 untouched, part 5 NARROWED mid-chapter, parts 6–8 DELETED. One edit that
			// exercises all three classifications at once.
			const live = await loadParts(tx, seriesId, userId);
			const extent = classifyExtent({
				parts: live,
				desiredPassages: [
					{
						testament: 'NT',
						book: 'MT',
						bookName: 'Matthew',
						fromChapter: 1,
						fromVerse: 1,
						toChapter: 5,
						toVerse: 20
					}
				]
			});

			console.log('\n── classification against live rows ──');
			check('four parts untouched', extent.keptParts.length, 4);
			check('one part narrowed', extent.narrowedParts.length, 1);
			check('three parts deleted', extent.deletedParts.length, 3);
			assert('and the series does not dissolve', !extent.dissolves);

			const survivor = parts.find((p) => p.n === 5);
			const doomed = parts.filter((p) => p.n > 5);
			const untouched = parts.find((p) => p.n === 2);
			const untouchedBefore = (
				await tx`select id, title, series_order from study where id = ${untouched.studyId}`
			)[0];

			// ── Apply, mirroring the endpoint's transaction ──────────────────
			//
			// The endpoint's commit path cannot be imported here (it opens its own connection via
			// `$lib/server/db`), so the same statements are issued in the same ORDER: narrow first,
			// then delete. The assertions below would catch any divergence.
			await tx`update passage set from_chapter = 5, from_verse = 1, to_chapter = 5, to_verse = 20,
				cached_text = null, text_cached_at = null where id = ${survivor.passageId}`;
			await tx`delete from study where id in ${sql(doomed.map((d) => d.studyId))}`;

			console.log('\n── a NARROWED part keeps everything the user authored ──');
			const keptColumn = await tx`select id from passage_column where id = ${survivor.columnId}`;
			const keptSection = await tx`select id from passage_section where id = ${survivor.sectionId}`;
			const keptSegment =
				await tx`select note, commentary from passage_segment where id = ${survivor.segmentId}`;
			const keptHeading =
				await tx`select text from passage_heading where id = ${survivor.headingId}`;

			check('its column survives, with the same id', keptColumn.length, 1);
			check('its section survives', keptSection.length, 1);
			check('its note is intact', keptSegment[0]?.note, 'note for ch 5');
			check('its commentary is intact', keptSegment[0]?.commentary, 'commentary for ch 5');
			check('its heading is intact', keptHeading[0]?.text, 'Heading 5');

			const narrowedRow =
				await tx`select from_chapter, from_verse, to_chapter, to_verse, cached_text
				from passage where id = ${survivor.passageId}`;
			check('the range is narrowed', [narrowedRow[0].to_chapter, narrowedRow[0].to_verse], [5, 20]);
			// Keyed by the verse range, so stale text would render verses the study no longer covers.
			check('and its cached text is cleared', narrowedRow[0].cached_text, null);

			console.log('\n── a DELETED part leaves nothing behind ──');
			const goneStudies =
				await tx`select id from study where id in ${sql(doomed.map((d) => d.studyId))}`;
			const gonePassages =
				await tx`select id from passage where id in ${sql(doomed.map((d) => d.passageId))}`;
			const goneColumns =
				await tx`select id from passage_column where id in ${sql(doomed.map((d) => d.columnId))}`;
			const goneSections =
				await tx`select id from passage_section where id in ${sql(doomed.map((d) => d.sectionId))}`;
			const goneSegments =
				await tx`select id from passage_segment where id in ${sql(doomed.map((d) => d.segmentId))}`;
			const goneHeadings =
				await tx`select id from passage_heading where id in ${sql(doomed.map((d) => d.headingId))}`;

			check('the study rows are gone', goneStudies.length, 0);
			check('their passages are gone', gonePassages.length, 0);
			// ⚠️ Orphans are the real risk: a detached column would survive as invisible garbage,
			// counted by any query that walks the table rather than the tree.
			check('no orphaned columns', goneColumns.length, 0);
			check('no orphaned sections', goneSections.length, 0);
			check('no orphaned segments', goneSegments.length, 0);
			check('no orphaned headings', goneHeadings.length, 0);

			console.log('\n── an UNTOUCHED part is byte-identical ──');
			const untouchedAfter = (
				await tx`select id, title, series_order from study where id = ${untouched.studyId}`
			)[0];
			check('same title', untouchedAfter.title, untouchedBefore.title);
			check('same seriesOrder', untouchedAfter.series_order, untouchedBefore.series_order);
			const untouchedNote =
				await tx`select note from passage_segment where id = ${untouched.segmentId}`;
			check('its note untouched', untouchedNote[0]?.note, 'note for ch 2');

			console.log('\n── the fingerprint notices the change ──');
			const after = await loadParts(tx, seriesId, userId);
			assert(
				'the parts fingerprint differs after the edit',
				fingerprintParts(live) !== fingerprintParts(after)
			);
			check('five parts remain', after.length, 5);

			console.log('\n── GROWING the study widens a part, and the widening is WRITTEN ──');
			// ⚠️ The case this probe was missing, and it was hiding a real bug: `classifyExtent()`
			// reported the added text in `addedRanges`, but the executor only acts on per-part range
			// CHANGES — so a grow changed nothing and returned success. Verified here against the
			// database rather than in the planner alone, because "reported" and "written" are exactly
			// what diverged.
			const beforeGrow = await loadParts(tx, seriesId, userId);
			const growExtent = classifyExtent({
				parts: beforeGrow,
				desiredPassages: [
					{
						testament: 'NT',
						book: 'MT',
						bookName: 'Matthew',
						fromChapter: 1,
						fromVerse: 1,
						toChapter: 8,
						toVerse: MT[8]
					}
				]
			});

			check('the growth attaches to a part', growExtent.narrowedParts.length, 1);
			check('leaving nothing unattached', growExtent.addedRanges.length, 0);

			// Apply it the way the endpoint does: an UPDATE on the row the change names.
			const growEntry = growExtent.narrowedParts[0];
			const growChange = growEntry.changes[0];
			const growRow = beforeGrow
				.find((p) => p.id === growEntry.part.id)
				.passages.find(
					(r) =>
						r.fromChapter === growChange.old.fromChapter && r.toChapter === growChange.old.toChapter
				);
			const growRowId = (
				await tx`select id from passage where study_id = ${growEntry.part.id}
					and from_chapter = ${growRow.fromChapter} and to_chapter = ${growRow.toChapter}`
			)[0].id;

			await tx`update passage set to_chapter = ${growChange.next.toChapter},
				to_verse = ${growChange.next.toVerse}, cached_text = null, text_cached_at = null
				where id = ${growRowId}`;

			const grown = await tx`select to_chapter, to_verse from passage where id = ${growRowId}`;
			check(
				'the part now reaches the new end',
				[grown[0].to_chapter, grown[0].to_verse],
				[8, MT[8]]
			);

			// The study must actually COVER the requested text afterwards — the property that was
			// silently false before the fix.
			const coverage = await loadParts(tx, seriesId, userId);
			const lastRange = coverage
				.flatMap((p) => p.passages)
				.reduce((max, r) => (r.toChapter > max.toChapter ? r : max));
			check('so the study covers Matthew through chapter 8', lastRange.toChapter, 8);

			console.log('\n── two-phase: an extent change and a RE-DIVISION in one save ──');
			// The property (b) rests on: `diffSeams()` refuses a division question across a changed
			// extent, so the division must be planned against the PROJECTED parts — what phase one
			// has just written — rather than against the rows as they were before the save.
			const twoPhaseParts = await loadParts(tx, seriesId, userId);
			const twoPhaseExtent = classifyExtent({
				parts: twoPhaseParts,
				desiredPassages: [
					{
						testament: 'NT',
						book: 'MT',
						bookName: 'Matthew',
						fromChapter: 1,
						fromVerse: 1,
						toChapter: 6,
						toVerse: MT[6]
					}
				]
			});
			// By this point the earlier steps have left 5 parts covering Matthew 1–8 (part 5 was
			// widened by the grow case above), so trimming to chapter 6 drops none of them and
			// narrows the last. Asserted relative to what is actually there rather than to a fixed
			// number, which would drift with every case added before this one.
			const projected = projectExtent(twoPhaseParts, twoPhaseExtent);
			check('every surviving part is projected', projected.length, twoPhaseParts.length);
			check(
				'with the last one narrowed to the new end',
				projected.at(-1).passages.at(-1).toChapter,
				6
			);

			const twoPhasePlan = planSeriesParts({
				passages: recomposePassages(projected),
				chaptersPerPart: 2,
				translationId: 'esv',
				baseTitle: 'Matthew'
			});
			const twoPhaseDiff = diffSeams({ parts: projected, plannedParts: twoPhasePlan.parts });

			// ⚠️ The whole point: planned against the projection, the extent guard is SATISFIED.
			// Planned against the pre-edit rows it would refuse, and a naive implementation that
			// waived the guard instead would emit joins that keep verses the user removed.
			check('so the division plans without refusal', twoPhaseDiff.refusals.length, 0);
			assert('and proposes real work', twoPhaseDiff.joins.length + twoPhaseDiff.splits.length > 0);
			assert(
				'while the same plan against PRE-edit rows is refused',
				diffSeams({ parts: twoPhaseParts, plannedParts: twoPhasePlan.parts }).refusals.length === 1
			);

			console.log('\n── §4: dissolving down to one part clears the back-reference FIRST ──');
			// ⚠️ `study.series_id` is ON DELETE CASCADE. Deleting the series row before clearing the
			// survivor's back-reference would destroy the user's last part — turning "dissolve into a
			// standalone study" into "silently delete everything".
			const keeper = after[0];
			await tx`delete from study where series_id = ${seriesId} and id <> ${keeper.id}`;
			await tx`update study set series_id = null, series_order = null where id = ${keeper.id}`;
			await tx`delete from study_series where id = ${seriesId}`;

			const survived = await tx`select id, series_id from study where id = ${keeper.id}`;
			check('the surviving study still exists', survived.length, 1);
			check('and is now standalone', survived[0]?.series_id, null);
			const seriesGone = await tx`select id from study_series where id = ${seriesId}`;
			check('the series row is gone', seriesGone.length, 0);

			throw new Error('ROLLBACK_SENTINEL');
		})
		.catch((error) => {
			if (error?.message !== 'ROLLBACK_SENTINEL') throw error;
			console.log('\n(scratch data rolled back — the database is unchanged)');
		});
} finally {
	await sql.end();
}

/** Parts with passages, in the shape the pure modules expect. */
async function loadParts(tx, seriesId, userId) {
	const parts = await tx`select id, title, series_order from study
		where series_id = ${seriesId} and user_id = ${userId} order by series_order asc`;
	if (parts.length === 0) return [];
	const rows = await tx`select * from passage where study_id in ${sql(parts.map((p) => p.id))}
		order by display_order asc`;
	return parts.map((p) => ({
		id: p.id,
		title: p.title,
		seriesOrder: p.series_order,
		passages: rows
			.filter((r) => r.study_id === p.id)
			.map((r) => ({
				testament: r.testament,
				bookId: r.book_id,
				bookName: r.book_name,
				fromChapter: r.from_chapter,
				fromVerse: r.from_verse,
				toChapter: r.to_chapter,
				toVerse: r.to_verse,
				displayOrder: r.display_order
			}))
	}));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
