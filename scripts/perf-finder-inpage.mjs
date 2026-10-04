/**
 * In-page Finder benchmark, shared by every browser driver in perf-finder.mjs.
 *
 * Must be self-contained: it is serialised with `toString()` and evaluated inside the browser,
 * so it may not close over anything in this module. Running the SAME function in Safari and
 * Chrome is what makes the two engines' numbers comparable.
 */
export const IN_PAGE = async function (email, password) {
	const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms = 30000) => {
		const t = performance.now();
		while (!fn()) {
			if (performance.now() - t > ms) throw new Error('timeout waiting for Finder rows');
			await wait(16);
		}
	};
	/** Worst gap between frames over `ms` — catches animation/layout jank after an interaction. */
	const worstFrameGap = async (ms) => {
		let last = performance.now();
		let worst = 0;
		const end = last + ms;
		while (performance.now() < end) {
			await new Promise((r) => requestAnimationFrame(r));
			const now = performance.now();
			worst = Math.max(worst, now - last);
			last = now;
		}
		return worst;
	};
	/**
	 * Main-thread cost of one interaction: the handler, Svelte's microtask-batched DOM update, and
	 * the style/layout that update forces. Deliberately NOT "time to next frame" — that is pinned
	 * to vsync (~16.7 ms) whenever the work fits in a frame, which hides every difference below it.
	 */
	let layoutDoc = document;
	const timed = async (fn) => {
		const t = performance.now();
		fn();
		for (let i = 0; i < 3; i++) await Promise.resolve();
		void layoutDoc.body.offsetHeight;
		return performance.now() - t;
	};
	const sum = (a) => a.reduce((x, y) => x + y, 0);
	const out = {};

	// Sign in from the page so the session cookie lands in this browser profile.
	const auth = await fetch('/api/auth/sign-in/email', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	if (!auth.ok) throw new Error('sign-in failed: ' + auth.status);

	// Server: the layout data the Finder is built from.
	{
		const t = performance.now();
		const res = await fetch('/dashboard/__data.json?x-sveltekit-invalidated=11');
		const text = await res.text();
		out.serverMs = performance.now() - t;
		out.serverKB = text.length / 1024;
	}

	// Initial render. An iframe keeps this script alive across the app's own navigation.
	const frame = document.createElement('iframe');
	frame.style.cssText =
		'position:fixed;inset:0;width:1400px;height:900px;border:0;z-index:99999;background:#fff';
	const t0 = performance.now();
	frame.src = '/dashboard';
	document.body.appendChild(frame);
	await until(() => frame.contentDocument?.querySelectorAll('[data-study-id]').length > 100);
	await nextFrame();
	out.initialMs = performance.now() - t0;
	const doc = frame.contentDocument;
	const win = frame.contentWindow;
	layoutDoc = doc;
	await wait(800);
	out.rows = doc.querySelectorAll(
		'[data-study-id], .group-select-button, .series-select-button'
	).length;

	const input = doc.querySelector('#search-studies');
	const setQuery = (v) => {
		input.value = v;
		input.dispatchEvent(new win.Event('input', { bubbles: true }));
	};

	// Search typing: one key at a time, each timed to the next painted frame.
	const keys = [];
	let q = '';
	for (const ch of 'romans') {
		q += ch;
		keys.push(await timed(() => setQuery(q)));
	}
	// Debounced implementations update after the last key, so wait for the result to settle and
	// include that in the total: the user's question is "how long until I see results".
	const tSettle = performance.now();
	await until(() => doc.querySelectorAll('[data-study-id]').length < out.rows, 5000).catch(() => {});
	await nextFrame();
	out.searchSettleMs = performance.now() - tSettle;
	out.searchTotalMs = sum(keys) + out.searchSettleMs;
	out.searchMaxKeyMs = Math.max(...keys);
	out.searchTailWorstFrameMs = await worstFrameGap(700);

	out.searchRows = doc.querySelectorAll('[data-study-id]').length;

	// Clear search: the whole tree comes back. Timed as main-thread work, then the animation tail.
	out.clearMs = await timed(() => setQuery(''));
	out.clearTailWorstFrameMs = await worstFrameGap(700);
	await wait(400);
	out.clearRows = doc.querySelectorAll('[data-study-id]').length;

	// Selection: meta-click 30 studies (meta → select only, no navigation).
	const buttons = [...doc.querySelectorAll('button[data-study-id]')].slice(0, 30);
	const sel = [];
	for (const b of buttons) {
		sel.push(
			await timed(() =>
				b.dispatchEvent(
					new win.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
				)
			)
		);
	}
	out.selectTotalMs = sum(sel);
	out.selectMaxMs = Math.max(...sel);

	// Arrow-key navigation.
	const container = doc.querySelector('.studies-container');
	const arrows = [];
	for (let i = 0; i < 60; i++) {
		arrows.push(
			await timed(() =>
				container.dispatchEvent(
					new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
				)
			)
		);
	}
	out.arrowsTotalMs = sum(arrows);

	frame.remove();
	return out;
};
