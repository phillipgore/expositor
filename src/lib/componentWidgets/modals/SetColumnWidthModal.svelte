<script>

	/**
	 * # SetColumnWidthModal Component
	 *
	 * Lets the user set a uniform WIDTH (in px) across one or more selected columns.
	 *
	 * The parent measures, for the current selection:
	 *   - `currentWidth` → the first selected column's current rendered width (default input value)
	 *   - `minWidth`     → the minimum allowed width (the floor; a column can never be
	 *                      narrower than the application's readable minimum). This value is
	 *                      also the 1× base width for the active layout, so the snap-stop
	 *                      presets are derived from it.
	 *
	 * In addition to the free-form number input, a row of **presets** mirrors the exact
	 * snap stops the drag-resize uses (`SNAP_FACTORS` from useColumnResize): 1× (Min),
	 * 1.25×, 1.5×, 1.75×, 2×, 3×, 4×. Clicking a preset fills the input with the computed
	 * width (= minWidth × factor); the user still presses Apply to commit.
	 *
	 * On apply, emits the chosen width (an integer >= minWidth) via `onApply`.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} columnCount - Number of selected columns
	 * @property {number} currentWidth - Current width of the first selected column (default input value)
	 * @property {number} minWidth - Minimum allowed width (readable floor; also the 1× base)
	 * @property {Function} onApply - (width:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';
	import { SNAP_FACTORS } from '$lib/composables/useColumnResize.svelte.js';

	let {
		isOpen = false,
		columnCount = 0,
		currentWidth = 0,
		minWidth = 0,
		onApply,
		onClose
	} = $props();

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current width each time the modal opens.
	$effect(() => {
		if (isOpen) {
			value = String(Math.max(Math.round(currentWidth), Math.round(minWidth)));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));

	// Validation: must be a number and not below the readable floor.
	let isTooSmall = $derived(Number.isFinite(numericValue) && numericValue < Math.round(minWidth));
	let isInvalid = $derived(!Number.isFinite(numericValue) || isTooSmall);

	// Preset stops: 1× (the readable minimum) plus the drag-resize snap factors. Each
	// preset's width is minWidth × factor (minWidth being the 1× base for the layout).
	// Labels follow the drag tooltip's convention (e.g. "1.5×"); 1× is labeled "Min".
	let presets = $derived(
		[1, ...SNAP_FACTORS].map((factor) => ({
			factor,
			width: Math.round(Math.round(minWidth) * factor),
			label: factor === 1 ? 'Min' : `${factor}×`
		}))
	);

	/** Set the input to a preset's width without committing (Apply still required). */
	function selectPreset(width) {
		value = String(width);
	}

	function handleApply() {
		if (isInvalid) return;
		// Clamp as a final safety net so a value below the floor can never be persisted.
		onApply?.(Math.max(Math.round(minWidth), Math.round(numericValue)));
	}

	function handleClose() {
		onClose?.();
	}

	/** Apply on Enter from within the input. */
	function handleKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleApply();
		}
	}
</script>

<Modal
	{isOpen}
	title="Set Column Width"
	size="small"
	showCloseButton={false}
	confirmLabel="Apply"
	cancelLabel="Cancel"
	confirmDisabled={isInvalid}
	onConfirm={handleApply}
	onCancel={handleClose}
	onClose={handleClose}
>

	<div class="field">
		<Input
			id="column-width-input"
			name="column-width"
			type="number"
			min={Math.round(minWidth)}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>

	<div class="presets" role="group" aria-label="Width presets">
		{#each presets as preset (preset.factor)}
			<button
				type="button"
				class="preset"
				class:active={numericValue === preset.width}
				title="{preset.width}px"
				onclick={() => selectPreset(preset.width)}
			>
				{preset.label}
			</button>
		{/each}
	</div>

	<p class="hint" class:error={isInvalid}>
		Minimum width is {Math.round(minWidth)}px.
	</p>
</Modal>

<style>
	.field {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.suffix {
		font-size: 1.4rem;
		color: var(--black);
	}

	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1.2rem;
	}

	.preset {
		padding: 0.5rem 1.0rem;
		font-size: 1.2rem;
		line-height: 1;
		color: var(--black);
		background-color: var(--white);
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.6rem;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.preset:hover {
		border-color: var(--gray-500);
		background-color: var(--gray-900);
	}

	.preset.active {
		color: var(--white);
		background-color: var(--blue);
		border-color: var(--blue);
	}

	.hint {
		margin: 0.6rem 0.0rem 0.0rem;
		font-size: 1.2rem;
		color: var(--gray-300);
	}

	.hint.error {
		color: var(--red);
	}
</style>
