<script>
	/**
	 * # DeleteHeadingsConfirmationModal Component
	 *
	 * Confirms deleting several headings at once (Markup menu → Select All, then the
	 * toolbar's Delete). Deleting one heading stays instant and doesn't use this modal.
	 *
	 * ## Props
	 * @property {boolean} isOpen - Whether modal is open
	 * @property {number} count - How many headings will be deleted
	 * @property {Function} onConfirm - Async callback when deletion is confirmed (throw to show an error)
	 * @property {Function} onClose - Callback when modal closes
	 * @property {boolean} openedViaKeyboard - Whether modal was opened via keyboard (for focus management)
	 *
	 * @component
	 */

	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';

	let {
		isOpen = false,
		count = 0,
		onConfirm,
		onClose,
		openedViaKeyboard = false
	} = $props();

	let deleteInProgress = $state(false);
	let deleteError = $state('');

	async function handleConfirm() {
		if (deleteInProgress) return;
		deleteInProgress = true;
		deleteError = '';
		try {
			if (onConfirm) await onConfirm();
		} catch (error) {
			console.error('Error deleting headings:', error);
			deleteError = error.message || 'Failed to delete headings. Please try again.';
		} finally {
			deleteInProgress = false;
		}
	}

	function handleClose() {
		if (deleteInProgress) return;
		deleteError = '';
		if (onClose) onClose();
	}

	$effect(() => {
		if (!isOpen) deleteError = '';
	});
</script>

<Modal
	{isOpen}
	title="Delete Headings"
	size="small"
	confirmLabel={deleteInProgress ? 'Deleting…' : 'Delete'}
	confirmClasses="red"
	cancelLabel="Cancel"
	onConfirm={handleConfirm}
	onCancel={handleClose}
	onClose={handleClose}
	closeOnBackdropClick={false}
	focusCancelOnOpen={openedViaKeyboard}
>
	<p class="modal-message">
		Are you sure you want to delete {count} headings? Their commentary will be deleted too. This action cannot be undone.
	</p>

	{#if deleteError}
		<Alert color="red" look="subtle" message={deleteError} spacingBottom="0rem" />
	{/if}
</Modal>

<style>
	p.modal-message {
		margin: 0rem;
		font-size: 1.6rem;
		line-height: 1.75;
		color: var(--gray-400);
	}
</style>
