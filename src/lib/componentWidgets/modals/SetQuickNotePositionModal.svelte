<script>
	/**
	 * # SetQuickNotePositionModal Component
	 *
	 * Sets the selected connection quick note's POSITION — how far the card slides
	 * ALONG its anchored edge, relative to the anchor dot (the connection's
	 * `noteOffset`). This is a SIGNED pixel value: negative slides the card one way
	 * along the edge, positive the other, and 0 centres it on the dot.
	 *
	 * The card can slide at most HALF its length along the edge before the anchor dot
	 * would fall off its end — exactly the clamp the drag-resize enforces. The parent
	 * measures that limit from the rendered card and passes it as `maxOffset`; the
	 * input is bounded to ±maxOffset and any out-of-range value is clamped on apply.
	 *
	 * Mirrors SetColumnWidthModal's shape (numeric input + Apply/Cancel) but with no
	 * preset row.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} currentValue - The note's current offset (default input value)
	 * @property {number} maxOffset - Max |slide| in px (half the card length along the slide axis)
	 * @property {Function} onApply - (offset:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	let { isOpen = false, currentValue = 0, maxOffset = 0, onApply, onClose } = $props();

	// The signed limit (px). Guard against a 0/negative measure so the input stays usable.
	let limit = $derived(Math.max(0, Math.round(maxOffset)));

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current offset (clamped to the limit) when opened.
	$effect(() => {
		if (isOpen) {
			const seeded = Math.round(currentValue) || 0;
			value = String(Math.max(-limit, Math.min(limit, seeded)));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));
	let isOutOfRange = $derived(Number.isFinite(numericValue) && Math.abs(numericValue) > limit);
	let isInvalid = $derived(!Number.isFinite(numericValue) || isOutOfRange);

	function handleApply() {
		if (!Number.isFinite(numericValue)) return;
		// Clamp as a final safety net so the dot can never slide off the card's edge.
		onApply?.(Math.max(-limit, Math.min(limit, Math.round(numericValue))));
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
	title="Set Quick Note Position"
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
			id="quick-note-position-input"
			name="quick-note-position"
			type="number"
			min={-limit}
			max={limit}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>

	<p class="hint" class:error={isInvalid}>
		Slides the note card along its edge relative to the anchor dot. 0 centres it.
		Range ±{limit}px.
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
