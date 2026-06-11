/**
 * Passage reconciliation engine.
 *
 * When a study is edited, passages may be added, removed, reordered, or have
 * their verse range changed. This module makes editing NON-DESTRUCTIVE: instead
 * of deleting and recreating every passage's structure (which wiped all
 * columns/sections/segments/connections/headings/notes/commentary/tags), it
 * diffs the old vs. new passages by id and only touches what actually changed.
 *
 * Structure is anchored solely by `startingWordId` (BOOK-CHAP-VERSE-WORD). An
 * item implicitly runs until the next same-type item begins, or until the end
 * of the passage. Segments may begin mid-verse and span multiple verses, so all
 * boundary math is done with word IDs (via compareWordIds), never raw verses.
 *
 * `commentaryTag` rows are polymorphic with NO foreign key, so they are never
 * auto-deleted by cascade — this module cleans them up manually whenever a
 * column/section/segment/connection is removed.
 */

import {
	passageColumn,
	passageSection,
	passageSegment,
	segmentConnection,
	commentaryTag
} from '$lib/server/db/schema.js';

import { eq, inArray, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import bibleData from '$lib/data/bible.json';
import { compareWordIds } from '$lib/server/db/utils.js';

/* ------------------------------------------------------------------ */
/* Bible-data helpers (server-side, work directly off bible.json)      */
/* ------------------------------------------------------------------ */

/**
 * Find a book's metadata.
 * @param {string} testament - 'OT' | 'NT'
 * @param {string} bookId
 * @returns {{abbr: string, title: string, chapterCount: number, verseCounts: Object}|null}
 */
function getBookMeta(testament, bookId) {
	const t = bibleData[0].testamentData.find((x) => x._id === testament);
	if (!t) return null;
	const book = t.bookData.find((b) => b._id === bookId);
	if (!book) return null;
	return {
		abbr: (book.titleShortAbbreviation || book._id).toUpperCase(),
		title: book.title,
		chapterCount: book.chapterCount,
		verseCounts: book.chapterData[0]
	};
}

/**
 * Number of verses in a chapter.
 * @param {string} testament
 * @param {string} bookId
 * @param {number} chapter
 * @returns {number}
 */
function getVerseCount(testament, bookId, chapter) {
	const meta = getBookMeta(testament, bookId);
	if (!meta) return 0;
	const n = meta.verseCounts[String(chapter)];
	return typeof n === 'number' ? n : 0;
}

/**
 * @param {number} n
 * @returns {string} zero-padded to 3 digits
 */
function pad3(n) {
	return String(n).padStart(3, '0');
}

/**
 * First word ID of a (chapter, verse).
 * @returns {string}
 */
function wordIdOf(testament, bookId, chapter, verse) {
	const meta = getBookMeta(testament, bookId);
	const abbr = meta ? meta.abbr : bookId.toUpperCase();
	return `${abbr}-${pad3(chapter)}-${pad3(verse)}-001`;
}

/**
 * The (chapter, verse) immediately following the given one, rolling over to the
 * next chapter when needed.
 * @returns {{chapter: number, verse: number}|null} null if end of book
 */
function nextVerse(testament, bookId, chapter, verse) {
	const versesInChapter = getVerseCount(testament, bookId, chapter);
	if (verse < versesInChapter) {
		return { chapter, verse: verse + 1 };
	}
	const meta = getBookMeta(testament, bookId);
	if (!meta || chapter >= meta.chapterCount) return null; // end of book
	return { chapter: chapter + 1, verse: 1 };
}

/**
 * The (chapter, verse) immediately preceding the given one.
 * @returns {{chapter: number, verse: number}|null} null if start of book
 */
function prevVerse(testament, bookId, chapter, verse) {
	if (verse > 1) return { chapter, verse: verse - 1 };
	if (chapter <= 1) return null;
	const prevCount = getVerseCount(testament, bookId, chapter - 1);
	return { chapter: chapter - 1, verse: prevCount };
}

/**
 * Inclusive first word ID of a passage range.
 * @param {{testament:string, bookId:string, fromChapter:number, fromVerse:number}} r
 * @returns {string}
 */
function rangeFirstWordId(r) {
	return wordIdOf(r.testament, r.bookId, r.fromChapter, r.fromVerse);
}

/**
 * EXCLUSIVE end word ID of a passage range — the first word of the verse AFTER
 * the range's last verse. Used as an open upper bound for "is this item inside
 * the range?" tests. Falls back to a max sentinel when the range ends the book.
 * @param {{testament:string, bookId:string, toChapter:number, toVerse:number}} r
 * @returns {string}
 */
function rangeExclusiveEndWordId(r) {
	const meta = getBookMeta(r.testament, r.bookId);
	const abbr = meta ? meta.abbr : r.bookId.toUpperCase();
	const nv = nextVerse(r.testament, r.bookId, r.toChapter, r.toVerse);
	if (!nv) return `${abbr}-999-999-999`;
	return `${abbr}-${pad3(nv.chapter)}-${pad3(nv.verse)}-001`;
}

/**
 * Count verses inclusively between two (chapter, verse) points (same book).
 * @returns {number}
 */
function countVerses(testament, bookId, fromCh, fromV, toCh, toV) {
	if (fromCh > toCh || (fromCh === toCh && fromV > toV)) return 0;
	let count = 0;
	let ch = fromCh;
	let v = fromV;
	// Guard against runaway loops
	let guard = 0;
	while (guard++ < 10000) {
		count++;
		if (ch === toCh && v === toV) break;
		const nv = nextVerse(testament, bookId, ch, v);
		if (!nv) break;
		ch = nv.chapter;
		v = nv.verse;
	}
	return count;
}

/**
 * Human-readable reference string for a (sub)range.
 * @returns {string}
 */
function refString(testament, bookId, fromCh, fromV, toCh, toV) {
	const meta = getBookMeta(testament, bookId);
	const name = meta ? meta.title : bookId;
	if (fromCh === toCh && fromV === toV) return `${name} ${fromCh}:${fromV}`;
	if (fromCh === toCh) return `${name} ${fromCh}:${fromV}-${toV}`;
	return `${name} ${fromCh}:${fromV}-${toCh}:${toV}`;
}

/* ------------------------------------------------------------------ */
/* Structure loading                                                   */
/* ------------------------------------------------------------------ */

/**
 * Load a passage's full structure tree ordered by startingWordId.
 * @returns {Promise<Array>} columns[] each with sections[] each with segments[]
 */
async function loadTree(dbx, passageId) {
	const columns = await dbx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));
	if (columns.length === 0) return [];

	const columnIds = columns.map((c) => c.id);
	const sections = await dbx
		.select()
		.from(passageSection)
		.where(inArray(passageSection.passageColumnId, columnIds))
		.orderBy(asc(passageSection.startingWordId));

	const sectionIds = sections.map((s) => s.id);
	const segments =
		sectionIds.length > 0
			? await dbx
					.select()
					.from(passageSegment)
					.where(inArray(passageSegment.passageSectionId, sectionIds))
					.orderBy(asc(passageSegment.startingWordId))
			: [];

	return columns.map((col) => ({
		...col,
		sections: sections
			.filter((s) => s.passageColumnId === col.id)
			.map((sec) => ({
				...sec,
				segments: segments
					.filter((seg) => seg.passageSectionId === sec.id)
					.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId))
			}))
	}));
}

