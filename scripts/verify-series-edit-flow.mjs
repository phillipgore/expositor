/**
 * Verify the Edit Series flow is wired end to end (SERIES_PLAN §5, §8).
 *
 * ## What this guards
 *
 * The pieces of this feature are individually verified — `verify-series-extent.mjs` proves the
 * classification, `probe-series-reserialize.mjs` proves the writes against Postgres. What neither
 * covers is whether they are CONNECTED: a correct endpoint nobody calls, or a review page the form
 * bypasses, would leave every other suite green.
 *
 * The single most important wire is the destructive one. `reserialize` refuses to delete parts
 * without `confirmPartDeletion`, and that refusal is only meaningful if the review page actually
 * asks for the acknowledgement, blocks Save until it is given, and then sends it. Each of those
 * three is asserted here by reading the source, because no runtime test in this repo renders Svelte.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-edit-flow.mjs
 */

import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;

function assert(label, condition) {
	if (condition) {
		pass += 1;
	} else {
		fail += 1;
		console.log(`✗ ${label}`);
	}
}

const form = readFileSync('src/lib/componentWidgets/forms/StudyForm.svelte', 'utf8');
const editPage = readFileSync('src/routes/(app)/series/[id]/edit/+page.svelte', 'utf8');
const editLoader = readFileSync('src/routes/(app)/series/[id]/edit/+page.server.js', 'utf8');
const reviewPage = readFileSync('src/routes/(app)/series/[id]/edit/review/+page.svelte', 'utf8');
const layout = readFileSync('src/routes/(app)/series/[id]/edit/+layout.svelte', 'utf8');
const analyze = readFileSync('src/routes/api/series/[id]/analyze-edit/+server.js', 'utf8');
const reserialize = readFileSync('src/routes/api/series/[id]/reserialize/+server.js', 'utf8');

console.log('\n── the edit page renders the real form on the recomposed study ──');

assert('the page uses StudyForm', editPage.includes('<StudyForm'));
assert('in series-edit mode', editPage.includes('mode="series-edit"'));
assert(
	'the loader recomposes the parts into the original passage list',
	editLoader.includes('recomposePassages(parts)')
);
// ⚠️ A recomposed range may be several rows merged into one, so it has no single row id. Handing
// back a real one would be a claim the merge destroyed.
assert(
	'and gives them synthetic ids, not passage row ids',
	editLoader.includes('`recomposed-${index}`')
);

console.log('\n── the Serialize controls reflect the series, rather than sitting dead ──');

// ⚠️ `seriesEligible` hard-coded `mode === 'new'` for a while, so on the Edit Series page the
// toggle was disabled and the Manage Serialization button with it — controls visibly present,
// permanently dead, and offering no reason. §11 treats an unexplained disabled control as worse
// than an absent one.
assert(
	'eligibility covers series-edit, not just new',
	form.includes("mode !== 'edit' && isSeriesEligible(passages)")
);
assert(
	'and the switch starts ON, because the study already IS a series',
	form.includes("let createAsSeries = $state(mode === 'series-edit')")
);
// The reset effect would otherwise flip the switch back off on the next tick, turning a passage
// edit into an unannounced request to dissolve the series.
assert(
	'the auto-reset cannot fight the switch in series-edit',
	form.includes("if (mode !== 'series-edit' && !seriesEligible && createAsSeries)")
);
assert(
	'the stepper is seeded from the current division',
	form.includes("mode === 'series-edit' && initialData?.chaptersPerPart")
);
assert(
	'which the loader derives from the parts',
	editLoader.includes('deriveChaptersPerPart(parts)')
);

console.log('\n── the form routes a series edit through analysis, never straight to a save ──');

assert(
	'series-edit has its own submit gate',
	form.includes("mode === 'series-edit' && initialData?.id")
);
assert(
	'which calls the SERIES analyze endpoint',
	form.includes('`/api/series/${initialData.id}/analyze-edit`')
);
assert(
	'and navigates to the series review page',
	form.includes('`/series/${seriesId}/edit/review`')
);
// The study path must be untouched by all of this.
assert(
	'the study edit path still uses its own endpoint',
	form.includes('`/api/studies/${initialData.id}/analyze-edit`')
);
assert('and its own review page', form.includes('`/study/${studyId}/edit/review`'));

console.log('\n── the destructive gate is asked for, enforced, and sent ──');

// 1. The endpoint refuses without it.
assert(
	'reserialize refuses to delete parts unconfirmed',
	reserialize.includes('requiresPartDeletionConfirmation')
);
assert(
	'gated on confirmPartDeletion',
	/extent\.deletedParts\.length > 0 && !confirmPartDeletion/.test(reserialize)
);

