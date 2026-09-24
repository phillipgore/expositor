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
	 * ## Buttons AND a drag handle
	 *
	 * Up/down buttons are keyboard-operable, screen-reader-announceable and precise, so they shipped
	 * first and they stay: the handle is an addition, not a replacement. WCAG 2.1.1 is satisfied by the
	 * buttons, exactly as `PassageSelector` and the Finder do it — every pointer gesture in this app has
	 * a keyboard equal.
	 *
	 * The handle drags a **run**, because a row is a run. That is what makes a drag safe here while a
	 * drag on the Finder's part rows would not be: there is no gesture available that could put Romans 8
	 * between chapters 3 and 4, since the block is what moves.
	 *
	 * ⚠️ It reuses `move()` rather than computing a landing index of its own. A separate path would be a
	 * second implementation of the permutation, and the `moves` array it appends to is what gets replayed
	 * against the server — the two must not be able to disagree. So a drag from 0 to 2 is recorded as the
	 * same steps the buttons would have recorded.
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
	import Alert from '$lib/componentElements/Alert.svelte';
	import Icon from '$lib/componentElements/Icon.svelte';
	import { describeRuns } from '$lib/utils/seriesReorder.js';
	import { messageForFailure } from '$lib/utils/apiErrors.js';

	let { isOpen = false, series = null, onDone, onClose } = $props();

	/** Working order, mutated locally so the user can arrange before committing. */
	let workingRuns = $state([]);
	let error = $state('');
	let submitting = $state(false);
	/** Moves applied so far, replayed against the server as (from, to) pairs. */
	let moves = $state([]);

	/** Index of the run currently held by the pointer, or null. */
	let draggingIndex = $state(null);
	/** Index whose row the pointer is over, so the target can be shown before release. */
	let dragOverIndex = $state(null);

	$effect(() => {
		if (isOpen) {
			workingRuns = series?.parts?.length ? describeRuns(series.parts).runs : [];
			moves = [];
			error = '';
			submitting = false;
			draggingIndex = null;
			dragOverIndex = null;
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

	/**
	 * Move the held run to `to`, as one recorded step.
	 *
	 * Expressed as a delta so it goes through `move()` — the single implementation of the permutation
	 * (see the ⚠️ in the header). `move()` also owns the bounds check, so a drop past either end is a
	 * no-op rather than a splice at a negative index.
	 */
	function dropOn(to) {
		if (draggingIndex === null || to === draggingIndex) return;
		move(draggingIndex, to - draggingIndex);
	}

	function handleDragStart(event, index) {
		if (submitting) {
			event.preventDefault();
			return;
		}
		draggingIndex = index;
		// `move` (not `copy`): reordering relocates a run, and the cursor should say so. `setData` is
		// required or Firefox refuses to start the drag at all.
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', String(index));
	}

	function handleDragOver(event, index) {
		if (draggingIndex === null) return;
		// Without preventDefault the row is not a valid drop target and `ondrop` never fires — the
		// single most common way an HTML5 drag silently does nothing.
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		dragOverIndex = index;
	}

	function handleDrop(event, index) {
		if (draggingIndex === null) return;
		event.preventDefault();
		dropOn(index);
		draggingIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		// Runs on cancel (Escape, drop outside) as well as after a successful drop, so the row never
		// stays stuck in its dragging state.
		draggingIndex = null;
		dragOverIndex = null;
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
					error = messageForFailure(
						response,
						result,
						'Could not reorder the series.',
						'reorder this series'
					);
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
	<p class="explain-drag">Drag a row by its handle, or use the arrow buttons.</p>

	<ul class="runs">
		{#each workingRuns as run, index (run.partIds.join(','))}
			<li
				class="run"
				class:dragging={draggingIndex === index}
				class:drag-over={dragOverIndex === index &&
					draggingIndex !== null &&
					draggingIndex !== index}
				ondragover={(e) => handleDragOver(e, index)}
				ondrop={(e) => handleDrop(e, index)}
			>
				<!-- Two decisions, both load-bearing:
				     1. `draggable` sits on the handle only, not the whole row. The row also holds two
				        buttons, and a draggable ancestor makes a browser start a drag from a mousedown on
				        them instead of clicking. The row is the drop TARGET; the handle is the drag SOURCE.
				     2. aria-hidden, and NOT focusable. The up/down buttons below are the keyboard route and
				        already announce the run by name. A focusable handle would add a second stop per row
				        that does nothing on its own — a grab/arrow/drop pattern would duplicate the
				        buttons, not extend them. -->
				<span
					class="run-handle"
					draggable={!submitting}
					aria-hidden="true"
					ondragstart={(e) => handleDragStart(e, index)}
					ondragend={handleDragEnd}
				>
					<Icon iconId="draggable" classes="handle-icon" />
				</span>
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
		<Alert color="red" look="subtle" message={error} spacingBottom="0rem" />
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 0.6rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	.explain-drag {
		margin: 0 0 1.2rem;
		font-size: 1.2rem;
		color: var(--gray-300);
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

	/* The held row stays visible rather than being hidden: at two or three runs the list is short, and
	   removing the row the user is holding leaves them dragging nothing they can identify. */
	.run.dragging {
		opacity: 0.5;
	}

	/* A line, not a fill: it says "it will land HERE", which a highlighted row does not. */
	.run.drag-over {
		box-shadow: inset 0 0.2rem 0 0 var(--blue);
	}

	.run-handle {
		display: flex;
		align-items: center;
		cursor: grab;
		flex-shrink: 0;
	}

	.run-handle:active {
		cursor: grabbing;
	}

	.run-handle :global(.handle-icon) {
		height: 1.4rem;
		fill: var(--gray-300);
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

</style>
