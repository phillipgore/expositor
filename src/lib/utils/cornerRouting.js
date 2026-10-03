/**
 * Obstacle-aware routing for cornered connection lines.
 *
 * Finds the shortest square (right-angle) route between two connection points
 * that never enters a passage box (inflated by a clearance margin), so a line
 * never crosses text or runs along a study border. Each end leaves straight
 * out of its side. An optional handle point steers the route: the line is
 * forced through the clear grid point nearest the handle (the handle picks
 * the lane; it can't push the line into text).
 *
 * Pure geometry — no DOM — so it can be unit-tested on its own.
 */

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds */
/** @typedef {'top'|'bottom'|'left'|'right'} Edge */

export const ROUTE_MARGIN = 10;
export const ROUTE_STUB = 20;
export const ROUTE_BEND_COST = 30;

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const OPP = [1, 0, 3, 2];

/** @param {Edge} edge @returns {number} 0:+x 1:-x 2:+y 3:-y */
function outDir(edge) {
	return edge === 'right' ? 0 : edge === 'left' ? 1 : edge === 'bottom' ? 2 : 3;
}

/** @param {Pt[]} pts @returns {Pt[]} */
function simplify(pts) {
	/** @type {Pt[]} */
	const out = [];
	for (const pt of pts) {
		const last = out[out.length - 1];
		if (last && Math.abs(pt.x - last.x) < 0.01 && Math.abs(pt.y - last.y) < 0.01) continue;
		out.push(pt);
	}
	for (let i = out.length - 2; i >= 1; i--) {
		const p0 = out[i - 1], p1 = out[i], p2 = out[i + 1];
		const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
		const dot = (p1.x - p0.x) * (p2.x - p1.x) + (p1.y - p0.y) * (p2.y - p1.y);
		if (Math.abs(cross) < 0.01 && dot > 0) out.splice(i, 1);
	}
	return out;
}

/**
 * @param {{ a: Pt, b: Pt, fromEdge: Edge, toEdge: Edge, obstacles: Box[], bounds: Bounds, handle?: Pt | null }} opts
 * @returns {{ pts: Pt[], handle: Pt } | null} null when no clear route exists
 */
export function routeCorner({ a, b, fromEdge, toEdge, obstacles, bounds, handle = null }) {
	const da = outDir(fromEdge), db = outDir(toEdge);
	const S = { x: a.x + DX[da] * ROUTE_STUB, y: a.y + DY[da] * ROUTE_STUB };
	const T = { x: b.x + DX[db] * ROUTE_STUB, y: b.y + DY[db] * ROUTE_STUB };
	const boxes = obstacles.map(o => ({
		x1: o.x - ROUTE_MARGIN, y1: o.y - ROUTE_MARGIN,
		x2: o.x + o.w + ROUTE_MARGIN, y2: o.y + o.h + ROUTE_MARGIN
	}));
	const E = 0.01;
	/** @param {number} x @param {number} y */
	const blocked = (x, y) => boxes.some(r => x > r.x1 + E && x < r.x2 - E && y > r.y1 + E && y < r.y2 - E);
	if (blocked(S.x, S.y) || blocked(T.x, T.y)) return null;

	// Grid lines: inflated box edges, stubs, the handle, the study bounds.
	const xsSet = new Set([S.x, T.x, bounds.minX, bounds.maxX]);
	const ysSet = new Set([S.y, T.y, bounds.minY, bounds.maxY]);
	for (const r of boxes) { xsSet.add(r.x1); xsSet.add(r.x2); ysSet.add(r.y1); ysSet.add(r.y2); }
	if (handle) { xsSet.add(handle.x); ysSet.add(handle.y); }
	const xs = [...xsSet].filter(v => (v >= bounds.minX - E && v <= bounds.maxX + E) || v === S.x || v === T.x).sort((m, n) => m - n);
	const ys = [...ysSet].filter(v => (v >= bounds.minY - E && v <= bounds.maxY + E) || v === S.y || v === T.y).sort((m, n) => m - n);
	const nx = xs.length, ny = ys.length, N = nx * ny;
	const free = new Uint8Array(N);
	for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) free[i * ny + j] = blocked(xs[i], ys[j]) ? 0 : 1;

	/** @param {number} i @param {number} j @param {number} d */
	const step = (i, j, d) => {
		const i2 = i + DX[d], j2 = j + DY[d];
		if (i2 < 0 || i2 >= nx || j2 < 0 || j2 >= ny || !free[i2 * ny + j2]) return -1;
		if (blocked((xs[i] + xs[i2]) / 2, (ys[j] + ys[j2]) / 2)) return -1;
		return i2 * ny + j2;
	};
	const sNode = xs.indexOf(S.x) * ny + ys.indexOf(S.y);
	const tNode = xs.indexOf(T.x) * ny + ys.indexOf(T.y);

	// The handle's lane: the free grid point nearest to where it was dropped.
	let hNode = -1;
	if (handle) {
		let bestD = Infinity;
		for (let k = 0; k < N; k++) {
			if (!free[k]) continue;
			const d = Math.abs(xs[Math.floor(k / ny)] - handle.x) + Math.abs(ys[k % ny] - handle.y);
			if (d < bestD) { bestD = d; hNode = k; }
		}
	}

	return search({ a, b, xs, ys, N, ny, step, sNode, tNode, hNode, da, db });
}

