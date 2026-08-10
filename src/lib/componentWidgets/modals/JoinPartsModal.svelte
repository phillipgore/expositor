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
	 * ## Everything shown is the server's answer
	 *
	 * Direction legality (Q27: previous/next only), the merged reference, the discarded title
	 * (Q28), whether the series dissolves to a standalone study, and how many connections cannot
	 * survive are all facts about stored data. The modal dry-runs the endpoint and renders the
	 * result, so it cannot describe an outcome the endpoint will not produce.
	 *
	 * A direction that is illegal — a different book across the seam, a gap, an overlap — comes
	 * back as the planner's own sentence, which distinguishes "not adjacent in Scripture" (never
	 * possible) from a merely unimplemented case. §11 requires that distinction: a single "not yet"
	 * would promise a Prison Epistles user a fix that is never coming.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} part - The part the command was invoked on
	 * @property {string} seriesId
	 * @property {Function} onDone
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';

	let { isOpen = false, part = null, seriesId = null, onDone, onClose } = $props();

	let direction = $state('previous');
	let preview = $state(null);
	let error = $state('');
	let loading = $state(false);
	let submitting = $state(false);
	let acknowledgedConnectionLoss = $state(false);

	$effect(() => {
		if (isOpen) {
			direction = 'previous';
			preview = null;
			error = '';
			acknowledgedConnectionLoss = false;
			submitting = false;
			void refresh();
		}
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
				body: JSON.stringify({ partId: part.id, direction, dryRun, confirmConnectionLoss })
			});
			const result = await response.json();

			if (!response.ok) {
				// 409 means "acknowledge the loss first" and still carries the preview.
				if (result?.needsConnectionConfirmation) {
					preview = result;
					error = result.error ?? '';
					return null;
				}
				error = result?.error ?? 'These parts cannot be joined.';
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
	<p class="explain">
		Merge <strong>{part?.title ?? 'this part'}</strong> with the part before or after it. Q27: neighbours
		only — joining parts that are not adjacent in the sequence would have no defined order.
	</p>

	<div class="direction-row" role="radiogroup" aria-label="Which part to join with">
		<label>
			<input type="radio" bind:group={direction} value="previous" onchange={refresh} />
			Previous part
		</label>
		<label>
			<input type="radio" bind:group={direction} value="next" onchange={refresh} />
			Next part
		</label>
	</div>

	{#if preview?.ok}
		<ul class="outcome">
			<li>
				<span class="outcome-label">Result</span>
				<span class="outcome-value">{preview.reference}</span>
			</li>
			<li>
				<span class="outcome-label">Keeps title</span>
				<!-- Q28: the earlier part in sequence keeps its title. -->
				<span class="outcome-value">{preview.keepTitle}</span>
			</li>
		</ul>

		{#if preview.discards?.length > 0}
			<!-- Q28 asks that anything discarded be named before it goes. The list is deliberately
			     short: structure, notes and commentary are re-parented intact, so padding it to look
			     thorough would misrepresent what is lost. -->
			<div class="discards">
				<p class="discards-head">This will be discarded:</p>
				{#each preview.discards as discarded}
					<p class="discard">“{discarded}”</p>
				{/each}
			</div>
		{/if}

		{#if preview.willDissolve}
			<!-- §4: "a one-part series is a study wearing a costume". Said up front, because the
			     series row disappearing from the Finder is otherwise a surprise. -->
			<p class="dissolve">
				This is the last pair in the series, so joining them dissolves the series and leaves a
				single standalone study.
			</p>
		{/if}

		{#if preview.warnings?.length > 0 || preview.display?.length > 0}
			<div class="compliance" role="status">
				{#each preview.warnings ?? [] as warning}
					<p class="warning">{warning.message}</p>
				{/each}
				{#each preview.display ?? [] as message}
					<p class="warning">{message}</p>
				{/each}
				<p class="compliance-foot">
					You can still join these parts. These limits are enforced when you export.
				</p>
			</div>
		{/if}

		{#if brokenCount > 0}
			<label class="confirm">
				<input type="checkbox" bind:checked={acknowledgedConnectionLoss} />
				<span>
					Delete {brokenCount}
					{brokenCount === 1 ? 'connection' : 'connections'} that cannot survive the merge. This cannot
					be undone.
				</span>
			</label>
		{/if}
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

	.direction-row {
		display: flex;
		gap: 1.6rem;
		margin-bottom: 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	.direction-row label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.outcome {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
		border: 1px solid var(--gray-100);
		border-radius: 0.4rem;
	}

	.outcome li {
		display: flex;
		gap: 0.8rem;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		border-bottom: 1px solid var(--gray-100);
	}

	.outcome li:last-child {
		border-bottom: none;
	}

	.outcome-label {
		min-width: 9rem;
		color: var(--gray-300);
	}

	.outcome-value {
		color: var(--black);
	}

	.discards,
	.compliance {
		margin: 0 0 1.2rem;
		padding: 0.8rem;
		border-radius: 0.4rem;
		background: var(--gray-050, #f7f7f7);
	}

	.discards-head {
		margin: 0 0 0.4rem;
		font-size: 1.2rem;
		color: var(--gray-300);
	}

	.discard,
	.warning {
		margin: 0 0 0.6rem;
		font-size: 1.3rem;
		color: var(--black);
	}

	.dissolve {
		margin: 0 0 1.2rem;
		font-size: 1.3rem;
		color: var(--black);
	}

	.compliance-foot {
		margin: 0;
		font-size: 1.2rem;
		color: var(--gray-300);
	}

	.confirm {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		font-size: 1.3rem;
		color: var(--black);
		margin-bottom: 0.8rem;
	}

	.error {
		margin: 0;
		font-size: 1.3rem;
		color: var(--red);
	}
</style>
