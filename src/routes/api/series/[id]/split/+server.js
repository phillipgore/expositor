import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc } from 'drizzle-orm';
import { planPartSplit, getSplitPoints, renumberForInsert } from '$lib/utils/seriesRestructure.js';
import {
	splitPassageStructure,
	inspectPassageSplit,
	deleteConnections
} from '$lib/server/db/seriesStructure.js';
import { validateStudyDisplayLimits } from '$lib/utils/translationLimits.js';
import { rangeFirstWordId } from '$lib/server/db/passageReconcile.js';
import { formatPassageReference } from '$lib/utils/passageFormatting.js';

/**
 * First word id of a planner range.
 *
 * ⚠️ `rangeFirstWordId()` reads `bookId`; the planner's ranges carry `book`. This is the exact
 * two-spellings trap `seriesRestructure.js` normalises for and `validateStudyDisplayLimits()`
 * records as having "silently passed" when only one was read. Converted explicitly here so the
 * mismatch cannot become a wrong word id — which would place the structure boundary in the wrong
 * verse and move the wrong segments, with no error anywhere.
 */
function boundaryWordIdOf(range) {
	if (!range) return null;
	const bookId = range.bookId ?? range.book;
	if (!bookId || !range.testament) return null;
	return rangeFirstWordId({
		testament: range.testament,
		bookId,
		fromChapter: range.fromChapter,
		fromVerse: range.fromVerse
	});
}

/**
 * A human reference for a set of ranges, used for the new part's title and the confirm copy.
 *
 * Spans first-range-start to last-range-end, so a multi-passage half reads "Romans 3:1–5:21"
 * rather than only naming its first passage.
 */
function referenceFor(ranges) {
	const first = ranges?.[0];
	if (!first) return null;
	const last = ranges[ranges.length - 1];
	return formatPassageReference({
		bookName: first.bookName ?? first.bookId ?? first.book,
		fromChapter: first.fromChapter,
		fromVerse: first.fromVerse,
		toChapter: last.toChapter,
		toVerse: last.toVerse
	});
}

/**
 * Title for the part created by a split.
 *
 * §8/Q28 settles titles for Join Parts (the earlier part keeps its own) but not for Split, and
 * "Romans — Part 3" cannot simply be reused: there would be two parts claiming that name, and the
 * numbering in a title is not maintained by anything — `seriesOrder` is. So the new part is named
 * for what it actually contains. That is stable under later reordering, which a number is not.
 */
function titleForSecondPart(ranges) {
	return referenceFor(ranges) ?? 'New part';
}

/**
 * Narrow the existing passage rows of a part to a new set of ranges, reusing rows in order.
 *
 * ⚠️ **Rows are UPDATED, not deleted and recreated.** `passage_column.passage_id` is
 * ON DELETE CASCADE, so deleting a passage row to re-insert it with a smaller range destroys every
 * column, section, segment, heading, note and commentary hanging off it — silently, while the
 * operation reports success. `api/series/+server.js` may delete-and-reinsert during *creation*
 * because the source study's structure is being rebuilt for brand-new parts anyway; a split must
 * preserve existing work, so it cannot borrow that shortcut.
 *
 * Surplus rows (a multi-passage part whose halves need fewer rows than it had) are deleted, but
 * only after their structure has been moved away — the caller controls that order.
 *
 * `cachedText` is cleared on every row whose range changed: it is keyed by the verse range, so a
 * narrowed passage holding its old text would render verses the part no longer covers. The comment
 * on the column calls it "a complete cache key … invalidated on range change", and this is one.
 *
 * @returns {Promise<string[]>} The passage row ids now backing these ranges, in order
 */
async function applyRanges(tx, studyId, ranges, existingRows, now) {
	const ids = [];

	for (let i = 0; i < ranges.length; i += 1) {
		const range = ranges[i];
		const bookId = range.bookId ?? range.book;
		const reuse = existingRows[i];

		const values = {
			studyId,
			testament: range.testament,
			bookId,
			bookName: range.bookName ?? bookId,
			fromChapter: range.fromChapter,
			toChapter: range.toChapter,
			fromVerse: range.fromVerse,
			toVerse: range.toVerse,
			displayOrder: i,
			// Cleared, not carried: see above.
			cachedText: null,
			textCachedAt: null
		};

		if (reuse) {
			await tx.update(passage).set(values).where(eq(passage.id, reuse.id));
			ids.push(reuse.id);
		} else {
			const id = uuidv4();
			await tx.insert(passage).values({ ...values, id, createdAt: now });
			ids.push(id);
		}
	}

	return ids;
}

