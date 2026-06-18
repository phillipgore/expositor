<script>
	/**
	 * # SetQuickNoteSlideModal Component
	 *
	 * Sets the selected connection quick note's SLIDE — how far the anchor dot
	 * rides ALONG the connection line (the connection's `noteAnchorT`). Stored as a
	 * 0..1 bezier parameter (0 = from-end, 1 = to-end, 0.5 = midpoint), but surfaced
	 * here as a PERCENTAGE 0–100% for readability: 0% sits the dot at the from-end,
	 * 100% at the to-end, 50% centres it on the line.
	 *
	 * Mirrors SetQuickNotePositionModal/SetQuickNoteOffsetModal's shape (numeric
	 * input + Apply/Cancel) but with no preset row; the range is a hard 0–100%.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {number} currentValue - The note's current slide as a percent (default input value)
	 * @property {Function} onApply - (percent:number) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	const MIN = 0;
	const MAX = 100;

	let { isOpen = false, currentValue = 50, onApply, onClose } = $props();

	// The working value of the number input (string, as inputs surface strings).
	let value = $state('');

	// Re-seed the input with the current slide (clamped to 0–100) when opened.
	$effect(() => {
		if (isOpen) {
			const seeded = Math.round(currentValue);
			value = String(Math.max(MIN, Math.min(MAX, Number.isFinite(seeded) ? seeded : 50)));
		}
	});

	// Parsed numeric value (NaN when blank/invalid).
	let numericValue = $derived(parseInt(value, 10));
	let isOutOfRange = $derived(
		Number.isFinite(numericValue) && (numericValue < MIN || numericValue > MAX)
	);
	let isInvalid = $derived(!Number.isFinite(numericValue) || isOutOfRange);

	function handleApply() {
		if (isInvalid) return;
		// Clamp as a final safety net so the dot can never leave the line.
		onApply?.(Math.max(MIN, Math.min(MAX, Math.round(numericValue))));
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
	title="Set Quick Note Slide"
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
			id="quick-note-slide-input"
			name="quick-note-slide"
			type="number"
			min={MIN}
			max={MAX}
			bind:value
			onkeydown={handleKeydown}
		/>
		<span class="suffix">%</span>
	</div>

	<p class="hint" class:error={isInvalid}>
		Slides the note's anchor along the connection line. 0% sits it at the start,
		100% at the end, 50% centres it.
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
