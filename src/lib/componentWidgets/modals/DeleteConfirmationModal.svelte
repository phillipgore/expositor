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

			// A series: cascades to every part (§4). Handled before the group/study branches
			// because a series is neither, and falling through would describe it as a study.
			if (item.type === 'series') {
				const partCount = item.data.parts?.length ?? item.data.partCount ?? 0;
				const copy = describeSeriesDeletion(item.data, partCount);

				return {
					title: copy.title,
					message: copy.message,
					consequences: copy.consequences,
					itemName: item.data.name,
					itemType: 'series'
				};
			}

			// A part of a series. The warning depends on where the part sits in its run, so the
			// sibling parts must be supplied; without them we cannot tell a run-splitting delete
			// from a harmless one and would have to guess. Falling back to the plain study copy is
			// the honest failure — silence is better than a fabricated consequence.
			if (item.type === 'study' && item.data.seriesId && Array.isArray(seriesParts)) {
				const copy = describePartDeletion(seriesParts, item.id);

				return {
					title: copy.title,
					message: copy.message,
					consequences: copy.consequences,
					itemName: item.data.title,
					itemType: 'part'
				};
			}

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

		<!--
			Series and part deletions carry several distinct consequences (§4 requires the part
			warning to name three), so they are listed rather than run together into one sentence
			where the third would be easy to skim past. Existing study/group deletions keep their
			single `warning` string above and render nothing here.
		-->
		{#if modalContent.consequences?.length}
			<ul class="modal-consequences">
				{#each modalContent.consequences as consequence}
					<li>{consequence}</li>
				{/each}
			</ul>
		{/if}

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

	ul.modal-consequences {
		margin: 0.9rem 0 0;
		padding-left: 2.1rem;
		font-size: 1.6rem;
		line-height: 1.75;
		color: var(--gray-400);
	}
</style>
