<script>
	/**
	 * # JoinPartsModal Component
	 *
	 * Merges a part with its previous or next neighbour (SERIES_PLAN §8, "Join Parts").
	 *
	 * Distinct from `JoinConfirmationModal`, which joins a column/section/segment *inside* one
	 * passage. §3's vocabulary rule is that the verb is qualified by its object, and these are
	 * genuinely different operations: this one deletes a study row.
	 *
	 * ## The dialog names the parts, not the mechanism
	 *
	 * The question this asks is "which neighbour?", so the two neighbours are named by their
	 * references — "Previous part (Ephesians 1:1-2:2)" — and that is the whole body. An earlier
	 * version also rendered the merged reference, the kept title, the discarded title, a
	 * dissolve notice and the Q27 rationale, which buried the one decision under five facts
	 * about a merge the user had not yet agreed to.
	 *
	 * Naming the neighbour is what makes the choice answerable: "Previous part" alone asks the
	 * reader to remember the running order, while the reference is the same string the Finder
	 * shows in the row directly above. The outcome is then predictable from the two labels —
	 * joining 2:3-22 to 1:1-2:2 plainly gives 1:1-22 — so printing it added length, not
	 * information.
	 *
	 * ## Legality is still the server's answer
	 *
	 * Which directions exist is a fact about stored data, so the neighbours come from the
	 * series' own part list and a direction with no neighbour is not offered. Whether a legal
	 * direction can actually be joined remains the planner's to answer: the modal dry-runs the
	 * endpoint and shows what comes back in the planner's own words.
	 *
	 * Two outcomes, and the difference is the point:
	 *
	 * - A **gap or a book change** is a warning, not a refusal (§8, "Joining across a gap"). The
	 *   parts merge and keep their passages separate, so Join stays live and the amber block says
	 *   what will happen. Prison Epistles is joinable.
	 * - An **overlap** is still refused outright — separating the ranges cannot stop chapter 3
	 *   appearing twice (Q40) — and so is a direction with no part in it.
	 *
	 * §11 requires the distinction: a refusal that cannot be worked around must not read like one
	 * that can, and vice versa. That is why the two arrive in different colours.
	 *
	 * ⚠️ Connection loss keeps its checkbox. It is the one thing here that is destroyed rather
	 * than moved, Q35 leaves no undo, and the endpoint answers 409 without the acknowledgement —
	 * so removing it in the name of tidiness would both strand the commit and delete the user's
	 * links without warning. Trimming stops at the point where the dialog would start hiding
	 * losses.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} part - The part the command was invoked on
	 * @property {Object} series - The series containing the part, with its `parts` in order
	 * @property {string} seriesId
	 * @property {Function} onDone
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import { untrack } from 'svelte';
	import Modal from '$lib/componentElements/Modal.svelte';
	import Checkbox from '$lib/componentElements/Checkbox.svelte';
	import { messageForFailure } from '$lib/utils/apiErrors.js';
	import { formatPassageReference } from '$lib/utils/passageFormatting.js';

	let { isOpen = false, part = null, series = null, seriesId = null, onDone, onClose } = $props();

	/**
	 * The parts either side of this one, named for the radio labels.
	 *
	 * Read from the series' `parts`, which `+layout.server.js` has already sorted by
	 * `seriesOrder` — explicit and user-editable, never re-derived from canonical order (§4,
	 * trap 11). Position in that array IS the running order, so the neighbours are the entries
	 * adjacent to this part's index.
	 *
	 * Either may be null: the first part has no previous, the last has no next. That is why the
	 * radios are rendered from this rather than hard-coded — offering "Next part" on the last
	 * part is a choice that cannot succeed, and §11 prefers not presenting a dead option to
	 * explaining one after the click.
	 */
	let neighbours = $derived.by(() => {
		const parts = series?.parts ?? [];
		const index = parts.findIndex((p) => p.id === part?.id);
		if (index === -1) return { previous: null, next: null };
		return { previous: parts[index - 1] ?? null, next: parts[index + 1] ?? null };
	});

	/**
	 * A part's reference, matching the Finder row exactly.
	 *
	 * `StudyItem` joins a multi-passage study's ranges with ', ' and falls back to the title
	 * when there are none; the same rule here keeps the two views from disagreeing about what a
	 * part is called.
	 */
	function referenceOf(p) {
		const passages = p?.passages ?? [];
		if (passages.length === 0) return p?.title ?? '';
		return passages.map((passage) => formatPassageReference(passage)).join(', ');
	}

	let direction = $state('previous');
	let preview = $state(null);
	let error = $state('');
	let loading = $state(false);
	let submitting = $state(false);
	let acknowledgedConnectionLoss = $state(false);

	/**
	 * Non-contiguous joins are permitted from this dialog, and warned about rather than refused.
	 *
	 * Sent unconditionally — there is no second button and no opt-in step. Invoking Join Parts on
	 * two parts IS the request to join them, and a gap changes only how the result is stored
	 * (two passages rather than one coalesced range), which the planner states in the warning the
	 * user reads before pressing Join. An extra confirmation would ask the same question twice.
	 *
	 * ⚠️ This does NOT weaken the planner's `allowNonContiguous` default. That default exists for
	 * `reserialize`, which calls `planPartJoin()` as an assertion that `diffSeams()` only proposes
	 * in-run joins; it must keep refusing. Only this dialog opts in, and only because a user
	 * asked in so many words.
	 */
	const ALLOW_NON_CONTIGUOUS = true;

	/**
	 * Reset to the default direction each time the dialog opens.
	 *
	 * ⚠️ `untrack` is load-bearing, not defensive — the same trap `AddToSeriesModal` records.
	 * `refresh()` calls `request()`, which reads `direction` to build the request body, and that
	 * read happens BEFORE the first `await`, so it is tracked. Without `untrack` this effect
	 * subscribes to the very state it resets: choosing "Next part" re-ran the effect, which set
	 * `direction` straight back to 'previous', and the radio appeared inert — impossible to
	 * select even when the join was perfectly legal. Keyed on `isOpen` alone, because the open
	 * transition is the only thing that should re-seed the choice.
	 */
	$effect(() => {
		if (!isOpen) return;
		untrack(() => {
			// 'previous' is the default only when it exists — on the FIRST part it does not, and
			// opening on a direction with no neighbour would dry-run a join that cannot happen.
			direction = neighbours.previous ? 'previous' : 'next';
			preview = null;
			error = '';
			acknowledgedConnectionLoss = false;
			submitting = false;
			void refresh();
		});
	});

	async function refresh() {
		const result = await request({ dryRun: true });
		preview = result?.ok ? result : null;
	}

	/** One request shape for the dry run and the commit. */
	async function request({ dryRun, confirmConnectionLoss = false }) {
		if (!seriesId || !part?.id) return null;
		loading = dryRun;
		error = '';
		try {
			const response = await fetch(`/api/series/${seriesId}/join`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					partId: part.id,
					direction,
					dryRun,
					confirmConnectionLoss,
					allowNonContiguous: ALLOW_NON_CONTIGUOUS
				})
			});
			const result = await response.json();

			if (!response.ok) {
				// 409 means "acknowledge the loss first" and still carries the preview.
				if (result?.needsConnectionConfirmation) {
					preview = result;
					error = result.error ?? '';
					return null;
				}
				// A 401 is a lapsed session, not a refusal by the planner. Everything else is the
				// planner's own sentence and passes through untouched.
				error = messageForFailure(
					response,
					result,
					'These parts cannot be joined.',
					'join these parts'
				);
				return null;
			}

			return result;
		} catch (err) {
			console.error('Join request failed:', err);
			error = 'Could not reach the server.';
			return null;
		} finally {
			loading = false;
		}
	}

	async function handleConfirm() {
		if (submitting) return;
		submitting = true;
		try {
			const result = await request({
				dryRun: false,
				confirmConnectionLoss: acknowledgedConnectionLoss
			});
			if (result?.ok) onDone?.(result);
		} finally {
			submitting = false;
		}
	}

	let brokenCount = $derived(preview?.connections?.broken ?? preview?.brokenConnections ?? 0);

	let confirmDisabled = $derived(
		submitting || loading || !preview?.ok || (brokenCount > 0 && !acknowledgedConnectionLoss)
	);