// 2. The review page asks for it and blocks Save.
assert(
	'the review page names what each doomed part contains',
	reviewPage.includes('describeContents(part.contents)')
);
assert(
	'asks for an explicit acknowledgement',
	reviewPage.includes('bind:checked={confirmedDeletion}')
);
assert(
	'blocks Save until it is given',
	/saveBlocked\s*=\s*\$derived\(deletedParts\.length > 0 && !confirmedDeletion\)/.test(
		reviewPage
	) && reviewPage.includes('isDisabled={isSaving || saveBlocked}')
);

// 3. And then actually sends it.
assert('and sends the confirmation with the save', reviewPage.includes('confirmPartDeletion:'));

console.log('\n── the counts the user sees are gathered BEFORE anything is written ──');

assert('analyze-edit counts each doomed part', analyze.includes('countPartContents'));
// ⚠️ Headings live in their own table; reading them off a segment row yields undefined for every
// segment, so the count would be permanently zero — "no headings at risk" while destroying them.
assert(
	'reading headings from their own table',
	analyze.includes('passageHeading.passageSegmentId')
);
assert('never from a projected segment field', !analyze.includes('segment.headingOne'));

console.log('\n── a re-division names the titles it will DESTROY ──');

// Q28: a join keeps the earlier part's title and the absorbed one's is gone. Everything else a
// re-division touches is re-parented intact, so those titles are the ONLY loss — and with no undo
// (Q35) they have to be named before the save, not discovered missing in the Finder afterwards.
assert('analyze-edit accepts the requested division', analyze.includes('chaptersPerPart = null'));
// ⚠️ Asserts the titles are actually RESOLVED, not merely that the field exists. Written the weak
// way first (`includes('discardedTitles')`), and a mutation replacing the value with `[]` passed —
// a report that always says "nothing will be lost" is exactly the silent failure this guards.
assert(
	'and resolves the titles each join discards',
	/discardedTitles:\s*join\.absorbIds\.map\(titleOf\)/.test(analyze)
);
// Planned against the PROJECTED parts, exactly as the commit plans it — otherwise the preview
// could describe a different set of operations from the ones performed.
assert(
	'planning the preview against the projected parts',
	analyze.includes('projectExtent(parts, extent)')
);
assert(
	'a division change alone still requires review',
	/divisionReport\.joins\.length > 0 \|\|\s*\n?\s*divisionReport\.splits\.length > 0/.test(analyze)
);
assert('the review page surfaces the discarded titles', reviewPage.includes('discardedTitles'));
assert(
	'and says plainly that structure survives',
	reviewPage.includes('Structure, notes and commentary are carried across')
);
// ⚠️ The WHOLE request, not just the chapters fields. Sending `{ chaptersPerPart,
// chaptersPerPassage }` dropped balance by length on the way to the server, so a balanced preview was
// approved and a chapters division was built.
// Asserted at EACH of the two send sites, and the old chapters-only spread forbidden outright. A
// bare `includes()` was satisfied by either site alone, so reverting one of them passed — found by
// mutation, which is why these are shaped the way they are.
assert(
	'the form sends the whole division for analysis',
	/passages,\s*\.\.\.\(divisionChanged \? divisionRequest : \{\}\)\s*\}\)/.test(form)
);
assert(
	'the chapters-only spread is gone from every send site',
	!form.includes('divisionChanged ? { chaptersPerPart, chaptersPerPassage }')
);
assert(
	'and the request carries balance as well as chapters',
	/let divisionRequest = \$derived\(\{[\s\S]*?balanceByLength[\s\S]*?balancePerPassage[\s\S]*?\}\)/.test(form)
);
// ⚠️ Only when the user actually changed it. Sending it unconditionally would re-divide the series on
// every save — including one that changed nothing but the subtitle.
//
// Judged against a baseline the form captures from ITSELF on load, not against
// `initialData.chaptersPerPart`. That comparison missed balance and the per-passage steppers, and
// on a multi-passage series it read "changed" before the user did anything, because the loader's
// number and the form's clamped one disagree — so a subtitle-only save re-divided the series.
assert(
	'but only when the user actually changed it',
	form.includes('JSON.stringify(divisionRequest) !== divisionBaseline')
);
assert(
	'against a baseline captured once, untracked',
	form.includes('const divisionBaseline = untrack(')
);
assert(
	'never against the loader number, which misreads multi-passage series',
	!form.includes('chaptersPerPart !== initialData.chaptersPerPart')
);
assert(
	'the pending edit carries the whole division into review',
	/\.\.\.\(divisionChanged \? divisionRequest : \{\}\),\s*report/.test(form)
);
assert(
	'and the review page forwards balance to the commit',
	reviewPage.includes('balanceByLength: pending.balanceByLength') &&
		reviewPage.includes('balancePerPassage: pending.balancePerPassage')
);

console.log('\n── the commit performs the division it previewed ──');

