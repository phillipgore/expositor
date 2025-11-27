<script>
	/**
	 * # DeleteConfirmationModal Component
	 * 
	 * Modal for confirming deletion of studies and/or study groups.
	 * Provides detailed warnings about nested items and handles the deletion process.
	 * 
	 * ## Features
	 * - Dynamic content based on selection (single/multiple items)
	 * - Nested item counting for groups
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

	let { 
		isOpen = false, 
		selectedItem = null,
		onConfirm,
		onClose,
		openedViaKeyboard = false
	} = $props();

	let deleteInProgress = $state(false);
	let deleteError = $state('');

	/**
	 * Recursively count all nested groups and studies within a group
	 */
	function countNestedItems(group) {
		let nestedGroups = 0;
		let nestedStudies = group.studies?.length || 0;

		if (group.subgroups && group.subgroups.length > 0) {
			for (const subgroup of group.subgroups) {
				nestedGroups += 1;
				const counts = countNestedItems(subgroup);
				nestedGroups += counts.groups;
				nestedStudies += counts.studies;
			}
		}

		return { groups: nestedGroups, studies: nestedStudies };
	}

	/**
	 * Compute modal content based on selected items
	 */
	let modalContent = $derived.by(() => {
		if (!selectedItem) return null;

		const { items, count, hasGroups, hasStudies } = selectedItem;
		
		if (count === 0) return null;

		// Single item
		if (count === 1) {
			const item = items[0];
			if (item.type === 'group') {
				const counts = countNestedItems(item.data);
				const totalGroups = counts.groups;
				const totalStudies = counts.studies;
				
				let warningParts = [];
				if (totalGroups > 0) {
					warningParts.push(`${totalGroups} nested ${totalGroups === 1 ? 'group' : 'groups'}`);
				}
				if (totalStudies > 0) {
					warningParts.push(`${totalStudies} ${totalStudies === 1 ? 'study' : 'studies'}`);
				}
				
				const warning = warningParts.length > 0
					? `This will permanently delete ${warningParts.join(' and ')}.`
					: 'This action cannot be undone.';

				return {
					title: 'Delete Study Group',
					message: `Are you sure you want to delete the study group "${item.data.name}"?`,
					warning: warning,
					itemName: item.data.name,
					itemType: 'group'
				};
			} else {
				return {
					title: 'Delete Study',
					message: `Are you sure you want to delete the study "${item.data.title}"?`,
					warning: 'This action cannot be undone.',
					itemName: item.data.title,
					itemType: 'study'
				};
			}
		}

		// Multiple items - show only selected counts (smart preservation handles unselected items)
		const groupItems = items.filter(i => i.type === 'group');
		const studyItems = items.filter(i => i.type === 'study');
		
		const selectedGroupCount = groupItems.length;
		const selectedStudyCount = studyItems.length;

		let parts = [];
		if (selectedGroupCount > 0) {
			parts.push(`${selectedGroupCount} ${selectedGroupCount === 1 ? 'group' : 'groups'}`);
		}
		if (selectedStudyCount > 0) {
			parts.push(`${selectedStudyCount} ${selectedStudyCount === 1 ? 'study' : 'studies'}`);
		}

		// Warning: Mention that unselected items will be preserved
		let warning = 'Unselected items within groups will be preserved and moved to safe locations. This action cannot be undone.';

		return {
			title: 'Delete Multiple Items',
			message: `Are you sure you want to delete ${parts.join(' and ')}?`,
			warning: warning,
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
		confirmLabel={deleteInProgress ? 'Deleting...' : 'Delete'}
		confirmClasses="red"
		cancelLabel="Cancel"
		onConfirm={handleConfirm}
		onCancel={handleClose}
		onClose={handleClose}
		showCloseButton={false}
		closeOnBackdropClick={false}
		focusCancelOnOpen={openedViaKeyboard}
	>
		<p class="modal-message">
			{modalContent.message}{#if modalContent.warning}&nbsp;{modalContent.warning}{/if}
		</p>
		
		{#if deleteError}
			<p class="modal-message error">
				{deleteError}
			</p>
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

	p.modal-message.error {
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border: 0.1rem solid var(--red-light);
		border-radius: 0.3rem;
		padding: 0.3rem 0.9rem;
	}
</style>