/**
 * Flatten a tree to segments in word order, each tagged with its parents.
 * @returns {Array<{segment:Object, section:Object, column:Object}>}
 */
function flattenSegments(tree) {
	const out = [];
	for (const column of tree) {
		for (const section of column.sections) {
			for (const segment of section.segments) {
				out.push({ segment, section, column });
			}
		}
	}
	out.sort((a, b) => compareWordIds(a.segment.startingWordId, b.segment.startingWordId));
	return out;
}

/**
 * Does a segment row carry user content worth preserving?
 * @param {Object} seg
 * @param {Set<string>} taggedSegmentIds
 * @returns {boolean}
 */
function segmentHasContent(seg, taggedSegmentIds) {
	return Boolean(
		seg.headingOne ||
			seg.headingTwo ||
			seg.headingThree ||
			seg.note ||
			seg.commentary ||
			seg.height ||
			taggedSegmentIds.has(seg.id)
	);
}

/* ------------------------------------------------------------------ */
/* Passage list diff                                                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} NewPassage
 * @property {string} id
 * @property {string} testament
 * @property {string} book        - book id (maps to passage.bookId)
 * @property {number} fromChapter
 * @property {number} toChapter
 * @property {number} fromVerse
 * @property {number} toVerse
 */

/**
 * Categorize old (DB) vs new (form) passages by id.
 * @param {Array} oldPassages - rows from `passage` table
 * @param {NewPassage[]} newPassages
 */
