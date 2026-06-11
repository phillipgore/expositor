<script>

	/**
	 * # SetColumnSpacingModal Component
	 *
	 * Lets the user set a uniform TOTAL horizontal gap (in px) to the LEFT of one or
	 * more selected columns — i.e. the distance between each column and the column
	 * before it.
	 *
	 * The user thinks in terms of the TOTAL gap. Internally the app stores only the
	 * EXTRA offset beyond each column's default spacing, so the parent converts the
	 * entered total into a per-column offset on apply
	 * (offset = clamp(0, maxOffset, total − columnDefault)).
	 *
	 * The parent measures, for the current selection:
	 *   - `currentGap` → the first selected column's current total gap (default input value)
	 *   - `minGap`     → the default gap (the floor; a column can never be tighter than
	 *                    its default spacing)
	 *   - `maxGap`     → the maximum total gap allowed (defaults to Infinity — no upper limit)
	 *
	 * On apply, emits the chosen TOTAL gap (an integer ≥ minGap, optionally ≤ maxGap)
	 * via `onApply`.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} columnCount - Number of selected columns
	 * @property {number} currentGap - Current total gap of the first selected column (default input value)
	 * @property {number} minGap - Minimum allowed total gap (default column spacing)
	 * @property {number} maxGap - Maximum allowed total gap (Infinity = unbounded)
	 * @property {Function} onApply - (gap:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	let {
		isOpen = false,
		columnCount = 0,
		currentGap = 0,
		minGap = 0,
		maxGap = Infinity,
		onApply,
		onClose
	} = $props();

	// Whether an upper limit is in effect (false = unbounded spacing).
	let hasMax = $derived(Number.isFinite(maxGap));


	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current total gap each time the modal opens.
	$effect(() => {
		if (isOpen) {
			const seed = Math.max(Math.round(currentGap), Math.round(minGap));
			value = String(hasMax ? Math.min(seed, Math.round(maxGap)) : seed);
		}
	});


	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));

	// Validation: must be a number ≥ minGap (and ≤ maxGap when an upper limit exists).
	let isTooSmall = $derived(Number.isFinite(numericValue) && numericValue < Math.round(minGap));
	let isTooLarge = $derived(hasMax && Number.isFinite(numericValue) && numericValue > Math.round(maxGap));
	let isInvalid = $derived(!Number.isFinite(numericValue) || isTooSmall || isTooLarge);

	function handleApply() {
		if (isInvalid) return;
		// Clamp as a final safety net so a value outside the range can never be persisted.
		const floored = Math.max(Math.round(minGap), Math.round(numericValue));
		const clamped = hasMax ? Math.min(Math.round(maxGap), floored) : floored;
		onApply?.(clamped);
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
	title="Set Column Spacing"
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
			id="column-spacing-input"
			name="column-spacing"
			type="number"
			min={Math.round(minGap)}
			max={hasMax ? Math.round(maxGap) : undefined}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>
	<p class="hint" class:error={isInvalid}>
		{#if hasMax}
			Spacing must be between {Math.round(minGap)}px and {Math.round(maxGap)}px.
		{:else}
			Spacing must be at least {Math.round(minGap)}px.
		{/if}
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

	.hint {
		margin: 0.6rem 0.0rem 0.0rem;
		font-size: 1.2rem;
		color: var(--gray-300);
	}

	.hint.error {
		color: var(--red);
	}
</style>
