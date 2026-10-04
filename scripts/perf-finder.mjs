/**
 * Finder performance benchmark — Safari AND Chrome.
 *
 * Safari is where the Finder has historically hurt most, so it is a first-class target: driven
 * through `safaridriver` (W3C WebDriver, ships with macOS). Chrome is driven through the DevTools
 * protocol (no chromedriver needed). Both run the SAME in-page benchmark
 * (./perf-finder-inpage.mjs), so the numbers are comparable across engines.
 *
 * Prerequisites:
 *   1. `node scripts/perf-seed-finder.mjs`  (creates perf@expositor.dev + a large library)
 *   2. A running server, e.g. `npm run build:local && npm run preview:local` (port 4173)
 *   3. Safari › Settings › Developer › "Allow remote automation" (once)
 *
 * Usage:
 *   node scripts/perf-finder.mjs [--base http://localhost:4173] [--browsers safari,chrome] [--runs 3]
 *
 * Reports medians across runs. Times are ms from interaction to the next painted frame; the
 * `*TailWorstFrameMs` columns are the longest single frame in the 700 ms after an interaction
 * (animation / layout jank). `serverKB` is the size of the layout data the Finder is built from.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { IN_PAGE } from './perf-finder-inpage.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
	const i = args.indexOf(`--${n}`);
	return i === -1 ? d : args[i + 1];
};
const BASE = opt('base', 'http://localhost:4173');
const BROWSERS = opt('browsers', 'safari,chrome').split(',');
const RUNS = Number(opt('runs', 3));
const EMAIL = 'perf@expositor.dev';
const PASSWORD = 'PerfPass123!';
const SCRIPT = IN_PAGE.toString();

async function json(url, method = 'GET', body) {
	const res = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	return res.json();
}

async function runSafari() {
	const port = 4455;
	const proc = spawn('safaridriver', ['-p', String(port)], { stdio: 'ignore' });
	await sleep(1500);
	const wd = `http://localhost:${port}`;
	try {
		const s = await json(`${wd}/session`, 'POST', {
			capabilities: { alwaysMatch: { browserName: 'safari' } }
		});
		const id = s.value.sessionId;
		if (!id) throw new Error('safaridriver: ' + JSON.stringify(s.value));
		await json(`${wd}/session/${id}/timeouts`, 'POST', { script: 180000 });
		await json(`${wd}/session/${id}/window/rect`, 'POST', { width: 1440, height: 960 });
		const results = [];
		for (let r = 0; r < RUNS; r++) {
			await json(`${wd}/session/${id}/url`, 'POST', { url: `${BASE}/signin` });
			const res = await json(`${wd}/session/${id}/execute/async`, 'POST', {
				script: `const done = arguments[arguments.length - 1];
					(${SCRIPT})(arguments[0], arguments[1]).then(done, (e) => done({ error: String(e) }));`,
				args: [EMAIL, PASSWORD]
			});
			results.push(res.value);
		}
		await fetch(`${wd}/session/${id}`, { method: 'DELETE' });
		return results;
	} finally {
		proc.kill();
	}
}

async function runChrome() {
	const port = 9333;
	const proc = spawn(
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		[
			`--remote-debugging-port=${port}`,
			'--user-data-dir=/tmp/expositor-perf-chrome',
			'--no-first-run',
			'--no-default-browser-check',
			'--window-size=1440,960',
			'about:blank'
		],
		{ stdio: 'ignore' }
	);
	try {
		let target;
		for (let i = 0; i < 40 && !target; i++) {
			await sleep(250);
			try {
				const list = await json(`http://localhost:${port}/json/list`);
				target = list.find((t) => t.type === 'page');
			} catch {
				/* not up yet */
			}
		}
		if (!target) throw new Error('Chrome DevTools endpoint did not come up');
		const ws = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise((r) => ws.addEventListener('open', r, { once: true }));
		let seq = 0;
		const pending = new Map();
		ws.addEventListener('message', (m) => {
			const msg = JSON.parse(m.data);
			if (msg.id && pending.has(msg.id)) {
				pending.get(msg.id)(msg);
				pending.delete(msg.id);
			}
		});
		const send = (method, params = {}) =>
			new Promise((resolve) => {
				const id = ++seq;
				pending.set(id, resolve);
				ws.send(JSON.stringify({ id, method, params }));
			});
		await send('Page.enable');
		await send('Page.bringToFront');
		const results = [];
		for (let r = 0; r < RUNS; r++) {
			await send('Page.navigate', { url: `${BASE}/signin` });
			await sleep(2500);
			const res = await send('Runtime.evaluate', {
				expression: `(${SCRIPT})(${JSON.stringify(EMAIL)}, ${JSON.stringify(PASSWORD)}).catch(e => ({ error: String(e) }))`,
				awaitPromise: true,
				returnByValue: true
			});
			results.push(res.result?.result?.value ?? { error: JSON.stringify(res) });
		}
		ws.close();
		return results;
	} finally {
		proc.kill();
	}
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const report = {};
for (const b of BROWSERS) {
	console.log(`▶ ${b} (${RUNS} runs)…`);
	const runs = b === 'safari' ? await runSafari() : await runChrome();
	const errors = runs.filter((r) => !r || r.error);
	if (errors.length) console.log('  errors:', errors);
	const ok = runs.filter((r) => r && !r.error);
	if (!ok.length) continue;
	const agg = {};
	for (const k of Object.keys(ok[0])) agg[k] = +median(ok.map((r) => r[k])).toFixed(1);
	report[b] = agg;
}
console.table(report);
console.log(JSON.stringify(report));
