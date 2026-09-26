<script>
	/**
	 * # DeleteConfirmationModal Component
	 * 
	 * Modal for confirming deletion of studies and/or study groups.
	 * Provides detailed warnings about nested items and handles the deletion process.
	 * 
	 * ## Features
	 * - Dynamic content based on selection (single/multiple items)
	 * - Smart preservation warnings for unselected items
	 * - Error handling with user feedback
	 * - Loading state during deletion
	 * - Keyboard accessible with focus management
	 * 
	 * ## Props
	 * @property {boolean} isOpen - Whether modal is open
	 * @property {Object} selectedItem - Selected items object with { items, count, hasGroups, hasStudies }
	 * @property {Function} onConfirm - Async callback when deletion is confirmed
	 * @property {Function} onClose - Callback when modal closes
	 * @property {boolean} openedViaKeyboard - Whether modal was opened via keyboard (for focus management)
	 * 
	 * @component
	 */

	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import { describePartDeletion, describeSeriesDeletion } from '$lib/utils/seriesRuns.js';

	let { 
		isOpen = false, 
		selectedItem = null,
		seriesParts = null,
		onConfirm,
		onClose,
		openedViaKeyboard = false
	} = $props();


	/**
	 * Shared by the Study Group and Delete Multiple Items confirmations. True because
	 * /api/bulk-delete moves unselected groups, studies and series out of a deleted group.
	 */
	const PRESERVATION_WARNING =
		'Unselected items within groups will be preserved and moved to safe locations. This action cannot be undone.';

	let deleteInProgress = $state(false);
	let deleteError = $state('');

	/**
	 * Compute modal content based on selected items
	 */
	let modalContent = $derived.by(() => {
		if (!selectedItem) return null;

		const { items, count } = selectedItem;
		
		if (count === 0) return null;

		// Single item
		if (count === 1) {
			const item = items[0];

			// A series: cascades to every part (§4). Handled before the group/study branches
			// because a series is neither, and falling through would describe it as a study.
			if (item.type === 'series') {
				const copy = describeSeriesDeletion(item.data);

				return {
					title: copy.title,
					message: copy.message,
					itemName: item.data.name,
					itemType: 'series'
				};
			}

			// A part of a series. The copy is one fixed sentence (§4 "Deletion"), so it no longer
			// depends on the sibling parts — a part is always described as a Series Part, even when
			// `seriesParts` was not supplied. Without siblings, the part itself is passed so its
			// title still resolves.
			if (item.type === 'study' && item.data.seriesId) {
				const parts = Array.isArray(seriesParts) ? seriesParts : [{ ...item.data, id: item.id }];
				const copy = describePartDeletion(parts, item.id);

				return {
					title: copy.title,
					message: copy.message,
					itemName: item.data.title,
					itemType: 'part'
				};
			}

			if (item.type === 'group') {
				// Contents are NOT deleted: /api/bulk-delete moves every unselected group, study and
				// series inside to the nearest surviving ancestor (see planGroupDeletion()).
				return {
					title: 'Delete Study Group',
					message: `Are you sure you want to delete the Study Group "${item.data.name}"?`,
					warning: PRESERVATION_WARNING,
					itemName: item.data.name,
					itemType: 'group'
				};
			} else {
				return {
					title: 'Delete Study',
					message: `Are you sure you want to delete the Study "${item.data.title}"?`,
					warning: 'This action cannot be undone.',
					itemName: item.data.title,
					itemType: 'study'
				};
			}
		}

		// Multiple items (smart preservation handles unselected items)
		return {
			title: 'Delete Multiple Items',
			message: 'Are you sure you want to delete the selected items?',
			warning: PRESERVATION_WARNING,
			itemName: `${count} items`,
			itemType: 'multiple'
		};
	});

	/**
	 * Handle delete confirmation
	 */
	async function handleConfirm() {
		if (!selectedItem || deleteInProgress) return;

		deleteInProgress = true;
		deleteError = '';

		try {
			// Call the parent's onConfirm handler
			if (onConfirm) {
				await onConfirm();
			}
			
			// If we get here, deletion was successful
			// Parent will handle closing the modal
		} catch (error) {
			console.error('Error in delete confirmation:', error);
			deleteError = error.message || 'Failed to delete. Please try again.';
		} finally {
			deleteInProgress = false;
		}
	}

	/**
	 * Handle modal close
	 */
	function handleClose() {
		if (!deleteInProgress) {
			deleteError = '';
			if (onClose) {
				onClose();
			}
		}
	}

	/**
	 * Reset error when modal closes
	 */
	$effect(() => {
		if (!isOpen) {
			deleteError = '';
		}
	});
</script>

{#if modalContent}
	<Modal
		{isOpen}
		title={modalContent.title}
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
			{modalContent.message}{#if modalContent.warning}&nbsp;{modalContent.warning}{/if}
		</p>

		{#if deleteError}
			<Alert color="red" look="subtle" message={deleteError} spacingBottom="0rem" />
		{/if}
	</Modal>
{/if}

<style>
	p.modal-message {
		margin: 0.0rem; 
		font-size: 1.6rem; 
		line-height: 1.75; 
		color: var(--gray-400);
	}

</style>