export function diffPassages(oldPassages, newPassages) {
	const oldById = new Map(oldPassages.map((p) => [p.id, p]));
	const newById = new Map(newPassages.map((p) => [p.id, p]));

	const added = [];
	const removed = [];
	const changed = []; // { old, next }
	const unchanged = []; // { old, next }

	for (const next of newPassages) {
		const old = oldById.get(next.id);
		if (!old) {
			added.push(next);
			continue;
		}
		const rangeChanged =
			old.testament !== next.testament ||
			old.bookId !== next.book ||
			old.fromChapter !== next.fromChapter ||
			old.toChapter !== next.toChapter ||
			old.fromVerse !== next.fromVerse ||
			old.toVerse !== next.toVerse;
		if (rangeChanged) changed.push({ old, next });
		else unchanged.push({ old, next });
	}

	for (const old of oldPassages) {
		if (!newById.has(old.id)) removed.push(old);
	}

	return { added, removed, changed, unchanged };
}

/**
 * Compute the four edge operations implied by an old → new range change.
 * @returns {{addStart:Object|null, removeStart:Object|null, addEnd:Object|null, removeEnd:Object|null, replace:boolean}}
 */
function computeEdges(old, next) {
	// Book / testament change can't be re-anchored — treat as a full replace.
	if (old.testament !== next.testament || old.bookId !== next.book) {
		return { addStart: null, removeStart: null, addEnd: null, removeEnd: null, replace: true };
	}

	const t = next.testament;
	const b = next.book;

	const oldFirst = rangeFirstWordId({ testament: t, bookId: b, fromChapter: old.fromChapter, fromVerse: old.fromVerse });
	const newFirst = rangeFirstWordId({ testament: t, bookId: b, fromChapter: next.fromChapter, fromVerse: next.fromVerse });
	const oldEnd = rangeExclusiveEndWordId({ testament: t, bookId: b, toChapter: old.toChapter, toVerse: old.toVerse });
	const newEnd = rangeExclusiveEndWordId({ testament: t, bookId: b, toChapter: next.toChapter, toVerse: next.toVerse });

	const startCmp = compareWordIds(newFirst, oldFirst);
	const endCmp = compareWordIds(newEnd, oldEnd);

	let addStart = null;
	let removeStart = null;
	let addEnd = null;
	let removeEnd = null;

	if (startCmp < 0) {
		// Range extended earlier: added verses are [newFrom .. verse before oldFrom]
		const pv = prevVerse(t, b, old.fromChapter, old.fromVerse);
		addStart = {
			newFirst,
			count: pv ? countVerses(t, b, next.fromChapter, next.fromVerse, pv.chapter, pv.verse) : 0,
			reference: pv ? refString(t, b, next.fromChapter, next.fromVerse, pv.chapter, pv.verse) : ''
		};
	} else if (startCmp > 0) {
		// Range trimmed at start: removed verses are [oldFrom .. verse before newFrom]
		const pv = prevVerse(t, b, next.fromChapter, next.fromVerse);
		removeStart = {
			newFirst,
			count: pv ? countVerses(t, b, old.fromChapter, old.fromVerse, pv.chapter, pv.verse) : 0,
			reference: pv ? refString(t, b, old.fromChapter, old.fromVerse, pv.chapter, pv.verse) : ''
		};
	}

	if (endCmp > 0) {
		// Range extended later: first added word is the old exclusive end; added
		// verses are [verse after oldTo .. newTo]
		const nv = nextVerse(t, b, old.toChapter, old.toVerse);
		addEnd = {
			firstAddedWord: oldEnd,
			count: nv ? countVerses(t, b, nv.chapter, nv.verse, next.toChapter, next.toVerse) : 0,
			reference: nv ? refString(t, b, nv.chapter, nv.verse, next.toChapter, next.toVerse) : ''
		};
	} else if (endCmp < 0) {
		// Range trimmed at end: orphans are items with start >= newEnd; removed
		// verses are [verse after newTo .. oldTo]
		const nv = nextVerse(t, b, next.toChapter, next.toVerse);
		removeEnd = {
			newEnd,
			count: nv ? countVerses(t, b, nv.chapter, nv.verse, old.toChapter, old.toVerse) : 0,
			reference: nv ? refString(t, b, nv.chapter, nv.verse, old.toChapter, old.toVerse) : ''
		};
	}

	return { addStart, removeStart, addEnd, removeEnd, replace: false };
}

/* ------------------------------------------------------------------ */
/* Impact analysis (drives the Review modal)                           */
/* ------------------------------------------------------------------ */

/**
 * Build a tag lookup: subjectId -> count, for a set of ids.
 */
async function loadTaggedIds(dbx, subjectType, ids) {
	if (ids.length === 0) return new Set();
	const rows = await dbx
		.select({ subjectId: commentaryTag.subjectId })
		.from(commentaryTag)
		.where(inArray(commentaryTag.subjectId, ids));
	const set = new Set();
	for (const r of rows) set.add(r.subjectId);
	return set;
}

