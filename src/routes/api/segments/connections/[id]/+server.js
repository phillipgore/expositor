import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { segmentConnection, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, inArray } from 'drizzle-orm';
import { resolveStructureOwners } from '$lib/server/db/structureOwners.js';

const VALID_TYPES = ['segment', 'section', 'column'];
const VALID_LINE_ROUTES = ['curved', 'straight', 'cornered'];
/** Sides a connection point may sit on, per element type (mirrors ConnectionsOverlay). */
const ALLOWED_ANCHOR_EDGES = {
	column: ['top'],
	section: ['top', 'bottom'],
	segment: ['left', 'right']
};
// 'gray' (default, stored as NULL), 'mixed' (fade between the ends' colors), or
// any of the eight named colors as a solid line color.
const VALID_LINE_COLORS = ['gray', 'mixed', 'red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'];
/** Handle placement range (fractions of chord length) — mirrors ConnectionsOverlay. */
const CORNER_ALONG_MIN = -3;
const CORNER_ALONG_MAX = 4;
const CORNER_PERP_MAX = 3;

/**
 * Get a single connection record (including commentary).
 * @type {import('./$types').RequestHandler}
 */
export const GET = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const connectionId = params.id;
		if (!connectionId) {
			return json({ error: 'Missing connection ID' }, { status: 400 });
		}

		const connectionResult = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.id, connectionId))
			.limit(1);

		if (connectionResult.length === 0) {
			return json({ error: 'Connection not found' }, { status: 404 });
		}

		const connection = connectionResult[0];

		// Verify ownership
		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, connection.studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Not authorized to view this connection' }, { status: 403 });
		}

		return json(connection, { status: 200 });
	} catch (error) {
		console.error('Get connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Reroute one end of a connection (drag-and-drop) and/or update commentary.
 *
 * Each end (from / to) is updated independently.
 * Only the fields for the updated end change — the other end is preserved exactly.
 * This allows cross-type connections: e.g. fromType='segment', toType='section'.
 *
 * Body (update the FROM end):
 *   { fromType: 'section', fromSectionId: '<id>' }
 *
 * Body (update the TO end):
 *   { toType: 'column', toColumnId: '<id>' }
 *
 * Both ends can be updated simultaneously if needed:
 *   { fromType: 'segment', fromSegmentId: '<id>', toType: 'column', toColumnId: '<id>' }
 *
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const connectionId = params.id;
		if (!connectionId) {
			return json({ error: 'Missing connection ID' }, { status: 400 });
		}

		const body = await request.json();

		// Check what the caller wants to update
		const updatingFrom      = 'fromType' in body || 'fromSegmentId' in body || 'fromSectionId' in body || 'fromColumnId' in body;
		const updatingTo        = 'toType'   in body || 'toSegmentId'   in body || 'toSectionId'   in body || 'toColumnId'   in body;
		const updatingCommentary = 'commentary' in body;
		const updatingNote       = 'note' in body;
		const updatingNotePlacement =
			'noteAnchorSide' in body || 'noteAnchorT' in body || 'noteOffset' in body || 'noteLead' in body;

		const updatingLineRoute = 'lineRoute' in body;
		const updatingBend = 'bendAlong' in body || 'bendPerp' in body;
		const updatingLineColor = 'lineColor' in body;
		const updatingAnchors =
			'fromAnchorEdge' in body || 'fromAnchorPos' in body || 'toAnchorEdge' in body || 'toAnchorPos' in body;

		if (!updatingFrom && !updatingTo && !updatingCommentary && !updatingNote && !updatingNotePlacement && !updatingLineRoute && !updatingBend && !updatingLineColor && !updatingAnchors) {
			return json({ error: 'Must provide at least one field to update (from*, to*, note, noteAnchorSide, noteAnchorT, noteOffset, noteLead, lineRoute, bendAlong, bendPerp, lineColor, fromAnchorEdge/Pos, toAnchorEdge/Pos, or commentary)' }, { status: 400 });
		}

		if (updatingLineColor && body.lineColor !== null && !VALID_LINE_COLORS.includes(body.lineColor)) {
			return json({ error: `Invalid lineColor: must be one of ${VALID_LINE_COLORS.join(', ')}, or null` }, { status: 400 });
		}

		for (const key of ['bendAlong', 'bendPerp']) {
			if (key in body && body[key] !== null && (typeof body[key] !== 'number' || !Number.isFinite(body[key]))) {
				return json({ error: `Invalid ${key}: must be a number or null` }, { status: 400 });
			}
		}

		if (updatingLineRoute && body.lineRoute !== null && !VALID_LINE_ROUTES.includes(body.lineRoute)) {
			return json({ error: "Invalid lineRoute: must be 'curved', 'straight', 'cornered', or null" }, { status: 400 });
		}


		// Validate types if provided
		if (body.fromType && !VALID_TYPES.includes(body.fromType)) {
			return json({ error: 'Invalid fromType' }, { status: 400 });
		}
		if (body.toType && !VALID_TYPES.includes(body.toType)) {
			return json({ error: 'Invalid toType' }, { status: 400 });
		}

		// Fetch the existing connection
		const connectionResult = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.id, connectionId))
			.limit(1);

		if (connectionResult.length === 0) {
			return json({ error: 'Connection not found' }, { status: 404 });
		}

		const connection = connectionResult[0];

		// Verify ownership
		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, connection.studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Not authorized to update this connection' }, { status: 403 });
		}

		// ── Build the update object ────────────────────────────────────────────
		// Strategy: start from the current connection values, then apply only
		// the fields the caller provided.  Each end is handled independently.
		const updates = { updatedAt: new Date() };

		// Note update (independent of rerouting)
		if (updatingNote) {
			if (body.note !== null && typeof body.note !== 'string') {
				return json({ error: 'Invalid note: must be a string or null' }, { status: 400 });
			}
			updates.note = body.note ?? null;
		}

		// Note placement update (independent of rerouting) — manual card placement.
		if (updatingNotePlacement) {
			if ('noteAnchorSide' in body) {
				const side = body.noteAnchorSide;
				if (side !== null && !['top', 'right', 'bottom', 'left'].includes(side)) {
					return json({ error: "Invalid noteAnchorSide: must be 'top', 'right', 'bottom', 'left', or null" }, { status: 400 });
				}
				updates.noteAnchorSide = side ?? null;
			}
			if ('noteAnchorT' in body) {
				const t = body.noteAnchorT;
				if (t !== null && (typeof t !== 'number' || Number.isNaN(t))) {
					return json({ error: 'Invalid noteAnchorT: must be a number or null' }, { status: 400 });
				}
				// Clamp to the valid 0..1 range.
				updates.noteAnchorT = t === null ? null : Math.min(1, Math.max(0, t));
			}
			if ('noteOffset' in body) {
				const off = body.noteOffset;
				if (off !== null && (typeof off !== 'number' || Number.isNaN(off))) {
					return json({ error: 'Invalid noteOffset: must be a number or null' }, { status: 400 });
				}
				updates.noteOffset = off === null ? null : Math.round(off);
			}
			if ('noteLead' in body) {
				const lead = body.noteLead;
				if (lead !== null && (typeof lead !== 'number' || Number.isNaN(lead))) {
					return json({ error: 'Invalid noteLead: must be a number or null' }, { status: 400 });
				}
				// Lead is an unsigned distance OFF the line; clamp negatives to 0.
				updates.noteLead = lead === null ? null : Math.max(0, Math.round(lead));
			}
		}


		// Line route (curved / straight / cornered). 'curved' is stored as NULL so
		// the default stays the single source of truth for unstyled rows.
		if (updatingLineRoute) {
			updates.lineRoute = body.lineRoute === 'curved' ? null : (body.lineRoute ?? null);
			// A new route starts from its automatic shape — a bend made for one
			// route means nothing for another. (Overridden below when the same
			// request also sets a bend, e.g. dragging a straight line into a curve.)
			updates.bendAlong = null;
			updates.bendPerp = null;
		}

		// Line color. 'gray' is the default and is stored as NULL.
		if (updatingLineColor) {
			updates.lineColor = body.lineColor === 'gray' ? null : (body.lineColor ?? null);
		}

		// Manual line shape (shaping handle). Stored relative to the chord; clamped
		// so a stray value can't fling the line across the canvas.
		// The handle is placed freely (curved and cornered alike): anywhere around
		// either end. This range only stops absurd values.
		const [alongMin, alongMax] = [CORNER_ALONG_MIN, CORNER_ALONG_MAX];
		const perpMax = CORNER_PERP_MAX;
		if ('bendAlong' in body) {
			updates.bendAlong = body.bendAlong === null ? null : Math.min(alongMax, Math.max(alongMin, body.bendAlong));
		}
		if ('bendPerp' in body) {
			updates.bendPerp = body.bendPerp === null ? null : Math.min(perpMax, Math.max(-perpMax, body.bendPerp));
		}

		// Commentary update (independent of rerouting)
		if (updatingCommentary) {
			if (body.commentary !== null && typeof body.commentary !== 'string') {
				return json({ error: 'Invalid commentary: must be a string or null' }, { status: 400 });
			}
			updates.commentary = body.commentary ?? null;
		}

		if (updatingFrom) {
			const newFromType = body.fromType ?? connection.fromType;

			if (!VALID_TYPES.includes(newFromType)) {
				return json({ error: 'Invalid fromType' }, { status: 400 });
			}

			updates.fromType = newFromType;

			// Set the correct ID for the new from type; clear the others
			updates.fromSegmentId = newFromType === 'segment'
				? (body.fromSegmentId ?? (connection.fromType === 'segment' ? connection.fromSegmentId : null))
				: null;
			updates.fromSectionId = newFromType === 'section'
				? (body.fromSectionId ?? (connection.fromType === 'section' ? connection.fromSectionId : null))
				: null;
			updates.fromColumnId  = newFromType === 'column'
				? (body.fromColumnId  ?? (connection.fromType === 'column'  ? connection.fromColumnId  : null))
				: null;
		}

		if (updatingTo) {
			const newToType = body.toType ?? connection.toType;

			if (!VALID_TYPES.includes(newToType)) {
				return json({ error: 'Invalid toType' }, { status: 400 });
			}

			updates.toType = newToType;

			// Set the correct ID for the new to type; clear the others
			updates.toSegmentId = newToType === 'segment'
				? (body.toSegmentId ?? (connection.toType === 'segment' ? connection.toSegmentId : null))
				: null;
			updates.toSectionId = newToType === 'section'
				? (body.toSectionId ?? (connection.toType === 'section' ? connection.toSectionId : null))
				: null;
			updates.toColumnId  = newToType === 'column'
				? (body.toColumnId  ?? (connection.toType === 'column'  ? connection.toColumnId  : null))
				: null;
		}

		// ── User-placed connection points ─────────────────────────────────────
		// An end's saved spot belongs to its element. If the end is re-anchored to
		// a DIFFERENT element without a new spot, fall back to automatic placement.
		for (const end of /** @type {const} */ (['from', 'to'])) {
			const typeKey = `${end}Type`;
			const idKeys = [`${end}SegmentId`, `${end}SectionId`, `${end}ColumnId`];
			const moved =
				(typeKey in updates && updates[typeKey] !== connection[typeKey]) ||
				idKeys.some((k) => k in updates && updates[k] !== connection[k]);
			if (moved) {
				updates[`${end}AnchorEdge`] = null;
				updates[`${end}AnchorPos`] = null;
			}
		}
		for (const end of /** @type {const} */ (['from', 'to'])) {
			const edgeKey = `${end}AnchorEdge`;
			const posKey = `${end}AnchorPos`;
			if (!(edgeKey in body) && !(posKey in body)) continue;
			const edge = body[edgeKey] ?? null;
			const pos = body[posKey] ?? null;
			if (edge === null || pos === null) {
				// Clearing (either value null) → back to automatic.
				updates[edgeKey] = null;
				updates[posKey] = null;
				continue;
			}
			// The edge must be one the end's element type allows.
			const endType = updates[`${end}Type`] ?? connection[`${end}Type`];
			if (!(ALLOWED_ANCHOR_EDGES[endType] ?? []).includes(edge)) {
				return json({ error: `Invalid ${edgeKey} '${edge}' for a ${endType} end` }, { status: 400 });
			}
			if (typeof pos !== 'number' || !Number.isFinite(pos)) {
				return json({ error: `Invalid ${posKey}: must be a number or null` }, { status: 400 });
			}
			updates[edgeKey] = edge;
			updates[posKey] = Math.min(1, Math.max(0, pos));
		}

		// ── Ends that moved: series scope, owning part, duplicates ────────────
		// A cross-part line (or a line dragged in Focus across parts) can land on an
		// item in ANY part of the same series. Both ends must resolve to parts of
		// that series owned by this user; the row is owned by the FROM end's part and
		// keeps series_id only while its ends really are in different parts.
		if (updatingFrom || updatingTo) {
			/** @param {'from'|'to'} end */
			const endRef = (end) => {
				const type = updates[`${end}Type`] ?? connection[`${end}Type`] ?? 'segment';
				const key = type === 'segment' ? `${end}SegmentId` : type === 'section' ? `${end}SectionId` : `${end}ColumnId`;
				return { type, id: key in updates ? updates[key] : connection[key] };
			};
			const f = endRef('from'), t = endRef('to');
			if (!f.id || !t.id) return json({ error: 'Connection endpoint missing' }, { status: 400 });
			if (f.type === t.type && f.id === t.id) {
				return json({ error: 'Cannot connect an element to itself' }, { status: 400 });
			}
			const owners = await resolveStructureOwners(db, [f.id, t.id]);
			const fromPart = owners[f.id], toPart = owners[t.id];
			if (!fromPart || !toPart) return json({ error: 'Connection endpoint not found' }, { status: 400 });
			const homeSeries = studyResult[0].seriesId ?? null;
			if (fromPart !== connection.studyId || toPart !== connection.studyId) {
				// Leaving the current part is only allowed within its series.
				if (!homeSeries) return json({ error: 'Both ends must be in this study' }, { status: 403 });
				const parts = await db
					.select({ id: study.id })
					.from(study)
					.where(and(eq(study.seriesId, homeSeries), eq(study.userId, session.user.id), inArray(study.id, [fromPart, toPart])));
				const ok = new Set(parts.map((p) => p.id));
				if (!ok.has(fromPart) || !ok.has(toPart)) {
					return json({ error: 'Both ends must be in parts of this series' }, { status: 403 });
				}
			}
			updates.studyId = fromPart;
			updates.seriesId = fromPart !== toPart ? homeSeries : null;

			// No two connections between the same pair of items (either direction,
			// in any part of the series).
			const ids = [f.id, t.id];
			const others = await db
				.select()
				.from(segmentConnection)
				.where(inArray(segmentConnection.studyId, [...new Set([fromPart, toPart])]));
			/** @param {any} c @param {'from'|'to'} end */
			const refOf = (c, end) => {
				const type = c[`${end}Type`] ?? 'segment';
				return { type, id: type === 'segment' ? c[`${end}SegmentId`] : type === 'section' ? c[`${end}SectionId`] : c[`${end}ColumnId`] };
			};
			const same = (/** @type {any} */ a, /** @type {any} */ b) => a.type === b.type && a.id === b.id;
			const dup = others.some((c) => {
				if (c.id === connectionId) return false;
				const a = refOf(c, 'from'), b = refOf(c, 'to');
				if (!ids.includes(a.id) || !ids.includes(b.id)) return false;
				return (same(a, f) && same(b, t)) || (same(a, t) && same(b, f));
			});
			if (dup) return json({ error: 'These items are already connected' }, { status: 409 });
		}

		const [updated] = await db
			.update(segmentConnection)
			.set(updates)
			.where(eq(segmentConnection.id, connectionId))
			.returning();

		return json(updated, { status: 200 });
	} catch (error) {
		console.error('Patch connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Delete a connection.
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const connectionId = params.id;
		if (!connectionId) {
			return json({ error: 'Missing connection ID' }, { status: 400 });
		}

		const connectionResult = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.id, connectionId))
			.limit(1);

		if (connectionResult.length === 0) {
			return json({ error: 'Connection not found' }, { status: 404 });
		}

		const connection = connectionResult[0];

		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, connection.studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Not authorized to delete this connection' }, { status: 403 });
		}

		await db.delete(segmentConnection).where(eq(segmentConnection.id, connectionId));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Delete connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