/**
 * Split one part of a series into two (SERIES_PLAN §8, "Split Part").
 *
 * ## `dryRun` runs the same code, it does not describe it
 *
 * With `dryRun: true` this validates, computes both resulting ranges, resolves the compliance
 * position and counts the connections that cannot survive — then returns without writing. The
 * confirm modal calls it that way; pressing Split calls it again without the flag. §5's creation
 * flow established the property (the preview and the endpoint share `planSeriesParts()`) and §8
 * needs it more, because here the user is approving a destruction. A second, "close enough"
 * description of the outcome would be free to drift from the outcome.
 *
 * ## Reported vs refused
 *
 * Compliance is **reported, never enforced** — §5's decisions log is explicit that a user may
 * knowingly build a part that will warn at export, and refusing here removes the choice §5 exists
 * to protect. What IS refused is an incoherent split, and one that would break connections without
 * an explicit acknowledgement (Q23 strategy (b): warn, then delete). Q35 leaves the app with no
 * undo, so confirm-before-destroy is the entire mitigation.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const seriesId = params.id;
		const body = (await request.json()) ?? {};
		const {
			partId,
			afterChapter,
			atPassageSeam,
			dryRun = false,
			confirmConnectionLoss = false
		} = body;

		if (!partId || typeof partId !== 'string') {
			return json({ error: 'partId is required' }, { status: 400 });
		}

		// Scoped by userId so another user's series is indistinguishable from a missing one.
		const [series] = await db
			.select()
			.from(studySeries)
			.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, session.user.id)))
			.limit(1);

		if (!series) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		// The whole sequence: renumberForInsert shifts the tail, so it needs every part.
		const parts = await db
			.select()
			.from(study)
			.where(and(eq(study.seriesId, seriesId), eq(study.userId, session.user.id)))
			.orderBy(asc(study.seriesOrder));

		const target = parts.find((p) => p.id === partId);
		if (!target) {
			return json({ error: 'That part is not in this series' }, { status: 404 });
		}

		const targetPassages = await db
			.select()
			.from(passage)
			.where(eq(passage.studyId, partId))
			.orderBy(asc(passage.displayOrder));

		if (targetPassages.length === 0) {
			return json({ error: 'That part has no passages to divide.' }, { status: 400 });
		}

		const partWithPassages = { ...target, passages: targetPassages };
		const translationId = target.translation || 'esv';
		const splitPoints = getSplitPoints(partWithPassages);

		const plan = planPartSplit({
			part: partWithPassages,
			afterChapter,
			atPassageSeam,
			translationId
		});

		if (!plan.ok) {
			// The planner's own sentence explains what is wrong with THIS gesture, which a generic
			// "invalid request" cannot. `splitPoints` travels too, so the client can offer the
			// points that would have worked.
			return json({ error: plan.error, splitPoints }, { status: 400 });
		}

		// §10.1: display compliance is NOT verse-conservative and must be re-checked on BOTH
		// resulting parts — the receiver for a new breach, the donor because its existing warning
		// may now clear and a stale warning is its own bug. Export compliance is deliberately NOT
		// re-run: §10.1 proves a boundary change cannot alter it, since total coverage is unchanged.
		const firstDisplay = validateStudyDisplayLimits(plan.first, translationId);
		const secondDisplay = validateStudyDisplayLimits(plan.second, translationId);

		const boundaryWordId = boundaryWordIdOf(plan.second[0]);
		if (!boundaryWordId) {
			return json(
				{ error: 'The split point could not be resolved to a position in the text.' },
				{ status: 400 }
			);
		}

		// Which shape of split this is decides everything below, so it is resolved once from the
		// planner's own classification rather than re-derived from the request fields.
		const isSeamSplit = splitPoints.kind === 'passage';

		// What the split would do to connections, read from the real structure so the number in the
		// warning is the number that will actually be destroyed.
		//
		// ⚠️ A SEAM split breaks nothing. It divides between passages, so no column changes parent
		// and every connection keeps both endpoints inside the passage it already lived in.
		// Inspecting passage 0 regardless — as this first did — would report the consequences of a
		// chapter-line split that is not happening, and could demand acknowledgement for connections
		// that are never touched. A warning about a loss that will not occur teaches the user to
		// dismiss warnings.
		const preview = isSeamSplit
			? { movedSegments: 0, reownedConnections: 0, straddlingConnections: [] }
			: await inspectPassageSplit(db, {
					passageId: targetPassages[0].id,
					boundaryWordId
				});

		const report = {
			ok: true,
			partTitle: target.title,
			first: plan.first,
			second: plan.second,
			firstReference: referenceFor(plan.first),
			secondReference: referenceFor(plan.second),
			warnings: plan.warnings,
			display: { first: firstDisplay.warnings, second: secondDisplay.warnings },
			connections: {
				reowned: preview.reownedConnections,
				broken: preview.straddlingConnections.length
			},
			splitPoints
		};

		if (dryRun) {
			return json({ ...report, dryRun: true });
		}

		// Nothing is destroyed without an acknowledgement that named the count.
		if (preview.straddlingConnections.length > 0 && !confirmConnectionLoss) {
			const n = preview.straddlingConnections.length;
			return json(
				{
					...report,
					error: `This split would break ${n} connection${n === 1 ? '' : 's'} crossing the new boundary.`,
					needsConnectionConfirmation: true
				},
				{ status: 409 }
			);
		}

		const result = await db.transaction(async (tx) => {
			const now = new Date();

			// 1. seriesOrder is SHIFTED, never re-derived from canonical order (§4): a user who
			//    deliberately teaches Rom 8 first must not have that undone by an unrelated split.
			const { inserted, updates } = renumberForInsert(parts, target.seriesOrder ?? 0);
			for (const update of updates) {
				await tx
					.update(study)
					.set({ seriesOrder: update.seriesOrder, updatedAt: now })
					.where(eq(study.id, update.id));
			}

			const newPartId = uuidv4();
			await tx.insert(study).values({
				id: newPartId,
				title: titleForSecondPart(plan.second),
				subtitle: null,
				// NOT NULL with no default (trap 16): an INSERT omitting this fails at runtime.
				translation: target.translation,
				userId: session.user.id,
				// A part's home is its series, never a group directly — a part with its own groupId
				// renders both inside the series and loose in the group.
				groupId: null,
				seriesId,
				seriesOrder: inserted,
				createdAt: now,
				updatedAt: now
			});

			// 2/3. The two split shapes are genuinely different operations on the rows, and must be
			//      branched rather than merged.
			//
			// ⚠️ Written as one path first, and it corrupted the seam case: it created a fresh row
			// for `plan.second[0]` AND re-parented the original row covering that same range, so the
			// new part held the same verses twice. It also called `splitPassageStructure()` on
			// passage 0, which in a seam split does not move at all. Both faults were invisible to
			// the type-checker and to the build; found by tracing a two-passage part by hand.
			let moved = { movedSegments: 0, straddlingConnections: [] };

			if (isSeamSplit) {
				// A seam split divides BETWEEN passages, so no structure changes parent — each row
				// carries its own columns. Re-parenting the row moves everything hanging off it, and
				// nothing can be orphaned because no column's `passage_id` changes.
				const movingRows = targetPassages.slice(plan.first.length);
				for (let i = 0; i < movingRows.length; i += 1) {
					await tx
						.update(passage)
						.set({ studyId: newPartId, displayOrder: i })
						.where(eq(passage.id, movingRows[i].id));
				}
				// The staying rows keep their ranges untouched; only displayOrder could shift, and
				// it already matches because they are the leading rows.
			} else {
				// A chapter-line split divides ONE passage. The original row is narrowed to the
				// first half — UPDATED, never deleted and recreated, or the cascade would take its
				// structure — and a new row receives the second half.
				await applyRanges(tx, partId, plan.first, targetPassages, now);
				const newPassageIds = await applyRanges(tx, newPartId, plan.second, [], now);

				// Structure moves BEFORE anything is deleted. This ordering is the whole safety
				// argument — see server/db/seriesStructure.js.
				moved = await splitPassageStructure(tx, {
					passageId: targetPassages[0].id,
					newPassageId: newPassageIds[0],
					boundaryWordId,
					newStudyId: newPartId,
					seriesId
				});
			}

			// 4. Only now, and only because the caller confirmed it.
			const brokenIds = moved.straddlingConnections.map((c) => c.id);
			await deleteConnections(tx, brokenIds);

			// 5. Q18: the new part is where the user's attention is going, so it becomes the resume
			//    target. Otherwise the series row would keep reopening the part they just divided.
			await tx
				.update(studySeries)
				.set({ lastPartId: newPartId, updatedAt: now })
				.where(eq(studySeries.id, seriesId));

			return { newPartId, moved, broken: brokenIds.length };
		});

		return json({
			...report,
			newPartId: result.newPartId,
			movedSegments: result.moved.movedSegments,
			brokenConnections: result.broken
		});
	} catch (error) {
		console.error('Error splitting part:', error);
		return json({ error: 'Failed to split the part' }, { status: 500 });
	}
};
