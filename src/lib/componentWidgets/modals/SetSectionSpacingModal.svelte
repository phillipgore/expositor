<script>

	/**
	 * # SetSectionSpacingModal Component
	 *
	 * Lets the user set a uniform TOTAL vertical gap (in px) above one or more selected
	 * sections — i.e. the distance from the top of the column (first section) or from the
	 * previous section (other sections).
	 *
	 * The user thinks in terms of the TOTAL gap. Internally the app stores only the EXTRA
	 * offset beyond each section's default spacing, so the parent converts the entered total
	 * into a per-section offset on apply (offset = max(0, total − sectionDefault)).
	 *
	 * The parent measures, for the current selection:
	 *   - `currentGap` → the first selected section's current total gap (default input value)
	 *   - `minGap`     → the largest default gap among the selected sections (the floor; a
	 *                    section can never be tighter than its default spacing)
	 *
	 * On apply, emits the chosen TOTAL gap (an integer >= minGap) via `onApply`.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} sectionCount - Number of selected sections
	 * @property {number} currentGap - Current total gap of the first selected section (default input value)
	 * @property {number} minGap - Minimum allowed total gap (largest default among selection)
	 * @property {Function} onApply - (gap:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	let {
		isOpen = false,
		sectionCount = 0,
		currentGap = 0,
		minGap = 0,
		onApply,
		onClose
	} = $props();

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current total gap each time the modal opens.
	$effect(() => {
		if (isOpen) {
			value = String(Math.max(Math.round(currentGap), Math.round(minGap)));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));

	// Validation: must be a number and not below the spacing floor.
	let isTooSmall = $derived(Number.isFinite(numericValue) && numericValue < Math.round(minGap));
	let isInvalid = $derived(!Number.isFinite(numericValue) || isTooSmall);

	function handleApply() {
		if (isInvalid) return;
		// Clamp as a final safety net so a value below the floor can never be persisted.
		onApply?.(Math.max(Math.round(minGap), Math.round(numericValue)));
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
	title="Set Section Spacing"
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
			id="section-spacing-input"
			name="section-spacing"
			type="number"
			min={Math.round(minGap)}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>
	<p class="hint" class:error={isInvalid}>
		Minimum spacing is {Math.round(minGap)}px.
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

