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

/** Every .svelte / .js / .ts file under src/. Icon ids also live in config (`toolbarConfig.js`). */
function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...walk(path));
		else if (/\.(svelte|js|ts)$/.test(entry)) out.push(path);
	}
	return out;
}

/**
 * Every literal icon id in a (comment-stripped) source string:
 *   iconId="x"  ·  iconId: 'x'  ·  iconId={'x'}  ·  iconId={cond ? 'x' : 'y'}  ·  TYPE_ICON = { k: 'x' }
 * Event names that happen to share an icon's spelling (e.g. `select-all-columns`) are deliberately
 * NOT matched — only strings in an icon position count.
 */
function literalIconIds(source) {
	const ids = [];
	for (const m of source.matchAll(/iconId\s*[=:]\s*["']([^"']+)["']/g)) ids.push(m[1]);
	for (const m of source.matchAll(/iconId\s*=\s*\{([^}]*)\}/g)) {
		for (const s of m[1].matchAll(/["']([^"']+)["']/g)) ids.push(s[1]);
	}
	for (const m of source.matchAll(/TYPE_ICON\s*=\s*\{([^}]*)\}/g)) {
		for (const s of m[1].matchAll(/:\s*["']([^"']+)["']/g)) ids.push(s[1]);
	}
	return ids;
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
	for (const id of literalIconIds(source)) {
		if (!known.has(id)) missing.push(`${file}: "${id}"`);
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
// series verbs (`series-split`, `series-part-split`, `series-part-join`, `series-reorder`,
// `series-add`) no longer render: the Study menu's series section is text-only (2026-10-10, see
// MENU_ICON_REMOVALS.md). Their entries were removed from icons.json; the files are kept in
// public/previously_used/ for restoring, so they are no longer required here.
//
// `series-join` (artwork for a series-level join that was never specified) and `arrow-up-square`
// (superseded by `series-reorder`) had no call sites and were removed from icons.json together with
// their lines here. Their artwork is kept in public/unused/ should either be needed again.
for (const id of [
	'series',
	'series-part',
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
const caught = ["iconId: 'nope-a'", "iconId={x ? 'nope-b' : 'check'}", sentinel].every((s) =>
	literalIconIds(s).some((id) => !known.has(id))
);
if (caught) {
	pass += 1;
	console.log('  ✓ a fabricated iconId is detected by the same matcher');
} else {
	fail += 1;
	console.log('  ✗ the matcher does not detect a fabricated iconId — this script proves nothing');
}

console.log('\n── ids follow the naming rules (ICON_NAMING.md) ──');
// Rule 2: lowercase words joined by single hyphens.
const badNames = [...known].filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id));
if (badNames.length === 0) {
	pass += 1;
	console.log('  ✓ every id is lowercase-hyphenated');
} else {
	fail += 1;
	console.log(`  ✗ ids not lowercase-hyphenated: ${badNames.join(', ')}`);
}

console.log('\n── every id has a matching file, and every file an id (rule 1) ──');
// The registry is what renders; the .svg files are the editable source. They drifted once already
// (`note-positon` vs `note-position.svg`, `note-offset` vs `note-offest.svg`), so pin them together.
// Only top-level public/ holds live icons. public/previously_used/ (removed, recorded in
// MENU_ICON_REMOVALS.md) and public/unused/ (never shipped) are archives: their ids are NOT in
// icons.json, and restoring one means copying its path back in.
const svgIn = (dir) =>
	readdirSync(dir)
		.filter((f) => f.endsWith('.svg'))
		.map((f) => f.slice(0, -4));
const files = new Set(svgIn('public'));
const noFile = [...known].filter((id) => !files.has(id));
const noEntry = [...files].filter((f) => !known.has(f));
if (noFile.length === 0 && noEntry.length === 0) {
	pass += 1;
	console.log(`  ✓ all ${known.size} ids match a file in public/`);
} else {
	fail += 1;
	if (noFile.length) console.log(`  ✗ ids with no .svg file in public/: ${noFile.join(', ')}`);
	if (noEntry.length) console.log(`  ✗ .svg files with no icons.json entry: ${noEntry.join(', ')}`);
}

console.log('\n── archived icons are out of the registry ──');
const archived = [...svgIn('public/previously_used'), ...svgIn('public/unused')].filter((id) => known.has(id));
if (archived.length === 0) {
	pass += 1;
	console.log('  ✓ no id in previously_used/ or unused/ is still in icons.json');
} else {
	fail += 1;
	console.log(`  ✗ archived ids still in icons.json: ${archived.join(', ')}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
