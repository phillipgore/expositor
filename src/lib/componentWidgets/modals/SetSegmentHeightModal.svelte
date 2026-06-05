<script>

	/**
	 * # SetSegmentHeightModal Component
	 *
	 * Lets the user set a uniform pixel height across one or more selected segments.
	 *
	 * The parent measures, for the current selection:
	 *   - `tallestHeight`  → the tallest current rendered height (used as the default value)
	 *   - `minHeight`      → the tallest natural/content height (the floor; the entered
	 *                        value can never be smaller, or text would clip)
	 *
	 * On apply, emits the chosen height (an integer >= minHeight) via `onApply`.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} segmentCount - Number of selected segments
	 * @property {number} tallestHeight - Tallest current height (default input value)
	 * @property {number} minHeight - Minimum allowed height (content floor)
	 * @property {Function} onApply - (height:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	let {
		isOpen = false,
		segmentCount = 0,
		tallestHeight = 0,
		minHeight = 0,
		onApply,
		onClose
	} = $props();

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the tallest current height each time the modal opens.
	$effect(() => {
		if (isOpen) {
			value = String(Math.round(tallestHeight));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));

	// Validation: must be a number and not below the content floor.
	let isTooSmall = $derived(Number.isFinite(numericValue) && numericValue < Math.round(minHeight));
	let isInvalid = $derived(!Number.isFinite(numericValue) || isTooSmall);

	function handleApply() {
		if (isInvalid) return;
		onApply?.(Math.round(numericValue));
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
	title="Set Segment Height"
	size="small"
	showCloseButton={false}
	confirmLabel="Apply"
	cancelLabel="Cancel"
	onConfirm={handleApply}
	onCancel={handleClose}
	onClose={handleClose}
>

	<div class="field">
		<Input
			id="segment-height-input"
			name="segment-height"
			type="number"
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>
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
</style>