/** Binary min-heap of (key, value) pairs. */
class Heap {
	constructor() { /** @type {number[]} */ this.k = []; /** @type {number[]} */ this.v = []; }
	get size() { return this.k.length; }
	/** @param {number} key @param {number} val */
	push(key, val) {
		const { k, v } = this;
		let n = k.length; k.push(key); v.push(val);
		while (n > 0) { const p = (n - 1) >> 1; if (v[p] <= val) break; k[n] = k[p]; v[n] = v[p]; n = p; }
		k[n] = key; v[n] = val;
	}
	pop() {
		const { k, v } = this;
		const top = k[0];
		const lk = /** @type {number} */ (k.pop()), lv = /** @type {number} */ (v.pop());
		if (k.length) {
			let n = 0; const len = k.length;
			for (;;) {
				let c = 2 * n + 1; if (c >= len) break;
				if (c + 1 < len && v[c + 1] < v[c]) c++;
				if (v[c] >= lv) break;
				k[n] = k[c]; v[n] = v[c]; n = c;
			}
			k[n] = lk; v[n] = lv;
		}
		return top;
	}
}

/**
 * Dijkstra over (grid node, heading, phase); phase 1 = already passed the
 * handle's lane point. Cost = length + a penalty per bend; no U-turns.
 * @param {{ a: Pt, b: Pt, xs: number[], ys: number[], N: number, ny: number, step: (i: number, j: number, d: number) => number, sNode: number, tNode: number, hNode: number, da: number, db: number }} g
 * @returns {{ pts: Pt[], handle: Pt } | null}
 */
function search({ a, b, xs, ys, N, ny, step, sNode, tNode, hNode, da, db }) {
	const phases = hNode >= 0 ? 2 : 1;
	const dist = new Float64Array(N * 4 * phases).fill(Infinity);
	const prev = new Int32Array(N * 4 * phases).fill(-1);
	const st = (/** @type {number} */ node, /** @type {number} */ d, /** @type {number} */ ph) => (ph * N + node) * 4 + d;
	const heap = new Heap();
	const s0 = st(sNode, da, hNode === sNode ? 1 : 0);
	dist[s0] = 0; heap.push(s0, 0);
	const arrive = OPP[db];
	const goalPh = phases - 1;
	let goal = -1;
	while (heap.size) {
		const cur = heap.pop();
		const d0 = dist[cur];
		const dir = cur % 4, node = Math.floor(cur / 4) % N, ph = Math.floor(cur / 4 / N);
		if (node === tNode && ph === goalPh) {
			if (dir === arrive) { goal = cur; break; }
			// Turning toward b at T (not a U-turn back the way we came).
			if (dir !== db) {
				const fin = st(tNode, arrive, ph);
				const fc = d0 + ROUTE_BEND_COST;
				if (fc < dist[fin]) { dist[fin] = fc; prev[fin] = cur; heap.push(fin, fc); }
			}
			continue;
		}
		const i = Math.floor(node / ny), j = node % ny;
		for (let nd = 0; nd < 4; nd++) {
			if (nd === OPP[dir]) continue;
			const n2 = step(i, j, nd);
			if (n2 < 0) continue;
			const ph2 = ph === 0 && n2 === hNode ? 1 : ph;
			const k2 = st(n2, nd, ph2);
			const c = d0 + Math.abs(xs[Math.floor(n2 / ny)] - xs[i]) + Math.abs(ys[n2 % ny] - ys[j])
				+ (nd === dir ? 0 : ROUTE_BEND_COST);
			if (c < dist[k2]) { dist[k2] = c; prev[k2] = cur; heap.push(k2, c); }
		}
	}
	if (goal < 0) return null;
	/** @type {Pt[]} */
	const mid = [];
	for (let k = goal; k >= 0; k = prev[k]) {
		const node = Math.floor(k / 4) % N;
		mid.push({ x: xs[Math.floor(node / ny)], y: ys[node % ny] });
	}
	mid.reverse();
	const pts = simplify([a, ...mid, b]);

	// Handle: at its lane point if placed, else the middle of the longest run.
	/** @type {Pt} */
	let h = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	if (hNode >= 0) h = { x: xs[Math.floor(hNode / ny)], y: ys[hNode % ny] };
	else {
		let best = 0;
		for (let k = 1; k < pts.length; k++) {
			const len = Math.abs(pts[k].x - pts[k - 1].x) + Math.abs(pts[k].y - pts[k - 1].y);
			if (len > best) { best = len; h = { x: (pts[k].x + pts[k - 1].x) / 2, y: (pts[k].y + pts[k - 1].y) / 2 }; }
		}
	}
	return { pts, handle: h };
}
