/**
 * Guard the Finder performance fixes (FINDER_PERFORMANCE_REPORT.md) against silent regression.
 *
 * Each of these was measured in Safari and Chrome with `scripts/perf-finder.mjs`; each is also the
 * kind of change a tidy-up would naturally undo ("why not just select() the passage?"). They are
 * pinned here as source facts — and one pure behaviour check — so `npm run verify` catches a
 * revert before a user's Safari does.
 */

import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function assert(label, condition) {
	if (condition) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

console.log('\n── layout load: one passage query, no cached text ──');
const layout = strip(readFileSync('src/routes/(app)/+layout.server.js', 'utf8'));
assert(
	'passages are not loaded per study (no N+1 inside studiesData.map)',
	!/studiesData\.map\(\s*async/.test(layout)
);
assert('the passage query names its columns', /\.select\(\{[\s\S]{0,200}bookName: passage\.bookName/.test(layout));
assert('and never ships cachedText to the client', !layout.includes('cachedText'));
assert('the group tree is built from buckets, not filter-per-group', layout.includes('groupsByParent'));

console.log('\n── indexes the layout load relies on ──');
const schema = readFileSync('src/lib/server/db/schema.ts', 'utf8');
for (const name of ['passage_study_id_idx', 'study_user_id_idx', 'study_group_user_id_idx']) {
	assert(`${name} is declared in schema.ts`, schema.includes(`'${name}'`));
}
assert(
	'and created by migration 0054',
	readFileSync('drizzle/0054_add_finder_indexes.sql', 'utf8').includes('passage_study_id_idx')
);

console.log('\n── client: per-row work is a lookup ──');
const multi = strip(readFileSync('src/lib/composables/useMultiSelect.svelte.js', 'utf8'));
assert('selection positions are derived once', multi.includes('positionByKey = $derived.by'));
assert(
	'getSelectionPosition does not sort per call',
	!/function getSelectionPosition[\s\S]{0,300}\.sort\(/.test(multi)
);

const panel = strip(readFileSync('src/lib/componentWidgets/StudiesPanel.svelte', 'utf8'));
const flattenCalls = (panel.match(/getFlattenedItemsList\(/g) ?? []).length;
assert('the Finder is flattened exactly once, as a $derived', flattenCalls === 1 && panel.includes('flatItems = $derived(getFlattenedItemsList'));
assert('filtering runs as one pass', panel.includes('studiesFilter.getFilteredView()'));
assert(
	'collapse does not reload the whole layout',
	!/function toggle(Group|Series)Collapse[\s\S]{0,400}invalidate\(/.test(panel)
);

const filter = strip(readFileSync('src/lib/composables/useStudiesFilter.svelte.js', 'utf8'));
assert('search keys are cached per study object', filter.includes('new WeakMap()'));

console.log('\n── search does not animate the whole tree ──');
const group = readFileSync('src/lib/componentWidgets/studies/StudyGroup.svelte', 'utf8');
const series = readFileSync('src/lib/componentWidgets/studies/StudySeries.svelte', 'utf8');
for (const [name, src] of [
	['StudiesPanel', readFileSync('src/lib/componentWidgets/StudiesPanel.svelte', 'utf8')],
	['StudyGroup', group],
	['StudySeries', series]
]) {
	assert(
		`${name} uses only switchable motion`,
		!/animate:flip|transition:slide/.test(src) && /enabled: motion/.test(src)
	);
}

console.log('\n── switchable motion behaves ──');
const { finderFlip, finderSlide } = await import('../src/lib/utils/finderMotion.js').catch(
	() => ({})
);
if (finderFlip && finderSlide) {
	assert('finderFlip disabled is a zero-duration no-op', finderFlip(null, null, { enabled: false }).duration === 0);
	assert('finderSlide disabled is a zero-duration no-op', finderSlide(null, { enabled: false }).duration === 0);
} else {
	assert('finderMotion.js can be imported', false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