</script>

<Modal
	{isOpen}
	title="Join Parts"
	size="medium"
	confirmLabel={submitting ? 'Joining…' : 'Join'}
	confirmClasses="blue"
	{confirmDisabled}
	onConfirm={handleConfirm}
	onCancel={onClose}
	{onClose}
>
	<p class="explain">Join {referenceOf(part)} to:</p>

	<!-- Stacked, not side by side: each label now carries a reference, and a row would either
	     wrap awkwardly or push the second option off to the right of a long one. -->
	<div class="direction-list" role="radiogroup" aria-label="Which part to join with">
		{#if neighbours.previous}
			<label>
				<input type="radio" bind:group={direction} value="previous" onchange={refresh} />
				Previous part ({referenceOf(neighbours.previous)})
			</label>
		{/if}
		{#if neighbours.next}
			<label>
				<input type="radio" bind:group={direction} value="next" onchange={refresh} />
				Next part ({referenceOf(neighbours.next)})
			</label>
		{/if}
	</div>

	<!-- The only surviving preview output. Everything else the dry run returns — the merged
	     reference, the kept and discarded titles, the dissolve notice, the compliance warnings —
	     is either predictable from the two labels above or recoverable afterwards. A destroyed
	     connection is neither, so it stays. -->
	{#if preview?.ok && brokenCount > 0}
		<Checkbox
			id="join-parts-confirm"
			bind:checked={acknowledgedConnectionLoss}
			alignTop
			spacingBottom="0.8rem"
		>
			Delete {brokenCount}
			{brokenCount === 1 ? 'connection' : 'connections'} that cannot survive the merge. This cannot be
			undone.
		</Checkbox>
	{/if}

	<!-- A non-contiguous seam is a WARNING, not a refusal: the join is legal and the Join button
	     stays live, so this is amber rather than red. Rendering the planner's own `warnings` means
	     the gap notice and the compliance notices arrive through one path — the gap one is simply
	     first in the list, because it describes the operation where the others describe the result.

	     ⚠️ This is the one preview output besides the connection checkbox that survived the trim.
	     It earns its place by the same test: it states something the two radio labels do not
	     imply. "Ephesians 2:3-22" and "Colossians 1:1-29" do not say that joining them leaves the
	     text between them out. -->
	{#if preview?.ok && preview.warnings?.length > 0}
		<div class="warnings" role="status">
			{#each preview.warnings as warning (warning.reason)}
				<p class="warning">{warning.message}</p>
			{/each}
		</div>
	{/if}

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	.direction-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	.direction-list label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	/* Layout AND spacing are the Checkbox element's; the spacing this modal wants is passed
	   in as `spacingBottom` rather than reached in through `:global`, which was never scoped
	   to this component and so fought two other copies of the same rule. */

	/* Amber, not red: `--red` is reserved for the error below, which means the command did NOT
	   run. These say it will run, with a consequence worth reading first — the same distinction
	   GlossaryBadge and the tagged highlights draw with this pair. */
	.warnings {
		margin: 0 0 1.2rem;
		padding: 0.8rem;
		border-radius: 0.4rem;
		background: var(--orange-lighter);
	}

	.warning {
		margin: 0;
		font-size: 1.3rem;
		line-height: 1.5;
		color: var(--orange-darker);
	}

	.warning + .warning {
		margin-top: 0.6rem;
	}

	.error {
		margin: 0;
		font-size: 1.3rem;
		color: var(--red);
	}
</style>
