/**
 * One-time conversion: segment heights OUTER → TEXT-AREA.
 *
 * Saved segment heights used to be the whole segment (headings + reference + quick
 * note + text). They are now the text area only. This script converts existing
 * values so layouts look identical after upgrading.
 *
 * HOW TO RUN (once per study that has set heights):
 *   1. Check out / run the build from BEFORE the text-height change (heights are
 *      still applied as min-height on `.segment`).
 *   2. Open the study's Analyze view. Turn OFF Overview mode. Turn ON Headings,
 *      Quick Notes and References (show everything).
 *   3. Open DevTools → Console, paste this whole file, press Enter.
 *      It runs as a DRY RUN and prints a table of old → new values.
 *   4. If the table looks right run:   await convertSegmentHeights({ dryRun: false })
 *   5. Repeat for each study, then deploy the new build.
 *
 * Linked groups store (old − the group's LARGEST chrome) on every member, matching
 * how the new code equalizes linked segments.
 *
 * Safety: segments whose inline min-height is on `.text` (already converted / new
 * build) are skipped, so running it twice does nothing harmful.
 */
async function convertSegmentHeights({ dryRun = true } = {}) {
	const segments = [...document.querySelectorAll('.segment[data-segment-id]')];

	const rows = [];
	for (const el of segments) {
		const text = el.querySelector(':scope > .text');
		if (!text) continue;
		if (text.style.minHeight) continue; // already on the new model
		const old = parseFloat(el.style.minHeight);
		if (!Number.isFinite(old) || old <= 0) continue; // no saved height
		rows.push({
			id: el.getAttribute('data-segment-id'),
			groupId: el.getAttribute('data-height-group-id') || null,
			old: Math.round(old),
			// Outer = chrome + text (text flex-fills), so this is exact.
			chrome: Math.max(0, el.offsetHeight - text.offsetHeight)
		});
	}

	if (rows.length === 0) {
		console.log('No segments with a saved outer height found on this page.');
		return [];
	}

	const groupMax = new Map();
	for (const r of rows) {
		if (r.groupId) groupMax.set(r.groupId, Math.max(groupMax.get(r.groupId) ?? 0, r.chrome));
	}
	for (const r of rows) {
		const chrome = r.groupId ? groupMax.get(r.groupId) : r.chrome;
		r.new = Math.max(1, Math.round(r.old - chrome));
	}

	console.table(rows);

	if (dryRun) {
		console.log(
			`DRY RUN — ${rows.length} segment(s). Run: await convertSegmentHeights({ dryRun: false })`
		);
		return rows;
	}

	const byValue = new Map();
	for (const r of rows) {
		if (!byValue.has(r.new)) byValue.set(r.new, []);
		byValue.get(r.new).push(r.id);
	}
	for (const [height, ids] of byValue) {
		const res = await fetch('/api/segments/batch-height', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, height })
		});
		if (!res.ok) {
			console.error('Failed for', ids, await res.text());
			return rows;
		}
	}
	console.log(`Converted ${rows.length} segment height(s). Reload once on the new build to verify.`);
	return rows;
}

convertSegmentHeights();
