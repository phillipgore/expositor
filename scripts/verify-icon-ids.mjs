/**
 * Verify every `iconId` referenced in a component exists in `icons.json`.
 *
 * ## Why this exists
 *
 * I shipped `iconId="sort"` into the series menu. There is no `sort` icon. The button rendered with no
 * glyph — and NOTHING caught it: `svelte-check` sees a valid string prop, the build succeeds, and the
 * verifiers never touch Svelte markup. Only opening the menu and looking would have revealed it.
 *
 * That is the "check that reports success because it never ran" pattern COMPLIANCE.md §1.8 records,
 * transposed to assets: the failure is silent, cosmetic, and invisible to every automated gate. So the
 * gate is added here rather than left to code review.
 *
 * It scans the whole component tree, not just the series work, because the defect class is not specific
 * to this feature.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
let fail = 0;

const icons = JSON.parse(readFileSync('src/lib/data/icons.json', 'utf8'));
// `icons.json` is an ARRAY of `{ _id, viewBox, d }` — not an object keyed by name. My first check used
// `'sort' in icons`, which is meaningless against an array and reported every icon as missing. Reading
// the real shape is the point of the decisions log's "read the source" rule.
const known = new Set(icons.map((icon) => icon._id));

/** Every .svelte file under src/. */
function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else if (entry.endsWith('.svelte')) out.push(path);
	}
	return out;
}

console.log(`\nicons.json declares ${known.size} icons.\n`);
console.log('── every literal iconId in the component tree resolves ──');

const missing = [];
for (const file of walk('src')) {
	// Strip comments first. The three hits this initially reported in Toolbar.svelte were `iconId="menu"`
	// and friends inside JSDoc USAGE EXAMPLES — illustrative markup, not live, and renaming an icon
	// should not be blocked by prose. A verifier that cries wolf gets muted, which is worse than silence.
	const source = readFileSync(file, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
	// Literal values only. A dynamic `iconId={expr}` cannot be resolved statically, and asserting on
	// something unresolvable would be theatre.
	for (const match of source.matchAll(/iconId\s*=\s*["']([^"']+)["']/g)) {
		if (!known.has(match[1])) missing.push(`${file}: "${match[1]}"`);
	}
}

if (missing.length === 0) {
	pass += 1;
	console.log('  ✓ no component references an icon that does not exist');
} else {
	fail += 1;
	console.log('  ✗ components reference icons absent from icons.json:');
	for (const entry of missing) console.log(`      ${entry}`);
}

console.log('\n── no icon id is declared twice ──');
//
// A duplicate `_id` is invisible in every way that matters. `icons.json` stays valid JSON, the id
// resolves, `known.has()` above is satisfied, the build succeeds, and the button renders — just with
// the WRONG artwork, because `Icon.svelte` resolves via `.find()` and silently keeps the FIRST match.
// The second declaration is dead weight that looks live.
//
// This happened: placeholder `join-up` / `join-down` entries were added mid-file while the real
// artwork was appended at the end, and the placeholders won. The file looked correct at the point a
// reader would check (the bottom), which is what makes it worth a gate rather than a convention.
const seen = new Set();
const duplicates = new Set();
for (const icon of icons) {
	if (seen.has(icon._id)) duplicates.add(icon._id);
	seen.add(icon._id);
}

if (duplicates.size === 0) {
	pass += 1;
	console.log(`  ✓ all ${known.size} ids are unique`);
} else {
	fail += 1;
	console.log('  ✗ icons.json declares these ids more than once (only the FIRST is ever rendered):');
	for (const id of duplicates) console.log(`      "${id}"`);
}

console.log('\n── the icons this feature relies on are present by name ──');
// Named individually so that deleting one from icons.json fails loudly here rather than blanking a
// button in a menu nobody re-opens.
// `books` / `part-split` / `part-join` were removed when the dedicated series artwork landed —
// naming the OLD ids here would fail on artwork that was deliberately deleted, so the list tracks
// the ids actually in use: `series` (the series row), `series-part` (a part of one), and the verbs.
//
// The verbs come in TWO families, and naming both is the point of listing them individually. The
// books-and-squares pair (`series-split` / `series-join`) takes the whole series as its object; the
// part-rectangle trio (`series-part-split` / `series-part-join` / `series-add`) takes a single part.
// `Split into a Series…` and `Split Part…` sit two rows apart in the same menu and both rendered
// `series-split` until the part artwork landed — a wrong-but-present glyph, which is the one icon
// defect the "every literal iconId resolves" check above cannot see.
//
// ⚠️ `series-join` currently has NO `iconId` call site: `Join Parts…` moved to `series-part-join`,
// and the series-level join it was drawn for does not exist yet. It is named here deliberately so
// that if that command arrives the artwork is still present, and so the unreferenced entry is a
// recorded decision rather than a leftover. Delete both this line and the entry together, or
// neither.
for (const id of [
	'series',
	'series-part',
	'series-split',
	'series-join',
	'series-part-split',
	'series-part-join',
	'series-add',
	'arrow-up-square',
	'book-in',
	// The Structure menu's two command pairs. Named because they are easy to confuse with each other
	// and with the generic `arrow-up` / `arrow-down`: Join Up/Down act on STRUCTURE, Move Text
	// Up/Down on WORDS, and the four sit adjacent in the same menu.
	'join-up',
	'join-down',
	'text-up',
	'text-down'
]) {
	if (known.has(id)) {
		pass += 1;
		console.log(`  ✓ ${id}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${id} is missing`);
	}
}

console.log('\n── and the scanner would actually catch a bad id ──');
// Guards against the verifier passing because its own matcher is broken — the failure mode that made an
// earlier assertion in this feature vacuously true.
const sentinel = 'iconId="definitely-not-an-icon"';
const caught = [...sentinel.matchAll(/iconId\s*=\s*["']([^"']+)["']/g)].some(
	(m) => !known.has(m[1])
);
if (caught) {
	pass += 1;
	console.log('  ✓ a fabricated iconId is detected by the same matcher');
} else {
	fail += 1;
	console.log('  ✗ the matcher does not detect a fabricated iconId — this script proves nothing');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