/**
 * Analyze a removal edge against the live structure to find what would be lost.
 * @param {'start'|'end'} side
 * @param {string} boundaryWord - newFirst (start) or newEnd (end)
 */
async function analyzeRemoval(dbx, studyId, passageId, side, boundaryWord) {
	const tree = await loadTree(dbx, passageId);
	const flat = flattenSegments(tree);

	let orphanEntries;
	if (side === 'start') {
		// Covering segment = greatest start <= boundary; everything strictly
		// before it is orphaned.
		let coveringIdx = -1;
		for (let i = 0; i < flat.length; i++) {
			if (compareWordIds(flat[i].segment.startingWordId, boundaryWord) <= 0) coveringIdx = i;
			else break;
		}
		orphanEntries = coveringIdx > 0 ? flat.slice(0, coveringIdx) : [];
	} else {
		// Orphans are segments starting at/after the new exclusive end.
		orphanEntries = flat.filter((e) => compareWordIds(e.segment.startingWordId, boundaryWord) >= 0);
	}

	const orphanSegmentIds = orphanEntries.map((e) => e.segment.id);
	const taggedSegments = await loadTaggedIds(dbx, 'segment', orphanSegmentIds);

	// Fully-orphaned sections / columns (all their segments are orphaned)
	const orphanSegmentIdSet = new Set(orphanSegmentIds);
	const orphanSections = [];
	const orphanColumns = [];
	for (const column of tree) {
		const colSegs = column.sections.flatMap((s) => s.segments);
		const colAllOrphan = colSegs.length > 0 && colSegs.every((seg) => orphanSegmentIdSet.has(seg.id));
		if (colAllOrphan) orphanColumns.push(column);
		for (const section of column.sections) {
			const allOrphan =
				section.segments.length > 0 && section.segments.every((seg) => orphanSegmentIdSet.has(seg.id));
			if (allOrphan) orphanSections.push(section);
		}
	}

	const taggedSections = await loadTaggedIds(dbx, 'section', orphanSections.map((s) => s.id));
	const taggedColumns = await loadTaggedIds(dbx, 'column', orphanColumns.map((c) => c.id));

	const segmentsWithContent = orphanEntries.filter((e) => segmentHasContent(e.segment, taggedSegments)).length;
	const sectionsWithContent = orphanSections.filter((s) => s.commentary || taggedSections.has(s.id)).length;
	const columnsWithContent = orphanColumns.filter((c) => c.commentary || taggedColumns.has(c.id)).length;

	// Connections touching any orphaned item
	const orphanSectionIds = new Set(orphanSections.map((s) => s.id));
	const orphanColumnIds = new Set(orphanColumns.map((c) => c.id));
	const allConnections = await dbx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));
	const affectedConnections = allConnections.filter(
		(c) =>
			(c.fromSegmentId && orphanSegmentIdSet.has(c.fromSegmentId)) ||
			(c.toSegmentId && orphanSegmentIdSet.has(c.toSegmentId)) ||
			(c.fromSectionId && orphanSectionIds.has(c.fromSectionId)) ||
			(c.toSectionId && orphanSectionIds.has(c.toSectionId)) ||
			(c.fromColumnId && orphanColumnIds.has(c.fromColumnId)) ||
			(c.toColumnId && orphanColumnIds.has(c.toColumnId))
	);

	const segments = orphanEntries.length;
	const connections = affectedConnections.length;
	const sections = orphanSections.length;
	const columns = orphanColumns.length;

	// A decision is needed only when something meaningful would be lost.
	const needsDecision =
		segmentsWithContent > 0 || sectionsWithContent > 0 || columnsWithContent > 0 || connections > 0;

	// Whether a merge target exists (a surviving segment to fold into)
	const survivingSegments = flat.length - orphanEntries.length;
	const canMerge = survivingSegments > 0 && segments > 0;

	return {
		segments,
		segmentsWithContent,
		sections,
		sectionsWithContent,
		columns,
		columnsWithContent,
		connections,
		needsDecision,
		canMerge
	};
}

/**
 * Produce the impact report for an entire edit (used before committing).
 * @param {Object} dbx
 * @param {string} studyId
 * @param {Array} oldPassages - DB rows
 * @param {NewPassage[]} newPassages
 * @returns {Promise<{passages: Array, requiresReview: boolean}>}
 */