assert('reserialize accepts the division', reserialize.includes('chaptersPerPart = null'));
assert(
	'applies it after the extent change',
	reserialize.includes('const divided = await applyDivision')
);
// Both endpoints read the request through ONE helper, so the preview (analyze-edit) and the commit
// (reserialize) cannot disagree about whether a division was asked for, or which one.
for (const [name, source] of [
	['analyze-edit', analyze],
	['reserialize', reserialize]
]) {
	assert(`${name} reads the division through readDivisionRequest`, source.includes('readDivisionRequest(body)'));
	// EVERY planning call, not just one. `reserialize` plans twice — once for the limit gate and once
	// inside the transaction — and a bare `includes('...division,')` was satisfied by either, so
	// stripping balance from the one that actually applies the division passed. Each call's own
	// argument block is checked instead.
	const planCalls = source.match(/planSeriesParts\(\{[\s\S]*?\}\);/g) ?? [];
	assert(`${name} has a planning call to check`, planCalls.length > 0);
	assert(
		`${name} passes every field of it to all ${planCalls.length} planning call(s)`,
		planCalls.length > 0 && planCalls.every((call) => call.includes('...division'))
	);
	// The old per-endpoint test that recognised only chapters-per-part must not come back.
	assert(`${name} no longer keeps its own chapters-only test`, !source.includes('Number(chaptersPerPart) >= 1'));
}
assert(
	'planning against the projected parts too',
	reserialize.includes('projectExtent(parts, extent)')
);
// Joins before splits: both shift seriesOrder, and joining first means each split is planned
// against an already-contracted sequence.
assert(
	'joins run before splits',
	reserialize.indexOf('for (const join of diff.joins)') <
		reserialize.indexOf('for (const split of diff.splits)')
);
// A refusal at this point means the projection disagrees with what phase one wrote — a fault, not a
// user error, and silently skipping it would make the division quietly do nothing.
assert(
	'and a planning refusal is raised, not swallowed',
	reserialize.includes('throw new Error(`Division could not be planned')
);

console.log('\n── a stale plan is refused rather than applied ──');

assert(
	'analyze-edit returns a parts fingerprint',
	analyze.includes('partsFingerprint: fingerprintParts(parts)')
);
assert('the review page sends it back', reviewPage.includes('partsFingerprint:'));
assert(
	'and reserialize refuses a mismatch',
	reserialize.includes('partsFingerprint !== fingerprintParts(parts)')
);

console.log('\n── in-progress edits survive edit ↔ review and are guarded on exit ──');

assert('the flow has an unsaved-changes guard', layout.includes('beforeNavigate'));
assert('which allows movement within the flow', layout.includes('dest.startsWith(`${editRoot}/`)'));
assert(
	'and clears the hand-off payload when leaving',
	layout.includes('sessionStorage.removeItem(pendingEditKey(seriesId))')
);

console.log('\n── a dissolved series is not navigated back to ──');

// The series row is gone after a dissolve, so returning to its page would 404. The survivor is a
// standalone study, and that is where the user's work now lives.
assert(
	'the review page follows the survivor',
	reviewPage.includes('`/study/${result.dissolvedIntoStudyId}`')
);
assert('and reserialize reports which study that is', reserialize.includes('dissolvedIntoStudyId'));

console.log('\n── and it carries the series’ name, not the part’s ──');

// §4: a one-part series is a study wearing a costume. When the costume comes off, the name the
// user TYPED is on the series row — a part title was auto-generated at creation ("Part 1",
// "Ecclesiastes 1:9-11"). Deleting the series row without copying its name first leaves the user
// holding a study called something they never chose, and destroys the name they did.
//
// Asserted on both dissolve paths because they are separate implementations of one rule, and a
// rule implemented twice is a rule that drifts. Q28's "the earlier part keeps its title" governs a
// join that leaves a series STANDING; it is not in tension with this.
assert(
	'reserialize inherits the series name on dissolve',
	/inheritedTitle\s*\?\s*\{\s*title:\s*inheritedTitle\s*\}/.test(reserialize)
);
// The fallback is the whole point: `seriesUpdates.name` is populated only when the save also
// edited the title field, so a dissolve without a retitle is the COMMON case and must still
// inherit. Pinned because the narrower version read correct and failed exactly there.
assert(
	'and falls back to the existing name when this save did not retitle',
	reserialize.includes('seriesUpdates.name ?? existingName') &&
		reserialize.includes('existingName: series.name')
);

const joinEndpoint = readFileSync('src/routes/api/series/[id]/join/+server.js', 'utf8');
assert(
	'Join Parts has a dissolve-identity helper',
	joinEndpoint.includes('function dissolvedIdentity')
);
assert(
	'and applies it where it clears the back-reference',
	/seriesOrder:\s*null,\s*\.\.\.dissolvedIdentity\(series\)/.test(joinEndpoint)
);
// The helper must not be reachable only from the response payload — that would report a rename
// that never happened. Two call sites: the UPDATE and the report.
assert(
	'and reports the resulting title',
	joinEndpoint.includes('dissolvedTitle') && joinEndpoint.includes('dissolvedIntoStudyId')
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
