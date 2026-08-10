/**
 * # Moving structure across a part boundary — the decision layer (SERIES_PLAN §8, phase 2)
 *
 * `seriesRestructure.js` decides what the *ranges* become. This module decides what happens to
 * the `passage_column` / `passage_section` / `passage_segment` rows underneath them, and to the
 * connections anchored to those rows. It is pure: a loaded structure tree in, a list of intended
 * operations out. Nothing here touches the database — `server/db/seriesStructure.js` executes
 * what this returns.
 *
 * ## Why this is split from the executor at all
 *
 * Because the alternative is unverifiable. `server/db/utils.js` imports `$lib/server/db/index.js`,
 * which imports `$env/static/private` and opens a connection at module load, so anything in that
 * import graph cannot be loaded by the plain-Node verifier scripts. Keeping the decisions pure is
 * what lets `scripts/verify-series-structure.mjs` assert on them at all, and it is the same shape
 * §5's creation flow and §8's Split/Join planning already use.
 *
 * ## The destructive trap this module exists to prevent
 *
 * `passage_column.passage_id` is `ON DELETE CASCADE`, and the cascade runs the whole way down:
 * columns → sections → segments → headings, plus every `segment_connection` whose six endpoint
 * FKs are also `ON DELETE CASCADE`.
 *
 * `planPartJoin()` (already shipped, and pinned by an assertion) coalesces two abutting ranges
 * into ONE range. Executed naively — write the merged range onto the surviving passage row, delete
 * the absorbed one — that cascade silently destroys every column, section, segment, heading, note
 * and commentary the user authored in the absorbed part. The join would report success. This is
 * why `planStructureMove()` exists: structure is **re-parented before anything is deleted**, and
 * the absorbed passage row is only removed once it is empty.
 *
 * ## No re-keying, and that is a fact about the data, not an optimisation
 *
 * `startingWordId` is globally canonical (`BOOK-CHAPTER-VERSE-WORD`), so a segment keyed at
 * `RO-003-001-001` is valid in whichever passage contains Romans 3:1 (§8). Moving structure is
 * therefore a change of parent id and nothing else. §8's own ⚠️ warns against over-reading that:
 * it removes re-keying, and removes none of the ordering, splitting or ownership work below.
 *
 * @module seriesStructurePlan
 */

import { compareWordIds } from './wordIds.js';

/**
 * Flatten a loaded tree to segment entries in word order, each tagged with its parents.
 *
 * Deliberately a local copy of the shape `passageJoin.js` and `passageReconcile.js` each already
 * carry. §8 records that those two are parallel implementations and asks for an explicit decision
 * about de-duplicating them; the decision for this commit is **not now** — see the module note in
 * `server/db/seriesStructure.js`. This version differs from both anyway: it never sorts by
 * anything but word order and never projects headings, because ownership decisions do not care
 * what a segment says.
 */
function flatten(tree) {
	const out = [];
	for (const column of tree ?? []) {
		for (const section of column.sections ?? []) {
			for (const segment of section.segments ?? []) {
				out.push({ segment, section, column });
			}
		}
	}
	out.sort((a, b) => compareWordIds(a.segment.startingWordId, b.segment.startingWordId));
	return out;
}

/**
 * Plan the division of one passage's structure at a word boundary (Split Part).
 *
 * Everything at or after `boundaryWordId` belongs to the new passage; everything before stays.
 * Three cases, and the third is the one that carries the risk:
 *
 * 1. A column lies wholly before the boundary — untouched.
 * 2. A column lies wholly at or after it — **re-parented** to the new passage, with its sections
 *    and segments coming along implicitly (they hang off the column, not the passage).
 * 3. A column **straddles** the boundary. It cannot be re-parented (that would drag the verses
 *    before the split into the second part) and it cannot be left (that would strand the verses
 *    after it in the first part). So it is *cloned*: a new column, and a new section for each
 *    straddling section, in the new passage — and only the segments at or after the boundary move.
 *
 * The clone keeps the original's presentational fields, because a split must not silently restyle
 * the user's document. What it does NOT keep is the original's id, nor any content on the
 * straddling section itself — sections carry no authored content in the current schema
 * (`passageReconcile.js` says so explicitly: commentary moved to headings), so there is nothing to
 * fold. If that changes, this is one of the places that has to change with it.
 *
 * @param {Array} tree - Loaded columns[] → sections[] → segments[] for the source passage
 * @param {string} boundaryWordId - First word id belonging to the SECOND part
 * @returns {{
 *   moveColumns: string[],
 *   cloneColumns: Array<{ from: Object, sections: Array<{ from: Object, segmentIds: string[] }> }>,
 *   movedSegmentIds: string[],
 *   stayingSegmentIds: string[]
 * }}
 */
export function planStructureSplit(tree, boundaryWordId) {
	const moveColumns = [];
	const cloneColumns = [];
	const movedSegmentIds = [];
	const stayingSegmentIds = [];

	for (const column of tree ?? []) {
		const entries = flatten([column]);

		// A column with no segments has nothing to divide and no content to lose. It follows its
		// own anchor, so an empty column does not silently switch parts.
		if (entries.length === 0) {
			if (compareWordIds(column.startingWordId, boundaryWordId) >= 0) {
				moveColumns.push(column.id);
			}
			continue;
		}

		const moving = entries.filter(
			(e) => compareWordIds(e.segment.startingWordId, boundaryWordId) >= 0
		);
		const staying = entries.filter(
			(e) => compareWordIds(e.segment.startingWordId, boundaryWordId) < 0
		);

		for (const e of moving) movedSegmentIds.push(e.segment.id);
		for (const e of staying) stayingSegmentIds.push(e.segment.id);

		if (moving.length === 0) continue;

		if (staying.length === 0) {
			// Wholly on the far side: one parent-id update carries the entire subtree.
			moveColumns.push(column.id);
			continue;
		}

		// Straddles. Group the moving segments by their section, so each straddling section is
		// cloned once and its moving segments re-parented onto that clone.
		const bySection = new Map();
		for (const e of moving) {
			const list = bySection.get(e.section.id);
			if (list) list.segmentIds.push(e.segment.id);
			else bySection.set(e.section.id, { from: e.section, segmentIds: [e.segment.id] });
		}

		cloneColumns.push({ from: column, sections: [...bySection.values()] });
	}

	return { moveColumns, cloneColumns, movedSegmentIds, stayingSegmentIds };
}