export async function analyzeEdit(dbx, studyId, oldPassages, newPassages) {
	const { changed } = diffPassages(oldPassages, newPassages);
	const reports = [];

	for (const { old, next } of changed) {
		const edges = computeEdges(old, next);
		const meta = getBookMeta(next.testament, next.book);
		const passageLabel = meta ? meta.title : next.book;
		const report = {
			passageId: next.id,
			label: passageLabel,
			replace: edges.replace,
			addStart: null,
			addEnd: null,
			removeStart: null,
			removeEnd: null
		};

		if (edges.replace) {
			reports.push(report);
			continue;
		}

		if (edges.addStart) {
			report.addStart = { count: edges.addStart.count, reference: edges.addStart.reference };
		}
		if (edges.addEnd) {
			report.addEnd = { count: edges.addEnd.count, reference: edges.addEnd.reference };
		}
		if (edges.removeStart) {
			const impact = await analyzeRemoval(dbx, studyId, next.id, 'start', edges.removeStart.newFirst);
			report.removeStart = { ...impact, count: edges.removeStart.count, reference: edges.removeStart.reference };
		}
		if (edges.removeEnd) {
			const impact = await analyzeRemoval(dbx, studyId, next.id, 'end', edges.removeEnd.newEnd);
			report.removeEnd = { ...impact, count: edges.removeEnd.count, reference: edges.removeEnd.reference };
		}

		reports.push(report);
	}

	const requiresReview = reports.some(
		(r) =>
			r.replace ||
			r.addStart ||
			r.addEnd ||
			(r.removeStart && r.removeStart.needsDecision) ||
			(r.removeEnd && r.removeEnd.needsDecision)
	);

	return { passages: reports, requiresReview };
}

/* ------------------------------------------------------------------ */
/* Mutation helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Delete commentaryTag rows for a set of subject ids of one type.
 */
async function deleteTagsFor(tx, subjectType, ids) {
	if (ids.length === 0) return;
	await tx
		.delete(commentaryTag)
		.where(inArray(commentaryTag.subjectId, ids));
}

/**
 * Delete a set of segments (by id) plus their connections and tags.
 * Connections are cascade-deleted by FK, but we first collect their ids so we
 * can clean their (FK-less) tags.
 */
async function deleteSegments(tx, studyId, segmentIds) {
	if (segmentIds.length === 0) return;

	// Connections referencing these segments will be cascade-deleted — collect
	// their ids first so we can clean their (FK-less) commentary tags.
	const allConns = await tx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));
	const segSet = new Set(segmentIds);
	const connIdsToClean = allConns
		.filter((c) => (c.fromSegmentId && segSet.has(c.fromSegmentId)) || (c.toSegmentId && segSet.has(c.toSegmentId)))
		.map((c) => c.id);

	await deleteTagsFor(tx, 'connection', connIdsToClean);
	await deleteTagsFor(tx, 'segment', segmentIds);
	await tx.delete(passageSegment).where(inArray(passageSegment.id, segmentIds));
}


/**
 * Delete now-empty sections and columns in a passage (no surviving segments),
 * cleaning their tags and connections.
 */
async function pruneEmptyContainers(tx, studyId, passageId) {
	const tree = await loadTree(tx, passageId);

	const emptySectionIds = [];
	const emptyColumnIds = [];
	for (const column of tree) {
		const colSegs = column.sections.flatMap((s) => s.segments);
		if (colSegs.length === 0) {
			emptyColumnIds.push(column.id);
			continue;
		}
		for (const section of column.sections) {
			if (section.segments.length === 0) emptySectionIds.push(section.id);
		}
	}

	if (emptySectionIds.length > 0 || emptyColumnIds.length > 0) {
		// Clean connections referencing these sections/columns (cascade will
		// delete the connections themselves).
		const allConns = await tx
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.studyId, studyId));
		const secSet = new Set(emptySectionIds);
		const colSet = new Set(emptyColumnIds);
		const connIdsToClean = allConns
			.filter(
				(c) =>
					(c.fromSectionId && secSet.has(c.fromSectionId)) ||
					(c.toSectionId && secSet.has(c.toSectionId)) ||
					(c.fromColumnId && colSet.has(c.fromColumnId)) ||
					(c.toColumnId && colSet.has(c.toColumnId))
			)
			.map((c) => c.id);
		await deleteTagsFor(tx, 'connection', connIdsToClean);
		await deleteTagsFor(tx, 'section', emptySectionIds);
		await deleteTagsFor(tx, 'column', emptyColumnIds);
	}

	if (emptySectionIds.length > 0) {
		await tx.delete(passageSection).where(inArray(passageSection.id, emptySectionIds));
	}
	if (emptyColumnIds.length > 0) {
		await tx.delete(passageColumn).where(inArray(passageColumn.id, emptyColumnIds));
	}
}

/**
 * Fold an orphan segment's content into a surviving target segment.
 * - Headings fill only EMPTY target slots (never overwrite).
 * - note / commentary are appended.
 * - tags are re-pointed (deduped by termId).
 * - layout overrides (height) are dropped.
 */
