<script>
	/**
	 * # MoveToGroupModal Component
	 * 
	 * Modal for selecting a destination group when moving studies/groups.
	 * Features real-time search with preserved hierarchy and confirmation step.
	 * 
	 * ## Features
	 * - Search input with real-time filtering
	 * - Hierarchical group list with indentation
	 * - Always shows full hierarchy even when searching
	 * - Confirmation step before moving
	 * - Circular nesting prevention
	 * - Keyboard accessible
	 * 
	 * ## Props
	 * @property {boolean} isOpen - Whether modal is open
	 * @property {Array} groups - All available groups
	 * @property {Array} selectedItems - Currently selected items to move
	 * @property {Function} onMoveToGroup - Callback when group is selected
	 * @property {Function} onClose - Callback when modal closes
	 * 
	 * @component
	 */

	import Modal from '$lib/componentElements/Modal.svelte';
	import Input from '$lib/componentElements/Input.svelte';
	import Icon from '$lib/componentElements/Icon.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import { wouldCreateCircularNesting } from '$lib/utils/groupHierarchy.js';
	import { flattenGroupsForDisplay } from '$lib/utils/groupFlattening.js';

	let { isOpen = false, groups = [], selectedItems = [], onMoveToGroup, onClose } = $props();

	let searchQuery = $state('');
	let searchInputRef = $state(null);
	let groupListElement = $state(null);
	let focusedGroupIndex = $state(0);

	let filteredGroups = $derived(flattenGroupsForDisplay(groups, searchQuery, selectedItems, groups));
	
	let hasResults = $derived(
		searchQuery.trim() === '' || filteredGroups.length > 0 || true // Always show "Ungrouped"
	);

	/**
	 * Handle group selection - move immediately
	 */
	async function handleGroupSelect(groupId) {
		if (onMoveToGroup) {
			await onMoveToGroup(groupId);
		}
		handleClose();
	}

	/**
	 * Handle modal close
	 */
	function handleClose() {
		searchQuery = '';
		
		// Reset scroll position to top
		if (groupListElement) {
			groupListElement.scrollTop = 0;
		}
		
		if (onClose) {
			onClose();
		}
	}

	/**
	 * Handle keyboard navigation through the group list
	 */
	function handleListKeyDown(event) {
		const itemCount = filteredGroups.length;
		if (itemCount === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				focusedGroupIndex = Math.min(focusedGroupIndex + 1, itemCount - 1);
				focusGroup(focusedGroupIndex);
				break;

			case 'ArrowUp':
				event.preventDefault();
				focusedGroupIndex = Math.max(focusedGroupIndex - 1, 0);
				focusGroup(focusedGroupIndex);
				break;

			case 'Home':
				event.preventDefault();
				focusedGroupIndex = 0;
				focusGroup(focusedGroupIndex);
				break;

			case 'End':
				event.preventDefault();
				focusedGroupIndex = itemCount - 1;
				focusGroup(focusedGroupIndex);
				break;

			case 'Enter':
				event.preventDefault();
				const focusedGroup = filteredGroups[focusedGroupIndex];
				if (focusedGroup && !focusedGroup.disabled) {
					handleGroupSelect(focusedGroup.id);
				}
				break;
		}
	}

	/**
	 * Focus a specific group by index
	 */
	function focusGroup(index) {
		const button = groupListElement?.querySelector(`[data-group-index="${index}"]`);
		if (button) {
			button.focus();
			button.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	/**
	 * Reset state when modal opens
	 */
	$effect(() => {
		if (isOpen) {
			searchQuery = '';
			focusedGroupIndex = 0;
		}
	});
</script>

<Modal
	{isOpen}
	title="Move To Group"
	size="medium"
	showConfirm={false}
	showCancel={false}
	showCloseButton={false}
	onClose={handleClose}
>
	<div class="modal-search">
		<Input
			bind:this={searchInputRef}
			id="group-search"
			name="group-search"
			type="search"
			placeholder="Search groups..."
			aria-label="Search groups"
			autofocus={true}
			bind:value={searchQuery}
		/>
	</div>

	<div class="group-list" bind:this={groupListElement} onkeydown={handleListKeyDown}>
		{#if filteredGroups.length > 0}
			{#each filteredGroups as group, index}
				<button
					class="group-item"
					class:disabled={group.disabled}
					class:highlighted={group.matches && searchQuery.trim() !== ''}
					style="padding-left: {1.2 + (group.depth * 1.2)}rem;"
					tabindex={index === 0 ? 0 : -1}
					data-group-index={index}
					disabled={group.disabled}
					onfocus={() => focusedGroupIndex = index}
					onclick={() => handleGroupSelect(group.id)}
				>
					<Icon iconId="folder" />
					<span class="group-name">{group.name}</span>
				</button>
			{/each}
		{:else}
			<div class="empty-state">
				<p>No groups found matching your search</p>
			</div>
		{/if}
	</div>

	<div class="modal-footer">
		<Button
			label="Close"
			classes="gray"
			handleClick={handleClose}
		/>
	</div>
</Modal>

<style>
	.modal-search {
		margin-bottom: 1.2rem;
	}

	.modal-search :global(input) {
		border-radius: 2.5vh;
	}

	.group-list {
		max-height: 40rem;
		overflow-y: auto;
		padding: 0.3rem;
		margin: -0.3rem;
	}

	.group-item {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		width: 100%;
		padding: 0.9rem 1.2rem;
		background: var(--white);
		border: none;
		border-radius: 0.3rem;
		cursor: pointer;
		font-size: 1.4rem;
		text-align: left;
		transition: background-color 0.15s;
		margin: 0.1rem 0;
	}

	.group-item:hover:not(.disabled) {
		background-color: var(--blue);
	}

	.group-item:hover:not(.disabled) .group-name {
		color: var(--white);
	}

	.group-item:hover:not(.disabled) :global(.icon) {
		fill: var(--white);
	}

	.group-item:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.group-item.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.group-item :global(.icon) {
		height: 1.4rem;
		width: 1.4rem;
		fill: var(--gray-300);
		flex-shrink: 0;
	}

	.group-name {
		flex: 1;
		font-weight: 500;
		color: var(--black);
	}

	.empty-state {
		padding: 3.0rem 1.2rem;
		text-align: center;
	}

	.empty-state p {
		margin: 0;
		font-size: 1.4rem;
		color: var(--gray-400);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 1.2rem;
		margin-top: 1.2rem;
		/* border-top: 0.1rem solid var(--gray-700); */
	}
</style>