/**
 * Plan the absorption of one passage's structure into another (Join Parts).
 *
 * Every column re-parents wholesale. There is no straddling case, because the two passages abut
 * rather than overlap — `planPartJoin()` refuses an overlapping boundary precisely so this stays
 * true, and `isBoundaryContiguous()` is the predicate that guarantees it.
 *
 * ⚠️ Nothing is merged, folded or deduplicated. The absorbed part's first column becomes an
 * ordinary column of the joined part, sitting after the target's own columns in word order. That
 * is deliberately *not* Join Column: Join Parts merges two ranges into one part, and silently
 * collapsing two columns into one would destroy a layout the user chose, in a command whose name
 * says nothing about columns.
 *
 * @param {Array} sourceTree - Loaded tree of the passage being absorbed
 * @returns {{ moveColumns: string[], movedSegmentIds: string[] }}
 */
export function planStructureMove(sourceTree) {
	const moveColumns = [];
	const movedSegmentIds = [];

	for (const column of sourceTree ?? []) {
		moveColumns.push(column.id);
		for (const entry of flatten([column])) movedSegmentIds.push(entry.segment.id);
	}

	return { moveColumns, movedSegmentIds };
}

/**
 * Decide what happens to each connection when a set of structure rows changes part.
 *
 * ## Why `studyId` alone gives the wrong answer, silently
 *
 * `segment_connection.study_id` is `notNull`, and `countTouchingConnections()` queries
 * `where(eq(segmentConnection.studyId, studyId))` (`passageJoin.js:212`). Once structure moves
 * between parts, a connection anchored to a moved row still names the *old* study — so that query
 * returns fewer rows than it should. §8 spells out the consequence: no error, `analyzeJoin()`
 * simply reports that no connections are affected, and the confirm modal tells the user so. A
 * confident, incorrect statement rather than a fault. Rewriting ownership here is what keeps that
 * query honest afterwards.
 *
 * ## Three outcomes, and the third is Q23's
 *
 * - **`unaffected`** — neither endpoint moved. Left completely alone.
 * - **`reown`** — BOTH endpoints moved. Still internal to one part, so it survives untouched
 *   apart from its owning ids.
 * - **`straddling`** — exactly one endpoint moved, so the connection now spans two parts, which
 *   `studyId` cannot represent. Q23's phase-2 strategy is (b): warn, listing them, then delete.
 *
 * This function does **not** delete anything, and that is the point. It returns the straddling
 * list so the caller can state the count *before* destroying anything — and phase 3's goal is (c),
 * edge stubs, which keeps these rows. Deciding their fate here would hard-code (b) into the layer
 * phase 3 has to change.
 *
 * `seriesId` is set on every surviving connection, not only cross-part ones: migration 0046 added
 * the column for exactly this, and populating it only in the interesting case would make "is this
 * connection in a series" un-queryable.
 *
 * @param {Array<Object>} connections - Candidate `segment_connection` rows
 * @param {Object} moved - Ids changing part: `{ segmentIds, sectionIds, columnIds }`
 * @param {Object} target - New owner: `{ studyId, seriesId }`
 * @returns {{
 *   reown: Array<{ id: string, studyId: string, seriesId: string|null }>,
 *   straddling: Object[],
 *   unaffected: Object[]
 * }}
 */
export function planConnectionOwnership(connections, moved, target) {
	const segmentIds = new Set(moved?.segmentIds ?? []);
	const sectionIds = new Set(moved?.sectionIds ?? []);
	const columnIds = new Set(moved?.columnIds ?? []);

	/**
	 * Did this end of the connection move?
	 *
	 * ⚠️ Reads the endpoint column matching that end's own `fromType`/`toType`, NOT all three.
	 * The two ends are independently typed — the schema comment says "so cross-type connections
	 * are possible" — and §8 makes this an explicit requirement for Q42: ownership "must say which
	 * of three `from*` columns is consulted". Testing all three would let a stale non-null id
	 * belonging to a different type decide the answer.
	 */
	const endMoved = (conn, end) => {
		const type = end === 'from' ? conn.fromType : conn.toType;
		if (type === 'section') {
			return sectionIds.has(end === 'from' ? conn.fromSectionId : conn.toSectionId);
		}
		if (type === 'column') {
			return columnIds.has(end === 'from' ? conn.fromColumnId : conn.toColumnId);
		}
		// 'segment' is the schema default, so it is also the fallback for a null/unknown type.
		return segmentIds.has(end === 'from' ? conn.fromSegmentId : conn.toSegmentId);
	};

	const reown = [];
	const straddling = [];
	const unaffected = [];

	for (const conn of connections ?? []) {
		const fromMoved = endMoved(conn, 'from');
		const toMoved = endMoved(conn, 'to');

		if (fromMoved && toMoved) {
			reown.push({ id: conn.id, studyId: target.studyId, seriesId: target.seriesId ?? null });
		} else if (fromMoved || toMoved) {
			straddling.push(conn);
		} else {
			unaffected.push(conn);
		}
	}

	return { reown, straddling, unaffected };
}
