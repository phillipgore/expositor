/**
 * Verify SERIES_PLAN.md does not contradict the code it describes.
 *
 * ## Why this exists
 *
 * Three separate times, this plan claimed work was unfinished that was already live, verified and
 * mutation-tested:
 *
 *   - Q40 was marked "❓ Undecided" in §8's table and "no answer" in §13 while §8's own prose said
 *     "✅ SETTLED" and `classifyBoundary()` had returned `'overlap'` since phase 2;
 *   - Q23 was listed as the "biggest technical risk" after edge stubs had shipped;
 *   - the whole-series export check was described as "the export ROUTE is not wired" twice, the second
 *     time by someone editing the adjacent line who copied the claim forward without opening
 *     `MenuExport.svelte`.
 *
 * None of these were caught by any gate, because no gate read the document. A stale plan is not
 * cosmetic: it is the artefact people consult to decide what to build, so "still not wired" invites
 * someone to rebuild a wired feature, and "undecided" invites re-litigating a settled decision.
 *
 * ## What this asserts, and what it deliberately does not
 *
 * It pins a small set of **claims that would be false if the code were reverted** — a symbol the plan
 * says exists must exist, and a wire the plan says is connected must be referenced by its consumer. It
 * does NOT try to parse prose or police tone; a verifier that flagged every sentence would be muted
 * within a week.
 *
 * ⚠️ Quoted history is explicitly allowed. These documents record what a line *used to* say, which is
 * their most valuable habit, so the check looks for stale claims **outside** quotation marks only.
 *
 * Run: node scripts/verify-plan-status.mjs
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

const plan = readFileSync('SERIES_PLAN.md', 'utf8');
const read = (path) => readFileSync(path, 'utf8');

/**
 * Lines of the plan with quoted spans removed.
 *
 * The documents deliberately quote their own superseded wording ("This line read …"), so a naive
 * substring search reports every correction as a regression. Stripping quoted spans is what lets the
 * check distinguish a live claim from a recorded one.
 */
const unquoted = plan
	.split('\n')
	.map((line) => line.replace(/"[^"]*"/g, '""').replace(/“[^”]*”/g, '""'));

console.log('\n── the plan makes no LIVE claim that shipped work is unwired ──');

// Each entry: a phrase that must not appear as a live claim, and why it was wrong when it did.
for (const [phrase, why] of [
	['export ROUTE is not wired', 'the check is wired in MenuExport.guardExport()'],
	['export menu item is still not wired', 'same claim, second occurrence'],
	['drag GESTURE is not wired', 'wired via useDragAndDrop -> AddToSeriesModal'],
	['drag HANDLE is not wired', 'wired in ReorderRunsModal']
]) {
	const hits = unquoted.filter((line) => line.includes(phrase));
	assert(`no live "${phrase}" claim (${why})`, hits.length === 0);
}

console.log('\n── and no settled question is still listed as undecided ──');

// Q40's table row was the specific contradiction: "❓ Undecided — see Q40" three sections away from
// "✅ SETTLED".
assert(
	'the overlap boundary row is not marked Undecided',
	!unquoted.some((line) => line.includes('Undecided') && line.includes('Q40'))
);
assert('Q40 is recorded as settled', /\*\*Q40[\s\S]{0,400}?SETTLED/.test(plan));
assert('Q23 is recorded as answered', /Q23 is answered and no longer open/.test(plan));

console.log('\n── the symbols the plan names actually exist ──');

// If a claim of doneness rests on a function, the function has to be there. Reverting the feature
// without updating the plan then fails here rather than misleading the next reader.
for (const [symbol, file] of [
	['checkSeriesExport', 'src/lib/utils/seriesExport.js'],
	['planCacheEviction', 'src/lib/utils/cacheEviction.js'],
	['preserveCrossPartConnections', 'src/lib/server/db/seriesStructure.js'],
	['planRunReorder', 'src/lib/utils/seriesReorder.js'],
	['planAddToSeries', 'src/lib/utils/seriesMembership.js']
]) {
	// ⚠️ `export async function` too, not just `export function` — this initially reported
	// `preserveCrossPartConnections` as missing when it is merely async. A verifier whose matcher is
	// narrower than the code it checks produces false alarms, and a gate that cries wolf gets muted.
	assert(
		`${symbol}() exists in ${file}`,
		new RegExp(`export\\s+(async\\s+)?function\\s+${symbol}\\b`).test(read(file))
	);
}

console.log('\n── and each is reachable from its consumer ──');

// The distinction this whole file exists for: a verified, mutation-tested, UNREACHABLE endpoint.
assert(
	'the series export check is called by MenuExport',
	read('src/lib/componentWidgets/menus/MenuExport.svelte').includes('checkSeriesExport(')
);
assert(
	'cache eviction is called by the study loader',
	read('src/routes/(app)/study/[id]/+layout.server.js').includes('enforceCacheLimit(')
);
assert(
	'the cross-part connection count is series-scoped',
	/countTouchingConnections\([^)]*seriesId\)/.test(read('src/lib/server/db/passageJoin.js'))
);

console.log('\n── the matcher would notice a fabricated claim ──');
// Guards against every assertion above passing because the search is broken rather than because the
// document is right.
assert(
	'a phrase absent from the plan is reported absent',
	!unquoted.some((line) => line.includes('the frobnicator is not wired'))
);
assert(
	'and quote-stripping still finds unquoted text',
	unquoted.some((line) => line.includes('Q40'))
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
