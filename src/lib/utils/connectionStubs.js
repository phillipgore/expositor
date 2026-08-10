/**
 * # Cross-part connections as edge stubs (SERIES_PLAN §8 strategy (c), phase 3)
 *
 * Phase 2 shipped Q23 strategy **(b)**: a connection whose endpoints end up in different parts is
 * reported and then deleted, with the count shown before the user confirms. Honest, and destructive.
 * This is strategy **(c)** — the phase-3 goal: keep the connection, scoped to the series, and render a
 * stub at the edge of the part that still holds an endpoint ("continues in Part 4").
 *
 * §8 calls (c) "arguably the feature's best justification: cross-chapter connections are precisely what
 * a Romans series wants." Under (b) a user who splits Romans at chapter 8 silently loses the links they
 * drew across that seam — the very links that motivated making it a series.
 *
 * ## Why no migration is needed
 *
 * `segmentConnection.seriesId` already exists (migration `0046`), added for exactly this and described
 * in §8 as "so (c) needs no second migration". Q42 settled the semantics: `studyId` stays `.notNull()`
 * and names the part that **owns** the row; `seriesId` records that the connection belongs to a series
 * and may therefore reach outside that part. So a cross-part connection is representable today.
 *
 * ## What a stub is, and what it is not
 *
 * A stub is **not** a connection to something off-screen — there is no geometry for that. It is a short
 * arc from the endpoint that IS present, ending in a labelled marker at the edge of the canvas, plus the
 * name of the part the other end lives in. §4 forbids re-deriving `seriesOrder`, so the label uses the
 * part's position in the user's own arrangement.
 *
 * ⚠️ Authoring a cross-part connection remains impossible, and that is unchanged by this module. Q42:
 * "two parts are never on screen together, so there is no gesture that can express a cross-part link
 * and no geometry to draw it with." Stubs *render* rows that a boundary move produced; they do not
 * enable drawing new ones.
 *
 * @module connectionStubs
 */

/**
 * Which endpoint of a connection lies inside the given part, if only one does.
 *
 * Reads the endpoint column matching that end's own `fromType`/`toType`, never all three. §8 makes this
 * an explicit requirement: the two ends are independently typed ("so cross-type connections are
 * possible"), so consulting the wrong column would let a stale id of another type decide the answer.
 *
 * @param {Object} connection
 * @param {'from'|'to'} end
 * @returns {{ type: 'segment'|'section'|'column', id: string|null }}
 */
export function endpointOf(connection, end) {
	const type = (end === 'from' ? connection?.fromType : connection?.toType) || 'segment';
	if (type === 'section') {
		return {
			type,
			id: (end === 'from' ? connection?.fromSectionId : connection?.toSectionId) ?? null
		};
	}
	if (type === 'column') {
		return {
			type,
			id: (end === 'from' ? connection?.fromColumnId : connection?.toColumnId) ?? null
		};
	}
	return {
		type,
		id: (end === 'from' ? connection?.fromSegmentId : connection?.toSegmentId) ?? null
	};
}

/**
 * Classify each connection against the structure ids present in the part being rendered.
 *
 * Three outcomes, and the middle one is what phase 3 adds:
 *
 * - **`local`** — both endpoints are present. Rendered as a normal arc, exactly as before.
 * - **`stub`** — one endpoint is present and the other is not. Rendered as an edge stub, labelled with
 *   the part holding the absent end.
 * - **`foreign`** — neither endpoint is present. Not rendered at all: the row belongs to some other
 *   pair of parts entirely, and drawing a stub for it would put a marker on a page with nothing to
 *   attach it to.
 *
 * ⚠️ `foreign` exists because the connection query is by `studyId`, which is only *one* of the two
 * parts a cross-part connection touches. The part at the other end holds no row naming it, so phase 3
 * must widen that query to the series — and once widened, it returns rows belonging to parts that are
 * neither end. Without this third case those would be drawn as stubs on every part of the series.
 *
 * @param {Array<Object>} connections
 * @param {Set<string>|Array<string>} presentIds - Every column/section/segment id mounted in this part
 * @returns {{ local: Object[], stubs: Array<{ connection: Object, presentEnd: 'from'|'to', absentEnd: 'from'|'to' }>, foreign: Object[] }}
 */
export function classifyConnections(connections, presentIds) {
	const present = presentIds instanceof Set ? presentIds : new Set(presentIds ?? []);

	const local = [];
	/**
	 * Annotated because the literals otherwise widen to `string` and no longer satisfy the documented
	 * union — the same inference svelte-check caught in `boundaryMove.js`.
	 * @type {Array<{ connection: Object, presentEnd: 'from'|'to', absentEnd: 'from'|'to' }>}
	 */
	const stubs = [];
	const foreign = [];

	for (const connection of connections ?? []) {
		const from = endpointOf(connection, 'from');
		const to = endpointOf(connection, 'to');
		const fromHere = Boolean(from.id) && present.has(from.id);
		const toHere = Boolean(to.id) && present.has(to.id);

		if (fromHere && toHere) {
			local.push(connection);
		} else if (fromHere) {
			stubs.push({ connection, presentEnd: 'from', absentEnd: 'to' });
		} else if (toHere) {
			stubs.push({ connection, presentEnd: 'to', absentEnd: 'from' });
		} else {
			foreign.push(connection);
		}
	}

	return { local, stubs, foreign };
}

/**
 * Label for a stub, naming the part its absent end lives in.
 *
 * §8's sketch is "continues in Part 4", and the number is the part's position in the user's own
 * arrangement — §4 forbids re-deriving `seriesOrder`, so position is taken from the ordered list rather
 * than computed from the ranges. The part's title is included when it has one, because "Part 4" alone is
 * unhelpful in a series whose parts are named for their passages.
 *
 * Returns a generic label when the part cannot be identified rather than omitting the stub: the arc is
 * still true — something does continue off this page — and a stub with a vague label is more honest than
 * silently dropping a connection the user drew, which is what phase 2's behaviour amounted to.
 *
 * @param {Object} params
 * @param {Array<{ id: string, title?: string|null }>} params.orderedParts - Parts in `seriesOrder`
 * @param {string|null} params.partId - The part holding the absent endpoint
 * @returns {string}
 */
export function stubLabel({ orderedParts, partId }) {
	const parts = orderedParts ?? [];
	const index = parts.findIndex((part) => part.id === partId);
	if (index === -1) return 'Continues in another part';

	const position = index + 1;
	const title = parts[index]?.title;
	return title ? `Continues in Part ${position}: ${title}` : `Continues in Part ${position}`;
}

/**
 * Map every structure id in a series to the part that owns it.
 *
 * Needed because a stub knows only the id of its absent endpoint; naming the part requires the reverse
 * lookup. Built once per render from data the study layout already loads for its own purposes.
 *
 * @param {Array<{ id: string, columns?: Array<Object> }>} partsWithStructure
 * @returns {Map<string, string>} structure id → part id
 */
export function buildOwnershipIndex(partsWithStructure) {
	const index = new Map();

	for (const part of partsWithStructure ?? []) {
		for (const column of part.columns ?? []) {
			index.set(column.id, part.id);
			for (const section of column.sections ?? []) {
				index.set(section.id, part.id);
				for (const segment of section.segments ?? []) {
					index.set(segment.id, part.id);
				}
			}
		}
	}

	return index;
}
