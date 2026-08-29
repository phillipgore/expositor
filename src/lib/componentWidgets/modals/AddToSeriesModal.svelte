<script>
	/**
	 * # AddToSeriesModal Component
	 *
	 * Adds an existing standalone study to a series as a new part (SERIES_PLAN Q17, phase 3).
	 *
	 * ## The warnings are the point
	 *
	 * §4's invariant table is deliberately uneven: a translation mismatch **refuses**, while a gap, an
	 * overlap or a different book only **warn**. Prison Epistles is four books with three permanently
	 * dead boundaries and is §4's own example of a legitimate series — so this dialog exists to state
	 * the consequence ("structural commands will not work across that boundary") rather than to stop
	 * the user.
	 *
	 * Warnings come from the server's `dryRun`, not from a second copy of the rule here: the planner
	 * that judges the drop is the planner that performs it, so what the dialog promises is what happens.
	 *
	 * ## Two entry points, one dialog
	 *
	 * The menu command leaves the target open, so the user picks a series. The drag gesture has already
	 * named one by dropping on its row, so `fixedSeriesId` preselects it and the picker goes away — an
	 * enabled dropdown there would invite the user to contradict the gesture they just made, and a
	 * disabled one would be a control that cannot be operated. The confirmation itself is NOT skipped:
	 * the drop chose a target, it did not read §4's warnings.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} study - The standalone study being added
	 * @property {Array} series - Every series available to the user
	 * @property {string|null} [fixedSeriesId] - Target chosen by a drop; hides the picker when set
	 * @property {Function} onDone - Called after a successful add
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';

	let {
		isOpen = false,
		study = null,
		series = [],
		fixedSeriesId = null,
		onDone,
		onClose
	} = $props();

	let selectedSeriesId = $state('');
	let preview = $state(null);
	let error = $state('');
	let submitting = $state(false);

	$effect(() => {
		if (isOpen) {
			// A dropped target wins over the first-series default: the gesture already said which one.
			selectedSeriesId = fixedSeriesId ?? series?.[0]?.id ?? '';
			preview = null;
			error = '';
			submitting = false;
			void refresh();
		}
	});

	/** Dry-run the add so the dialog can state the consequences before the user commits. */
	async function refresh() {
		if (!selectedSeriesId || !study?.id) {
			preview = null;
			return;
		}
		const result = await request(true);
		preview = result?.ok ? result : null;
	}

	/** One request shape for the dry run and the commit, so they cannot diverge. */
	async function request(dryRun) {
		error = '';
		try {
			const response = await fetch(`/api/series/${selectedSeriesId}/parts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ studyId: study.id, dryRun })
			});
			const result = await response.json();
			if (!response.ok) {
				// The planner's refusal names both translations, or says the study already belongs
				// somewhere — more use to the reader than a generic failure.
				error = result?.error ?? 'Could not add this study to the series.';
				return null;
			}
			return result;
		} catch (err) {
			console.error('Add to series failed:', err);
			error = 'Could not reach the server.';
			return null;
		}
	}

	async function handleConfirm() {
		if (submitting) return;
		submitting = true;
		try {
			const result = await request(false);
			if (result?.ok) onDone?.(result);
		} finally {
			submitting = false;
		}
	}

	let targetSeries = $derived(series?.find((s) => s.id === selectedSeriesId) ?? null);

	// Only a refusal disables Add. Warnings never do — §4 makes contiguity a warning, and blocking on it
	// would forbid the Prison Epistles series the plan names as legitimate.
	let confirmDisabled = $derived(submitting || !selectedSeriesId || Boolean(error));
</script>

<Modal
	{isOpen}
	title="Add to Series"
	size="medium"
	confirmLabel={submitting ? 'Adding…' : 'Add to Series'}
	confirmClasses="blue"
	{confirmDisabled}
	onConfirm={handleConfirm}
	onCancel={onClose}
	{onClose}
>
	{#if !series?.length}
		<p class="explain">There are no series yet. Split a study into a series first.</p>
	{:else}
		<p class="explain">
			Add <strong>{study?.title ?? 'this study'}</strong> to a series as a new part. It becomes the last
			part; you can move it afterwards by reordering the series.
		</p>

		{#if fixedSeriesId}
			<!-- The drop named the target, so it is stated rather than offered (see the note above). -->
			<div class="row">
				<span class="row-label">Series</span>
				<span class="row-value">{targetSeries?.name ?? 'Selected series'}</span>
			</div>
		{:else}
			<div class="row">
				<label class="row-label" for="target-series">Series</label>
				<select
					id="target-series"
					bind:value={selectedSeriesId}
					onchange={refresh}
					disabled={submitting}
				>
					{#each series as option}
						<option value={option.id}>{option.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if preview?.ok}
			<ul class="outcome">
				<li>
					<span class="outcome-label">Becomes</span>
					<span class="outcome-value">
						Part {(targetSeries?.parts?.length ?? 0) + 1} of {(targetSeries?.parts?.length ?? 0) +
							1}
					</span>
				</li>
			</ul>

			{#if preview.warnings?.length}
				<!-- Stated, never blocking (§4). Each names its consequence rather than just the shape. -->
				<div class="warnings" role="status">
					{#each preview.warnings as warning}
						<p class="warning">{warning}</p>
					{/each}
					<p class="warnings-foot">You can still add it.</p>
				</div>
			{/if}
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 1.2rem;
	}

	.row-label {
		font-size: 1.4rem;
		color: var(--black);
	}

	.row-value {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--black);
	}

	select {
		font-size: 1.4rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--gray-200);
		border-radius: 0.4rem;
		background: var(--white);
		flex: 1;
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
	}

	.outcome-label {
		min-width: 8rem;
		color: var(--gray-300);
	}

	.outcome-value {
		color: var(--black);
	}

	.warnings {
		margin: 0 0 1.2rem;
		padding: 0.8rem;
		border-radius: 0.4rem;
		background: var(--gray-050, #f7f7f7);
	}

	.warning {
		margin: 0 0 0.6rem;
		font-size: 1.3rem;
		color: var(--black);
	}

	.warnings-foot {
		margin: 0;
		font-size: 1.2rem;
		color: var(--gray-300);
	}

	.error {
		margin: 0;
		font-size: 1.3rem;
		color: var(--red);
	}
</style>
