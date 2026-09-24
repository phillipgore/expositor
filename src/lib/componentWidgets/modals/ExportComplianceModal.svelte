<script>
	/**
	 * # ExportComplianceModal Component
	 *
	 * Shown before an export/print when `validateExportLimits()` reports that the
	 * artifact would exceed the translation's quotation permission.
	 *
	 * ## Why a modal, and why at this moment
	 *
	 * Distribution limits govern text that LEAVES the app, so the only honest place
	 * to raise them is the moment the user asks for a file or a printout —
	 * COMPLIANCE.md §1 lists export/print as the enforcement boundary. Warning
	 * earlier (at study creation) would be warning about an act the user has not
	 * chosen to perform; warning later is impossible.
	 *
	 * This is deliberately NOT the pattern used for display limits, which appear as
	 * an inline advisory in StudyForm. A display warning describes a standing state
	 * of the study, so an inline note the user can absorb and move past is right. An
	 * export warning is about a discrete action already in flight, and the only
	 * useful response is to proceed or not — which is a modal.
	 *
	 * ## Warn vs block comes from the JSON, not from here
	 *
	 * `restrictions.distribution.enforcement` decides whether the user may continue.
	 * Both translations are `'warn'` today, so this modal offers Continue; setting
	 * `'block'` in translations.json removes that button with no code change (§5
	 * item 5 anticipates exactly this at public release). The component reads
	 * `blocked` from the validator rather than re-reading the JSON, so the posture
	 * cannot drift between the check and the dialog.
	 *
	 * ## Props
	 * @property {boolean} isOpen - Whether the modal is open
	 * @property {string[]} warnings - Messages from `validateExportLimits()`, shown verbatim
	 * @property {boolean} blocked - True when enforcement is 'block'; hides Continue
	 * @property {number} totalVerses - Deduplicated verse count for the artifact
	 * @property {string} translationLabel - e.g. 'ESV', for the explanatory line
	 * @property {'png'|'pdf'|'print'} format - What the user asked for, so the copy can name it
	 * @property {Function} onConfirm - Called when the user chooses to continue anyway
	 * @property {Function} onClose - Called on cancel/dismiss
	 * @property {boolean} openedViaKeyboard - Focus the cancel button on open
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';

	let {
		isOpen = false,
		warnings = [],
		blocked = false,
		totalVerses = 0,
		translationLabel = '',
		format = 'png',
		onConfirm,
		onClose,
		openedViaKeyboard = false
	} = $props();

	// Name the artifact rather than saying "export" for a printout — the user asked
	// for a specific thing and the copy should match the button they pressed.
	const FORMAT_LABEL = {
		png: 'image',
		pdf: 'PDF',
		print: 'printout'
	};

	let artifact = $derived(FORMAT_LABEL[format] || 'export');

	/**
	 * The action the user is confirming, phrased as what they get. "Export anyway"
	 * is clearer than "Continue" because it names the consequence rather than the
	 * dialog mechanics.
	 */
	let confirmLabel = $derived(format === 'print' ? 'Print anyway' : 'Export anyway');

	function handleConfirm() {
		if (blocked) return;
		if (onConfirm) onConfirm();
	}

	function handleClose() {
		if (onClose) onClose();
	}
</script>

<Modal
	{isOpen}
	title={blocked ? 'Export not permitted' : 'Scripture quotation limit'}
	size="small"
	{confirmLabel}
	confirmClasses="blue"
	cancelLabel={blocked ? 'Close' : 'Cancel'}
	showConfirm={!blocked}
	onConfirm={handleConfirm}
	onCancel={handleClose}
	onClose={handleClose}
	closeOnBackdropClick={false}
	focusCancelOnOpen={openedViaKeyboard || blocked}
>
	<p class="lede">
		This {artifact} would reproduce {totalVerses}
		{totalVerses === 1 ? 'verse' : 'verses'} of Scripture.
	</p>

	<!-- The validator's own messages, verbatim. They already name the book, the
	     figure and the limit, and rewording them here would let two descriptions of
	     one rule drift apart — the failure COMPLIANCE.md §1.7 records. -->
	<ul class="warnings">
		{#each warnings as warning}
			<li>{warning}</li>
		{/each}
	</ul>

	{#if blocked}
		<p class="note">
			The {translationLabel} licence does not permit this, so the {artifact} has not been created. Reduce
			the passages in this study, or use a translation with broader quotation terms.
		</p>
	{:else}
		<!-- Warn-only posture: the study owner is the one bound by the licence, so
		     the app's job is to make the position visible, not to decide it. Same
		     reasoning as the display warning (COMPLIANCE.md §1.6). -->
		<p class="note">
			You may still continue — this is a limit in the {translationLabel} licence, and complying with
			it is your responsibility as the study's author.
		</p>
	{/if}
</Modal>

<style>
	.lede {
		margin: 0;
		font-size: 1.4rem;
		line-height: 1.5;
		color: var(--black);
	}

	/* Warning list matches the muted summary text used by JoinConfirmationModal. */
	.warnings {
		margin: 0.9rem 0 0;
		padding-left: 2rem;
		font-size: 1.4rem;
		line-height: 1.5;
		color: var(--gray-400);
	}

	.warnings li + li {
		margin-top: 0.6rem;
	}

	.note {
		margin: 1.2rem 0 0;
		font-size: 1.3rem;
		line-height: 1.5;
		color: var(--gray-400);
		font-style: italic;
	}
</style>
