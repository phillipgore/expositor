<script>
	/**
	 * # ReorderRunsModal Component
	 *
	 * Reorders a series by moving RUNS, not parts (SERIES_PLAN §4, phase 3).
	 *
	 * ## Why the rows are runs
	 *
	 * §4: "reordering permutes runs. Parts within a run are rigid, and runs are never interleaved."
	 * Moving one part out of a contiguous block would produce a series claiming Romans 8 sits between
	 * chapters 3 and 4 — a false statement about the text, not a teaching order. So a run of several
	 * parts appears as ONE row, labelled for its span, and moves as a block.
	 *
	 * A contiguous series has exactly one run, and the menu disables the command rather than opening
	 * this with a single immovable row (§11).
	 *
	 * ## Buttons rather than drag
	 *
	 * Up/down buttons are keyboard-operable, screen-reader-announceable and precise. A drag handle is
	 * the richer gesture and can be added over the same endpoint later; shipping the accessible control
	 * first means the feature is usable by everyone from the start rather than only by pointer users.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} series - The series being reordered, with `parts`
	 * @property {Function} onDone
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import { describeRuns } from '$lib/utils/seriesReorder.js';

	let { isOpen = false, series = null, onDone, onClose } = $props();

	/** Working order, mutated locally so the user can arrange before committing. */
	let workingRuns = $state([]);
	let error = $state('');
	let submitting = $state(false);
	/** Moves applied so far, replayed against the server as (from, to) pairs. */
	let moves = $state([]);

	$effect(() => {
		if (isOpen) {
			workingRuns = series?.parts?.length ? describeRuns(series.parts).runs : [];
			moves = [];
			error = '';
			submitting = false;
		}
	});

	function move(index, delta) {
		const to = index + delta;
		if (to < 0 || to >= workingRuns.length) return;
		const next = workingRuns.slice();
		const [item] = next.splice(index, 1);
		next.splice(to, 0, item);
		workingRuns = next;
		// Recorded rather than derived: the server applies moves one at a time through the same planner
		// the pure layer verifies, so replaying the exact gestures cannot diverge from what was previewed.
		moves = [...moves, { fromIndex: index, toIndex: to }];
	}

	async function handleConfirm() {
		if (submitting || moves.length === 0) {
			onClose?.();
			return;
		}
		submitting = true;
		error = '';
		try {
			for (const step of moves) {
				const response = await fetch(`/api/series/${series.id}/reorder`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(step)
				});
				const result = await response.json();
				if (!response.ok) {
					error = result?.error ?? 'Could not reorder the series.';
					return;
				}
			}
			onDone?.();
		} catch (err) {
			console.error('Reorder failed:', err);
			error = 'Could not reach the server.';
		} finally {
			submitting = false;
		}
	}
</script>

<Modal
	{isOpen}
	title="Reorder Series"
	size="medium"
	confirmLabel={submitting ? 'Saving…' : 'Save Order'}
	confirmClasses="blue"
	confirmDisabled={submitting}
	onConfirm={handleConfirm}
	onCancel={onClose}
	{onClose}
>
	<p class="explain">
		Parts that follow one another in Scripture move together as a block, so the series can never
		claim a passage sits somewhere it does not.
	</p>

	<ul class="runs">
		{#each workingRuns as run, index (run.partIds.join(','))}
			<li class="run">
				<span class="run-position">{index + 1}</span>
				<span class="run-title">
					{run.title}
					{#if run.partCount > 1}
						<span class="run-count">{run.partCount} parts, moved together</span>
					{/if}
				</span>
				<span class="run-controls">
					<button
						type="button"
						class="step"
						onclick={() => move(index, -1)}
						disabled={index === 0 || submitting}
						aria-label={`Move ${run.title} earlier`}>↑</button
					>
					<button
						type="button"
						class="step"
						onclick={() => move(index, 1)}
						disabled={index === workingRuns.length - 1 || submitting}
						aria-label={`Move ${run.title} later`}>↓</button
					>
				</span>
			</li>
		{/each}
	</ul>

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

	.runs {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--gray-100);
		border-radius: 0.4rem;
	}

	.run {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		border-bottom: 1px solid var(--gray-100);
	}

	.run:last-child {
		border-bottom: none;
	}

	.run-position {
		min-width: 2rem;
		color: var(--gray-300);
	}

	.run-title {
		flex: 1;
		color: var(--black);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.run-count {
		font-size: 1.1rem;
		color: var(--gray-300);
	}

	.run-controls {
		display: flex;
		gap: 0.4rem;
	}

	.step {
		width: 2.6rem;
		height: 2.6rem;
		border: 1px solid var(--gray-200);
		border-radius: 0.4rem;
		background: var(--white);
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
	}

	.step:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.error {
		margin: 0.8rem 0 0;
		font-size: 1.3rem;
		color: var(--red);
	}
</style>
