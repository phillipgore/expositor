<script>
	/**
	 * # SplitIntoSeriesModal Component
	 *
	 * Turns an existing study into a series (SERIES_PLAN §5, "Split into a series…"). The controls
	 * are `SeriesPartingControls`, shared with `ManageSerializationModal` so the two dialogs cannot
	 * drift; this file is only what is particular to splitting a SAVED study.
	 *
	 * ## The preview is the point, not the stepper
	 *
	 * §5: the preview is how the user notices that Psalms at one chapter per part means 150 parts
	 * BEFORE committing. The shared controls plan with the same `planSeriesParts()` the endpoint
	 * runs, so what is previewed is exactly what gets built.
	 *
	 * ## A part the translation refuses cannot be reached
	 *
	 * The steppers are bounded by `allowedDivisionBounds()`, Create is gated on `findRefusedPart()`
	 * as a backstop, and `/api/series` refuses the same parts server-side. What is NOT enforced
	 * here is the series-wide EXPORT aggregate, which §5 records as export's to enforce.
	 *
	 * ## Multi-passage studies divide per passage, as in the form
	 *
	 * This used to say "one part per passage" with no control. The study already IS divided into
	 * passages the user drew, but each passage is still divisible, and `/api/series` already took
	 * `chaptersPerPassage` / `balancePerPassage`. So it now opens on the same per-passage rows as
	 * Manage Serialization, at one chapter per part.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} study - The source study (with `passages` and `translation`)
	 * @property {string|null} error - Server-side failure to surface, if any
	 * @property {Function} onCreate - (chaptersPerPart:number, options:{balanceByLength:boolean,
	 *   targetParts:number, chaptersPerPassage:number[], balancePerPassage:number[]}) => Promise<void>
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import { untrack } from 'svelte';
	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Checkbox from '$lib/componentElements/Checkbox.svelte';
	import SeriesPartingControls from '$lib/componentWidgets/SeriesPartingControls.svelte';

	let { isOpen = false, study = null, error = null, onCreate, onClose } = $props();

	let passages = $derived(study?.passages ?? []);

	/** §5/Q9: the default is 1, and the user chooses. Never derived from range length. */
	function freshSettings() {
		return { mode: /** @type {'chapters' | 'balance'} */ ('chapters'), chapters: '1', balanceTarget: '', perPassage: {}, balancePerPassage: {} };
	}

	/** @type {{ mode: 'chapters' | 'balance', chapters: string, balanceTarget: string, perPassage: Record<string, string>, balancePerPassage: Record<string, string> }} */
	let settings = $state(freshSettings());
	let result = $state(null);
	let isSubmitting = $state(false);
	let hasConfirmedLarge = $state(false);

	$effect(() => {
		if (isOpen) {
			untrack(() => {
				settings = freshSettings();
				isSubmitting = false;
				hasConfirmedLarge = false;
			});
		}
	});

	// Q10: confirm at 150. A refusal is wrong — 150 parts is probably a mis-click, but it is also
	// exactly what a Psalms series legitimately is.
	let partCount = $derived(result?.parts.length ?? 0);
	let needsConfirmation = $derived(partCount >= 150);

	$effect(() => {
		// Re-arm whenever the count drops back under the threshold, so the checkbox cannot stay
		// silently ticked from a previous stepper position.
		if (!needsConfirmation) hasConfirmedLarge = false;
	});

	let canCreate = $derived(
		Boolean(result?.canConfirm) && (!needsConfirmation || hasConfirmedLarge) && !isSubmitting
	);

	async function handleCreate() {
		if (!canCreate) return;
		isSubmitting = true;
		try {
			// Everything the planner reads travels, because the endpoint re-plans server-side:
			// sending only `chaptersPerPart` would rebuild the DEFAULT shape, not the approved one.
			await onCreate?.(result.chaptersPerPart, {
				balanceByLength: result.balanceByLength,
				targetParts: result.targetParts,
				chaptersPerPassage: [...result.chaptersPerPassage],
				balancePerPassage: [...result.balancePerPassage]
			});
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		onClose?.();
	}
</script>

<Modal
	{isOpen}
	title="Split into a Series"
	size="medium"
	confirmLabel="Create Series"
	confirmBusy={isSubmitting}
	confirmBusyLabel="Creating…"
	cancelLabel="Cancel"
	confirmDisabled={!canCreate}
	onConfirm={handleCreate}
	onCancel={handleClose}
	onClose={handleClose}
>
	<!-- Mounted only while open: this modal lives in MenuActions for the whole time a study is
	     viewed, and a mounted planner re-plans on every edit to that study. -->
	{#if isOpen}
	<SeriesPartingControls
		isActive={isOpen}
		{passages}
		translationId={study?.translation}
		title={study?.title ?? ''}
		idPrefix="split"
		confirmsLargeHere
		bind:settings
		bind:result
	>
		{#if error}
			<Alert color="red" look="subtle" message={error} spacingBottom="0.8rem" />
		{/if}

		{#if needsConfirmation}
			<Checkbox id="confirm-large-split" bind:checked={hasConfirmedLarge} spacingBottom="1.2rem">
				Yes, create {partCount} parts.
			</Checkbox>
		{/if}
	</SeriesPartingControls>
	{/if}
</Modal>