async function foldSegmentContent(tx, fromSeg, targetSeg) {
	const set = {};
	if (!targetSeg.headingOne && fromSeg.headingOne) {
		set.headingOne = fromSeg.headingOne;
		targetSeg.headingOne = fromSeg.headingOne;
	}
	if (!targetSeg.headingTwo && fromSeg.headingTwo) {
		set.headingTwo = fromSeg.headingTwo;
		targetSeg.headingTwo = fromSeg.headingTwo;
	}
	if (!targetSeg.headingThree && fromSeg.headingThree) {
		set.headingThree = fromSeg.headingThree;
		targetSeg.headingThree = fromSeg.headingThree;
	}
	if (fromSeg.note) {
		set.note = targetSeg.note ? `${targetSeg.note}\n${fromSeg.note}` : fromSeg.note;
		targetSeg.note = set.note;
	}
	if (fromSeg.commentary) {
		set.commentary = targetSeg.commentary
			? `${targetSeg.commentary}\n${fromSeg.commentary}`
			: fromSeg.commentary;
		targetSeg.commentary = set.commentary;
	}

	if (Object.keys(set).length > 0) {
		set.updatedAt = new Date();
		await tx.update(passageSegment).set(set).where(eq(passageSegment.id, targetSeg.id));
	}

	// Move tags from the orphan segment onto the target, deduped by termId.
	const fromTags = await tx
		.select()
		.from(commentaryTag)
		.where(eq(commentaryTag.subjectId, fromSeg.id));
	if (fromTags.length > 0) {
		const targetTags = await tx
			.select()
			.from(commentaryTag)
			.where(eq(commentaryTag.subjectId, targetSeg.id));
		const existingTerms = new Set(targetTags.filter((t) => t.subjectType === 'segment').map((t) => t.termId));
		let order = targetTags.length;
		for (const tag of fromTags) {
			if (tag.subjectType !== 'segment') continue;
			if (existingTerms.has(tag.termId)) continue;
			await tx
				.update(commentaryTag)
				.set({ subjectId: targetSeg.id, displayOrder: order++ })
				.where(eq(commentaryTag.id, tag.id));
			existingTerms.add(tag.termId);
		}
	}
}

/**
 * Re-anchor the very first column/section/segment of a passage to `newFirst`,
 * preserving any intentional mid-verse split only when it still falls inside
 * the new range.
 */
async function reanchorFirst(tx, passageId, newFirst) {
	const tree = await loadTree(tx, passageId);
	if (tree.length === 0) return;
	const firstColumn = tree[0];
	const firstSection = firstColumn.sections[0];
	const firstSegment = firstSection ? firstSection.segments[0] : null;
	const now = new Date();

	if (compareWordIds(firstColumn.startingWordId, newFirst) > 0 || compareWordIds(firstColumn.startingWordId, newFirst) < 0) {
		// Only move when it doesn't already match.
		if (firstColumn.startingWordId !== newFirst) {
			await tx.update(passageColumn).set({ startingWordId: newFirst, updatedAt: now }).where(eq(passageColumn.id, firstColumn.id));
		}
	}
	if (firstSection && firstSection.startingWordId !== newFirst) {
		await tx.update(passageSection).set({ startingWordId: newFirst, updatedAt: now }).where(eq(passageSection.id, firstSection.id));
	}
	if (firstSegment && firstSegment.startingWordId !== newFirst) {
		await tx.update(passageSegment).set({ startingWordId: newFirst, updatedAt: now }).where(eq(passageSegment.id, firstSegment.id));
	}
}

/* ------------------------------------------------------------------ */
/* Default-structure creation (transaction-aware)                      */
/* ------------------------------------------------------------------ */

async function createDefaultStructureTx(tx, passageId, firstWord) {
	const now = new Date();
	const columnId = uuidv4();
	await tx.insert(passageColumn).values({ id: columnId, passageId, startingWordId: firstWord, createdAt: now, updatedAt: now });
	const sectionId = uuidv4();
	await tx.insert(passageSection).values({ id: sectionId, passageColumnId: columnId, startingWordId: firstWord, color: 'blue', createdAt: now, updatedAt: now });
	await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: sectionId, startingWordId: firstWord, createdAt: now, updatedAt: now });
}

/* ------------------------------------------------------------------ */
/* Edge applicators                                                    */
/* ------------------------------------------------------------------ */

