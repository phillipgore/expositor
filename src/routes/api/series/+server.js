import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';
import { createDefaultPassageStructure, expandGroupAncestors } from '$lib/server/db/utils.js';
import { planSeriesParts } from '$lib/utils/seriesPlanning.js';
import bibleData from '$lib/data/bible.json';

/**
 * Resolve a book's display name, mirroring `new-study/+page.server.js`.
 *
 * `passage.bookName` is denormalised, so it has to be written at insert time — a part created
 * without it renders as a blank reference in the Finder.
 */
function getBookName(testamentId, bookId) {
	const testament = bibleData[0].testamentData.find((t) => t._id === testamentId);
	if (!testament) return bookId;
	const book = testament.bookData.find((b) => b._id === bookId);
	return book ? book.title : bookId;
}

/**
 * Create a series by parting an existing study ("Split into a series…", SERIES_PLAN §5).
 *
 * ## Why this converts rather than creates from scratch
 *
 * The source study already holds the passages, the translation and the group placement, so
 * parting it needs no range input and cannot disagree with what the user already chose. The
 * New Study flow's offer (§5, route 1) ends up here too, having created the study first.
 *
 * ## What this endpoint deliberately does NOT decide
 *
 * It never *decides* to make a series — §5 rule 1 ("a series is never imposed") means the
 * caller has already asked. The part shape comes from `planSeriesParts()`, the same function
 * that drives the preview, so what the user was shown is what gets built. Compliance warnings
 * are returned but never block: refusing creation would remove the choice §5 exists to protect
 * (COMPLIANCE §1.6 — compliance is the study owner's obligation).
 *
 * ## The source study becomes part 1, and is not duplicated
 *
 * Reusing the source row keeps its id stable, so existing links, `lastStudyView` and any
 * commentary survive the conversion. Only the *additional* parts are new studies. The
 * alternative — create N parts and delete the original — would throw away the user's work in
 * part 1 and break every URL pointing at it.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const {
			studyId,
			chaptersPerPart = 1,
			name,
			// "Balance by length" (§5 option (b), Q11). Opt-in, so the default remains fixed
			// chapters-per-part; the planner ignores these unless `balanceByLength` is true.
			balanceByLength = false,
			targetParts = 0
		} = body ?? {};

		if (!studyId || typeof studyId !== 'string') {
			return json({ error: 'studyId is required' }, { status: 400 });
		}

		// Scope by userId so another user's study is indistinguishable from a missing one.
		const sourceRows = await db
			.select()
			.from(study)
			.where(and(eq(study.id, studyId), eq(study.userId, session.user.id)))
			.limit(1);

		const source = sourceRows[0];
		if (!source) {
			return json({ error: 'Study not found' }, { status: 404 });
		}

		// A study that is already a part cannot be parted again in phase 1: that is Split Part,
		// which is explicitly phase 2 (§11). Without this guard the study would end up with two
		// series ids and appear in two places in the Finder.
		if (source.seriesId) {
			return json(
				{ error: 'This study is already part of a series. Splitting a part is not yet supported.' },
				{ status: 409 }
			);
		}

		const sourcePassages = await db
			.select()
			.from(passage)
			.where(eq(passage.studyId, studyId))
			.orderBy(passage.displayOrder);

		if (sourcePassages.length === 0) {
			return json({ error: 'This study has no passages to divide' }, { status: 400 });
		}

		// Plan with the SAME function the preview used, so the result cannot differ from what
		// the user approved.
		const plan = planSeriesParts({
			passages: sourcePassages.map((p) => ({
				testament: p.testament,
				book: p.bookId,
				fromChapter: p.fromChapter,
				fromVerse: p.fromVerse,
				toChapter: p.toChapter,
				toVerse: p.toVerse
			})),
			chaptersPerPart,
			translationId: source.translation,
			baseTitle: source.title,
			// Passed through so the server re-plans the shape the user approved. The modal previews with
			// the same function and the same options, which is what makes §5's "the preview a user
			// approves is the parting they get" true rather than merely intended.
			balanceByLength,
			targetParts
		});

		if (plan.strategy === 'ineligible') {
			return json(
				{ error: 'This study cannot be divided into a series. A series needs at least 2 chapters.' },
				{ status: 400 }
			);
		}

		// The minimum is 2 parts (§4): a one-part series is a study wearing a costume.
		if (plan.parts.length < 2) {
			return json(
				{ error: 'That setting produces only one part. Choose fewer chapters per part.' },
				{ status: 400 }
			);
		}

		const now = new Date();
		const seriesId = uuidv4();

		const result = await db.transaction(async (tx) => {
			await tx.insert(studySeries).values({
				id: seriesId,
				name: (typeof name === 'string' && name.trim() !== '' ? name.trim() : source.title).slice(0, 500),
				subtitle: source.subtitle ?? null,
				userId: session.user.id,
				// The series inherits the source study's group, so it occupies ONE slot in the
				// Finder where the study used to (§4) rather than scattering N parts into the group.
				groupId: source.groupId ?? null,
				// ⚠️ MUST be written. `study_series.translation` is authoritative for the
				// same-translation invariant (§4) and for Q26's ESV/NET branching. Leaving it to
				// the column default would mean the value that supposedly governs the parts was
				// never derived from them — an authoritative column with no writer, which trap 17
				// records as worse than no column at all.
				translation: source.translation,
				isCollapsed: false,
				displayOrder: 0,
				createdAt: now,
				updatedAt: now
			});

			const [firstPart, ...restParts] = plan.parts;

			// Part 1 IS the source study, rewritten in place.
			await tx
				.update(study)
				.set({
					seriesId,
					seriesOrder: firstPart.seriesOrder,
					title: firstPart.title,
					updatedAt: now
				})
				.where(eq(study.id, studyId));

			// Part 1's passages are narrowed to its own range. For passage-per-part this is a
			// no-op in effect; for chapters-per-part the source passage must shrink, or part 1
			// would still cover the whole book and every verse would appear twice in the series.
			await tx.delete(passage).where(eq(passage.studyId, studyId));
			await insertPartPassages(tx, studyId, firstPart, now);

			// Remaining parts are new studies.
			const createdIds = [studyId];
			for (const part of restParts) {
				const partId = uuidv4();
				await tx.insert(study).values({
					id: partId,
					title: part.title,
					subtitle: null,
					// Every part carries the series' translation. Written explicitly because
					// `study.translation` is NOT NULL with no default (trap 16): an INSERT that
					// omits it fails at runtime, not at build time.
					translation: source.translation,
					userId: session.user.id,
					// A part's home is its series, never a group directly: the series row is what
					// sits in the group, so a part with its own groupId would render both inside
					// the series and loose in the group.
					groupId: null,
					seriesId,
					seriesOrder: part.seriesOrder,
					createdAt: now,
					updatedAt: now
				});
				await insertPartPassages(tx, partId, part, now);
				createdIds.push(partId);
			}

			// Q18: remember part 1 as the resume target so the series title has somewhere to go
			// before the user has opened anything.
			await tx
				.update(studySeries)
				.set({ lastPartId: studyId })
				.where(eq(studySeries.id, seriesId));

			return createdIds;
		});

		// Expand the enclosing group so the new series row is visible rather than hidden inside
		// a collapsed folder — the same courtesy `new-study` extends.
		if (source.groupId) {
			await expandGroupAncestors(source.groupId, session.user.id);
		}

		return json({
			seriesId,
			partIds: result,
			partCount: plan.parts.length,
			strategy: plan.strategy,
			// Returned, not enforced: informational at creation, binding at export (Q33).
			warnings: plan.warnings
		});
	} catch (error) {
		console.error('Error creating series:', error);
		return json({ error: 'Failed to create series' }, { status: 500 });
	}
};

/**
 * Insert a part's passages and give each the default column/section/segment structure.
 *
 * Structure creation is not optional: a passage with no structure tree renders as an empty
 * Analyze view, and every existing creation path calls this for exactly that reason.
 */
async function insertPartPassages(tx, partStudyId, part, now) {
	const rows = part.passages.map((range, index) => ({
		id: uuidv4(),
		studyId: partStudyId,
		testament: range.testament,
		bookId: range.book,
		bookName: getBookName(range.testament, range.book),
		fromChapter: range.fromChapter,
		toChapter: range.toChapter,
		fromVerse: range.fromVerse,
		toVerse: range.toVerse,
		displayOrder: index,
		createdAt: now
	}));

	await tx.insert(passage).values(rows);

	for (const row of rows) {
		await createDefaultPassageStructure(
			row.id,
			row.testament,
			row.bookId,
			row.fromChapter,
			row.fromVerse,
			tx
		);
	}
}
