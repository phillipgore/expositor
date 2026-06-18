<script>
	/**
	 * # SetQuickNoteOffsetModal Component
	 *
	 * Sets the selected connection quick note's OFFSET — the gap the card floats OFF
	 * the connection line, perpendicular to it (the connection's `noteLead`). This is
	 * an UNSIGNED pixel distance: 0 sits the card flush against the line; larger
	 * values push it away, and a leader line bridges the gap.
	 *
	 * Mirrors SetColumnWidthModal's shape (numeric input + Apply/Cancel) but with no
	 * preset row; the minimum is 0 (the card can never cross the line).
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} currentValue - The note's current lead/gap (default input value)
	 * @property {Function} onApply - (lead:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	const MIN = 0;

	let { isOpen = false, currentValue = 0, onApply, onClose } = $props();

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current gap each time the modal opens.
	$effect(() => {
		if (isOpen) {
			value = String(Math.max(MIN, Math.round(currentValue) || 0));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));
	let isTooSmall = $derived(Number.isFinite(numericValue) && numericValue < MIN);
	let isInvalid = $derived(!Number.isFinite(numericValue) || isTooSmall);

	function handleApply() {
		if (isInvalid) return;
		// Clamp as a final safety net so a negative gap can never be persisted.
		onApply?.(Math.max(MIN, Math.round(numericValue)));
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
	title="Set Quick Note Offset"
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
			id="quick-note-offset-input"
			name="quick-note-offset"
			type="number"
			min={MIN}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">px</span>
	</div>

	<p class="hint" class:error={isInvalid}>
		Floats the note card off the connection line. 0 sits it flush against the line.
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
