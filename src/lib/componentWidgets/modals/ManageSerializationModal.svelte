<script>
	/**
	 * # ManageSerializationModal Component
	 *
	 * How the New Study form divides a study into a series. The controls themselves are
	 * `SeriesPartingControls`, shared with `SplitIntoSeriesModal` so the two dialogs cannot drift;
	 * this file is only what is particular to the form.
	 *
	 * ## Why a modal
	 *
	 * The part list alone can run to 150 rows (Psalms at one chapter per part), which pushed Save
	 * far off-screen when these controls sat inline in `StudyForm`.
	 *
	 * ## It edits a draft, and commits on Done
	 *
	 * Cancel must leave the form exactly as it was, so the modal seeds its own draft from the
	 * committed values each time it opens and writes back only on Done. Binding the form's state
	 * directly would make every stepper press permanent and Cancel a lie.
	 *
	 * ## It creates nothing
	 *
	 * Unlike `SplitIntoSeriesModal`, which converts a SAVED study through `/api/series`, this one
	 * only collects settings. The form still owns saving (§5 route 1: create-then-part).
	 *
	 * @property {boolean} isOpen
	 * @property {Array<Object>} passages - The form's passages, as currently selected
	 * @property {string} translationId
	 * @property {string} title - Study title, used to name the previewed parts
	 * @property {string} chaptersPerPart - Committed value (a string, as `Stepper` surfaces)
	 * @property {Record<string, string>} chaptersPerPassage - Committed per-passage divisions
	 * @property {(settings: Object) => void} onConfirm
	 * @property {() => void} onClose
	 *
	 * @component
	 */
	import { untrack } from 'svelte';
	import Modal from '$lib/componentElements/Modal.svelte';
	import SeriesPartingControls from '$lib/componentWidgets/SeriesPartingControls.svelte';
	import { DEFAULT_CHAPTERS_PER_PASSAGE } from '$lib/utils/partingDraft.js';

	let {
		isOpen = false,
		passages = [],
		translationId = 'esv',
		title = '',
		chaptersPerPart = '1',
		chaptersPerPassage = {},
		onConfirm,
		onClose
	} = $props();

	/** @type {{ mode: 'chapters' | 'balance', chapters: string, balanceTarget: string, perPassage: Record<string, string>, balancePerPassage: Record<string, string> }} */
	let settings = $state(freshSettings());
	let result = $state(null);

	/**
	 * The draft for one opening. Chapters is the default mode (§5: chapter boundaries mean
	 * something to readers). Every passage gets an EXPLICIT entry: the form reads an absent key as
	 * "leave whole", so a sparse draft would show 1 here and mean 0 there.
	 */
	function freshSettings() {
		/** @type {Record<string, string>} */
		const perPassage = {};
		for (const p of passages) {
			perPassage[p.id] = chaptersPerPassage[p.id] ?? String(DEFAULT_CHAPTERS_PER_PASSAGE);
		}
		return {
			mode: /** @type {'chapters' | 'balance'} */ ('chapters'),
			chapters: chaptersPerPart,
			balanceTarget: '',
			perPassage,
			balancePerPassage: {}
		};
	}

	// Re-seeded on each OPEN only. The seed reads the committed props, and an untracked read keeps
	// a passage edit behind a closed dialog from resetting a draft mid-edit.
	$effect(() => {
		if (isOpen) untrack(() => (settings = freshSettings()));
	});

	function handleConfirm() {
		if (!result?.canConfirm) return;
		// The CLAMPED values the preview was built from, not the raw draft, so what is committed is
		// exactly what the part list showed. The balance options travel too: the server re-plans,
		// and dropping them would rebuild the default shape instead of the approved one.
		onConfirm?.({
			chaptersPerPart: String(result.chaptersPerPart),
			chaptersPerPassage: result.chaptersPerPassageById,
			balanceByLength: result.balanceByLength,
			targetParts: result.targetParts,
			balancePerPassage: [...result.balancePerPassage]
		});
	}

	function handleClose() {
		onClose?.();
	}
</script>

<Modal
	{isOpen}
	title="Manage Serialization"
	size="medium"
	confirmLabel="Done"
	cancelLabel="Cancel"
	confirmDisabled={!result?.canConfirm}
	onConfirm={handleConfirm}
	onCancel={handleClose}
	onClose={handleClose}
>
	<!-- Mounted only while open, so the planner does not re-run on every keystroke in the form. -->
	{#if isOpen}
		<SeriesPartingControls
			isActive={isOpen}
			{passages}
			{translationId}
			{title}
			idPrefix="serialize"
			bind:settings
			bind:result
		/>
	{/if}
</Modal>