async function applyAddStart(tx, passageId, newFirst, placement, inheritColor) {
	const tree = await loadTree(tx, passageId);
	if (tree.length === 0) {
		await createDefaultStructureTx(tx, passageId, newFirst);
		return;
	}
	const firstColumn = tree[0];
	const firstSection = firstColumn.sections[0];
	const now = new Date();
	const color = inheritColor || (firstSection ? firstSection.color : 'blue');

	if (placement === 'extend' || !placement) {
		await reanchorFirst(tx, passageId, newFirst);
		return;
	}

	if (placement === 'segment') {
		// New leading segment in the existing first section; move section + column
		// anchors back to newFirst.
		await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: firstSection.id, startingWordId: newFirst, createdAt: now, updatedAt: now });
		await tx.update(passageSection).set({ startingWordId: newFirst, updatedAt: now }).where(eq(passageSection.id, firstSection.id));
		await tx.update(passageColumn).set({ startingWordId: newFirst, updatedAt: now }).where(eq(passageColumn.id, firstColumn.id));
		return;
	}

	if (placement === 'section') {
		const newSectionId = uuidv4();
		await tx.insert(passageSection).values({ id: newSectionId, passageColumnId: firstColumn.id, startingWordId: newFirst, color, createdAt: now, updatedAt: now });
		await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: newSectionId, startingWordId: newFirst, createdAt: now, updatedAt: now });
		await tx.update(passageColumn).set({ startingWordId: newFirst, updatedAt: now }).where(eq(passageColumn.id, firstColumn.id));
		return;
	}

	if (placement === 'column') {
		const newColumnId = uuidv4();
		const newSectionId = uuidv4();
		await tx.insert(passageColumn).values({ id: newColumnId, passageId, startingWordId: newFirst, createdAt: now, updatedAt: now });
		await tx.insert(passageSection).values({ id: newSectionId, passageColumnId: newColumnId, startingWordId: newFirst, color, createdAt: now, updatedAt: now });
		await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: newSectionId, startingWordId: newFirst, createdAt: now, updatedAt: now });
		return;
	}
}

async function applyAddEnd(tx, passageId, firstAddedWord, placement, inheritColor) {
	const tree = await loadTree(tx, passageId);
	if (tree.length === 0) {
		await createDefaultStructureTx(tx, passageId, firstAddedWord);
		return;
	}
	const lastColumn = tree[tree.length - 1];
	const lastSection = lastColumn.sections[lastColumn.sections.length - 1];
	const now = new Date();
	const color = inheritColor || (lastSection ? lastSection.color : 'blue');

	if (placement === 'extend' || !placement) {
		// Last segment has no stored end — new verses flow in automatically.
		return;
	}

	if (placement === 'segment') {
		await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: lastSection.id, startingWordId: firstAddedWord, createdAt: now, updatedAt: now });
		return;
	}

	if (placement === 'section') {
		const newSectionId = uuidv4();
		await tx.insert(passageSection).values({ id: newSectionId, passageColumnId: lastColumn.id, startingWordId: firstAddedWord, color, createdAt: now, updatedAt: now });
		await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: newSectionId, startingWordId: firstAddedWord, createdAt: now, updatedAt: now });
		return;
	}

	if (placement === 'column') {
		const newColumnId = uuidv4();
		const newSectionId = uuidv4();
		await tx.insert(passageColumn).values({ id: newColumnId, passageId, startingWordId: firstAddedWord, createdAt: now, updatedAt: now });
		await tx.insert(passageSection).values({ id: newSectionId, passageColumnId: newColumnId, startingWordId: firstAddedWord, color, createdAt: now, updatedAt: now });
		await tx.insert(passageSegment).values({ id: uuidv4(), passageSectionId: newSectionId, startingWordId: firstAddedWord, createdAt: now, updatedAt: now });
		return;
	}
}

async function applyRemoveStart(tx, studyId, passageId, newFirst, mode) {
	const tree = await loadTree(tx, passageId);
	const flat = flattenSegments(tree);
	if (flat.length === 0) return;

	// Covering segment = greatest start <= newFirst
	let coveringIdx = -1;
	for (let i = 0; i < flat.length; i++) {
		if (compareWordIds(flat[i].segment.startingWordId, newFirst) <= 0) coveringIdx = i;
		else break;
	}
	if (coveringIdx <= 0) {
		// Nothing strictly before the covering segment — just re-anchor.
		await reanchorFirst(tx, passageId, newFirst);
		return;
	}

	const orphanEntries = flat.slice(0, coveringIdx);
	const target = flat[coveringIdx].segment;

	if (mode === 'merge') {
		// Fold in word order (already sorted ascending).
		for (const entry of orphanEntries) {
			await foldSegmentContent(tx, entry.segment, target);
		}
	}

	await deleteSegments(tx, studyId, orphanEntries.map((e) => e.segment.id));
	await pruneEmptyContainers(tx, studyId, passageId);
	await reanchorFirst(tx, passageId, newFirst);
}

