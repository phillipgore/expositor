<script>

	/**
	 * # SetSegmentPositionModal Component
	 *
	 * Lets the user set how far (in px) one or more selected segments are pulled to the
	 * RIGHT within their column (Analyze view only).
	 *
	 * The parent measures, for the current selection:
	 *   - `currentOffset` → the first selected segment's current offset (default input value)
	 *   - `maxOffset`     → the smallest limit among the selection — a segment's left edge
	 *                       must stay at least 36px left of the right edge of the segment
	 *                       above it
	 *
	 * On apply, emits the chosen offset (an integer in [0, maxOffset]) via `onApply`.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} segmentCount - Number of selected segments
	 * @property {number} currentOffset - Current offset of the first selected segment
	 * @property {number} maxOffset - Maximum allowed offset
	 * @property {Function} onApply - (offset:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	let {
		isOpen = false,
		segmentCount = 0,
		currentOffset = 0,
		maxOffset = 0,
		onApply,
		onClose
	} = $props();

	let max = $derived(Math.max(0, Math.floor(maxOffset)));

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current offset each time the modal opens.
	$effect(() => {
		if (isOpen) {
			value = String(Math.min(Math.max(0, Math.round(currentOffset)), max));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));

	let isOutOfRange = $derived(Number.isFinite(numericValue) && (numericValue < 0 || numericValue > max));
	let isInvalid = $derived(!Number.isFinite(numericValue) || isOutOfRange);

	function handleApply() {
		if (isInvalid) return;
		// Clamp as a final safety net.
		onApply?.(Math.min(max, Math.max(0, Math.round(numericValue))));
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
	title="Set Segment Position"
	size="small"
	confirmLabel="Apply"
	cancelLabel="Cancel"
	confirmDisabled={isInvalid}
	onConfirm={handleApply}
	onCancel={handleClose}
	onClose={handleClose}
>

	<div class="field">
		<Input
			id="segment-position-input"
			name="segment-position"
			type="number"
			min={0}
			{max}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>
	<p class="hint" class:error={isInvalid}>
		{#if max === 0}
			{segmentCount > 1 ? 'These segments' : 'This segment'} can't move right — the segment above leaves no room.
		{:else}
			Position must be between 0px and {max}px.
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
