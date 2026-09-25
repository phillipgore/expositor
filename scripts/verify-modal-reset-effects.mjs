/**
 * Verify that no modal's `$effect` calls one of its own async loaders outside `untrack`.
 *
 * ## Why this exists
 *
 * Three modals shipped the same defect. A reset-on-open effect called a local async loader
 * directly; the loader read the dialog's own state before its first `await`, and every read in
 * that synchronous prefix is tracked by the calling effect — so the effect subscribed to the state
 * it was resetting. The response set that state, the effect re-ran, reset it and loaded again:
 *
 *   - AddToSeriesModal: the series picker snapped back to the first series on every pick;
 *   - JoinPartsModal: the "Next part" radio could not be selected;
 *   - SplitPartModal: the body flipped between "This part cannot be divided." and the split
 *     controls for as long as the dialog was open, firing a growing stream of dry runs.
 *
 * Each was fixed where it was noticed, and each fix left the next copy of the pattern in place.
 * Svelte does not catch it: the loop crosses an `await`, so the update-depth guard never trips, and
 * nothing in `npm run verify` read the components. This is that read.
 *
 * ## The rule
 *
 * Inside a `$effect` / `$effect.pre` in `componentWidgets/modals/`, a call to an async function the
 * same component declares must sit inside an `untrack(...)` callback. The call site is where the
 * guarantee has to live: a loader that reads nothing today can start reading state tomorrow, as
 * `request()` did when it began choosing its field from `choice`.
 *
 * ⚠️ Deliberately scoped to modals. Elsewhere an effect re-running on what a loader reads can be the
 * point (CommentaryPanel reloads when its subject changes), and a rule that flagged those would be
 * muted rather than obeyed.
 *
 * ⚠️ Only DIRECT calls are seen. An effect that calls a synchronous helper which then calls the
 * loader passes this check while carrying the same bug. All three real cases were direct calls; a
 * call-graph walk would catch the indirect one at the cost of a much larger checker.
 *
 * Run: node scripts/verify-modal-reset-effects.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';

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

const MODALS = 'src/lib/componentWidgets/modals';

/**
 * Visit every ESTree node under `node`, telling the visitor whether an `untrack(...)` call's
 * arguments enclose it. Parsed from the real AST rather than matched as text, so a comment that
 * mentions `untrack` cannot stand in for one.
 */
function walk(node, visit, inUntrack = false) {
	if (!node || typeof node.type !== 'string') return;
	visit(node, inUntrack);
	const opensUntrack =
		node.type === 'CallExpression' &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'untrack';
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent' || key === 'loc' || key === 'metadata') continue;
		for (const child of Array.isArray(value) ? value : [value]) {
			if (child && typeof child === 'object') {
				walk(child, visit, inUntrack || (opensUntrack && key === 'arguments'));
			}
		}
	}
}

function isEffect(callee) {
	if (callee.type === 'Identifier') return callee.name === '$effect';
	return (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		callee.object.name === '$effect' &&
		callee.property.name === 'pre'
	);
}

/** Async functions the script declares at its top level: `async function f` and `const f = async …`. */
function loadersOf(program) {
	const names = new Set();
	for (const statement of program.body) {
		if (statement.type === 'FunctionDeclaration' && statement.async) {
			names.add(statement.id.name);
		}
		if (statement.type === 'VariableDeclaration') {
			for (const d of statement.declarations) {
				if (d.id.type === 'Identifier' && d.init?.async) names.add(d.id.name);
			}
		}
	}
	return names;
}

/** Every call an effect makes to a local loader, split by whether `untrack` encloses it. */
function inspect(source) {
	const program = parse(source, { modern: true }).instance?.content;
	const exposed = [];
	const guarded = [];
	if (!program) return { exposed, guarded };

	const loaders = loadersOf(program);
	const lineOf = (offset) => source.slice(0, offset).split('\n').length;
	walk(program, (node) => {
		if (node.type !== 'CallExpression' || !isEffect(node.callee)) return;
		walk(node.arguments[0], (inner, inUntrack) => {
			if (
				inner.type === 'CallExpression' &&
				inner.callee.type === 'Identifier' &&
				loaders.has(inner.callee.name)
			) {
				(inUntrack ? guarded : exposed).push({
					name: inner.callee.name,
					line: lineOf(inner.start)
				});
			}
		});
	});
	return { exposed, guarded };
}

// ── The checker itself, against the defect it exists for ──────────────────────────────────────
//
// Run first: if the detector cannot see the original bug, every pass below is meaningless.

console.log('\n── The checker recognises the defect ──');

const fixture = (effectBody) => `<script>
	let { isOpen = false } = $props();
	let choice = $state('');
	async function loadPoints() {
		const body = { choice };
		await fetch('/x', { body: JSON.stringify(body) });
		choice = '1';
	}
	$effect(() => {
${effectBody}
	});
</script>`;

// SplitPartModal's effect exactly as it shipped.
const shipped = inspect(
	fixture(`		if (isOpen) {
			choice = '';
			void loadPoints();
		}`)
);
assert(
	'the shipped SplitPartModal effect is flagged',
	shipped.exposed.length === 1 && shipped.exposed[0].name === 'loadPoints'
);

const fixed = inspect(
	fixture(`		if (!isOpen) return;
		untrack(() => {
			choice = '';
			void loadPoints();
		});`)
);
assert(
	'the untrack form passes, and the call is still seen',
	fixed.exposed.length === 0 && fixed.guarded.length === 1
);

// Parsed, not grepped: prose about the fix must not count as the fix.
const commented = inspect(
	fixture(`		// untrack(() => loadPoints()) — see AddToSeriesModal
		if (isOpen) void loadPoints();`)
);
assert('a comment mentioning untrack is not an untrack', commented.exposed.length === 1);

// untrack's CALLBACK is what shields; untrack's return value used as an argument elsewhere is not.
const sibling = inspect(
	fixture(`		const open = untrack(() => isOpen);
		if (open) void loadPoints();`)
);
assert('an untrack elsewhere in the effect does not shield the call', sibling.exposed.length === 1);

const pre = inspect(
	fixture('').replace('$effect(() => {', '$effect.pre(() => {\n\t\tvoid loadPoints();')
);
assert('$effect.pre is checked too', pre.exposed.length === 1);

// ── The three modals that have already suffered it, by name ───────────────────────────────────

console.log('\n── The modals that already had this bug keep the guard ──');

for (const [file, loader] of [
	['AddToSeriesModal.svelte', 'refresh'],
	['JoinPartsModal.svelte', 'refresh'],
	['SplitPartModal.svelte', 'loadPoints']
]) {
	const { exposed, guarded } = inspect(readFileSync(`${MODALS}/${file}`, 'utf8'));
	// Guarded AND present: deleting the load from the effect would also clear `exposed`.
	assert(
		`${file}: its reset effect still calls ${loader}(), inside untrack`,
		exposed.length === 0 && guarded.some((call) => call.name === loader)
	);
}

// ── Every modal ───────────────────────────────────────────────────────────────────────────────

console.log('\n── No modal effect calls its own loader where the effect can track it ──');

const files = readdirSync(MODALS).filter((name) => name.endsWith('.svelte'));
assert(`found the modals directory (${files.length} components)`, files.length > 10);

let offenders = 0;
for (const file of files) {
	const { exposed } = inspect(readFileSync(`${MODALS}/${file}`, 'utf8'));
	for (const call of exposed) {
		offenders += 1;
		assert(`${file}:${call.line} calls ${call.name}() inside an effect without untrack`, false);
	}
}
assert('every modal is clean', offenders === 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