async function applyRemoveEnd(tx, studyId, passageId, newEnd, mode) {
	const tree = await loadTree(tx, passageId);
	const flat = flattenSegments(tree);
	if (flat.length === 0) return;

	const orphanEntries = flat.filter((e) => compareWordIds(e.segment.startingWordId, newEnd) >= 0);
	if (orphanEntries.length === 0) return;

	const survivors = flat.filter((e) => compareWordIds(e.segment.startingWordId, newEnd) < 0);
	if (mode === 'merge' && survivors.length > 0) {
		const target = survivors[survivors.length - 1].segment;
		for (const entry of orphanEntries) {
			await foldSegmentContent(tx, entry.segment, target);
		}
	}

	await deleteSegments(tx, studyId, orphanEntries.map((e) => e.segment.id));
	await pruneEmptyContainers(tx, studyId, passageId);
}

/**
 * Replace a passage's entire structure (used when book/testament changes).
 */
async function applyReplace(tx, studyId, passageId, newFirstWord) {
	const tree = await loadTree(tx, passageId);
	const segmentIds = [];
	const sectionIds = [];
	const columnIds = [];
	for (const column of tree) {
		columnIds.push(column.id);
		for (const section of column.sections) {
			sectionIds.push(section.id);
			for (const segment of section.segments) segmentIds.push(segment.id);
		}
	}

	// Clean connection tags (connections cascade-deleted when segments/sections/columns go)
	const allConns = await tx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));
	const segSet = new Set(segmentIds);
	const secSet = new Set(sectionIds);
	const colSet = new Set(columnIds);
	const connIdsToClean = allConns
		.filter(
			(c) =>
				(c.fromSegmentId && segSet.has(c.fromSegmentId)) ||
				(c.toSegmentId && segSet.has(c.toSegmentId)) ||
				(c.fromSectionId && secSet.has(c.fromSectionId)) ||
				(c.toSectionId && secSet.has(c.toSectionId)) ||
				(c.fromColumnId && colSet.has(c.fromColumnId)) ||
				(c.toColumnId && colSet.has(c.toColumnId))
		)
		.map((c) => c.id);

	await deleteTagsFor(tx, 'connection', connIdsToClean);
	await deleteTagsFor(tx, 'segment', segmentIds);
	await deleteTagsFor(tx, 'section', sectionIds);
	await deleteTagsFor(tx, 'column', columnIds);

	if (columnIds.length > 0) {
		await tx.delete(passageColumn).where(inArray(passageColumn.id, columnIds));
	}
	await createDefaultStructureTx(tx, passageId, newFirstWord);
}

/* ------------------------------------------------------------------ */
/* Public: apply a single passage's range change                        */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} PassageDecision
 * @property {string} [addStartPlacement] - 'extend'|'segment'|'section'|'column'
 * @property {string} [addEndPlacement]   - 'extend'|'segment'|'section'|'column'
 * @property {string} [removeStartMode]   - 'merge'|'delete'
 * @property {string} [removeEndMode]     - 'merge'|'delete'
 */

/**
 * Apply an old → new range change for one passage inside a transaction.
 * @param {Object} tx
 * @param {string} studyId
 * @param {Object} old - DB passage row
 * @param {NewPassage} next
 * @param {PassageDecision} decision
 */
export async function applyPassageRangeChange(tx, studyId, old, next, decision = {}) {
	const edges = computeEdges(old, next);

	if (edges.replace) {
		const newFirst = rangeFirstWordId({
			testament: next.testament,
			bookId: next.book,
			fromChapter: next.fromChapter,
			fromVerse: next.fromVerse
		});
		await applyReplace(tx, studyId, next.id, newFirst);
		return;
	}

	// Apply start edge
	if (edges.addStart) {
		await applyAddStart(tx, next.id, edges.addStart.newFirst, decision.addStartPlacement || 'segment');
	} else if (edges.removeStart) {
		await applyRemoveStart(tx, studyId, next.id, edges.removeStart.newFirst, decision.removeStartMode || 'delete');
	}

	// Apply end edge
	if (edges.addEnd) {
		await applyAddEnd(tx, next.id, edges.addEnd.firstAddedWord, decision.addEndPlacement || 'segment');
	} else if (edges.removeEnd) {
		await applyRemoveEnd(tx, studyId, next.id, edges.removeEnd.newEnd, decision.removeEndMode || 'delete');
	}
}

export { getBookMeta, rangeFirstWordId, createDefaultStructureTx };

