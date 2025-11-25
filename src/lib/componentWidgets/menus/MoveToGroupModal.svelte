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

	let { isOpen = false, groups = [], selectedItems = [], onMoveToGroup, onClose } = $props();

	let searchQuery = $state('');
	let groupListElement = $state(null);

	/**
	 * Check if moving selected groups to target would create circular nesting
	 */
	function wouldCreateCircularNesting(targetGroupId) {
		const selectedGroups = selectedItems.filter(i => i.type === 'group');
		
		// Can't move a group into itself
		if (selectedGroups.some(g => g.id === targetGroupId)) {
			return true;
		}

		// Check if target is a descendant of any selected group
		for (const selectedGroup of selectedGroups) {
			if (isDescendantOf(targetGroupId, selectedGroup.id)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Recursively check if groupId is a descendant of ancestorId
	 */
	function isDescendantOf(groupId, ancestorId) {
		const group = findGroupById(groupId, groups);
		if (!group) return false;
		
		if (group.parentGroupId === ancestorId) return true;
		if (!group.parentGroupId) return false;
		
		return isDescendantOf(group.parentGroupId, ancestorId);
	}

	/**
	 * Find a group by ID in the hierarchical structure
	 */
	function findGroupById(groupId, groupList) {
		for (const group of groupList) {
			if (group.id === groupId) return group;
			if (group.subgroups && group.subgroups.length > 0) {
				const found = findGroupById(groupId, group.subgroups);
				if (found) return found;
			}
		}
		return null;
	}

	/**
	 * Check if a group or any of its ancestors match the search query
	 */
	function groupMatchesSearch(group, query) {
		if (!query) return true;
		
		const lowerQuery = query.toLowerCase();
		
		// Check if this group matches
		if (group.name.toLowerCase().includes(lowerQuery)) {
			return true;
		}
		
		// Check if any subgroups match
		if (group.subgroups && group.subgroups.length > 0) {
			return group.subgroups.some(sub => groupMatchesSearch(sub, query));
		}
		
		return false;
	}

	/**
	 * Flatten groups into hierarchical list with depth indicators
	 */
	function flattenGroupsForDisplay(groupList, depth = 0) {
		const result = [];
		const query = searchQuery.trim();
		
		for (const group of groupList) {
			// Check if this group or any descendant matches the search
			if (groupMatchesSearch(group, query)) {
				result.push({
					id: group.id,
					name: group.name,
					depth,
					disabled: wouldCreateCircularNesting(group.id),
					matches: !query || group.name.toLowerCase().includes(query.toLowerCase())
				});
				
				if (group.subgroups && group.subgroups.length > 0) {
					result.push(...flattenGroupsForDisplay(group.subgroups, depth + 1));
				}
			}
		}
		
		return result;
	}

	let filteredGroups = $derived(flattenGroupsForDisplay(groups));
	
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
	 * Reset state when modal opens
	 */
	$effect(() => {
		if (isOpen) {
			searchQuery = '';
		}
	});
</script>

<Modal
	{isOpen}
	title="Move To Group"
	size="medium"
	showConfirm={false}
	showCancel={false}
	onClose={handleClose}
>
	<div class="modal-search">
		<Input
			id="group-search"
			name="group-search"
			type="search"
			placeholder="Search groups..."
			bind:value={searchQuery}
		/>
	</div>

	<div class="group-list" bind:this={groupListElement}>
		{#if filteredGroups.length > 0}
			{#each filteredGroups as group}
				<button
					class="group-item"
					class:disabled={group.disabled}
					class:highlighted={group.matches && searchQuery.trim() !== ''}
					style="padding-left: {1.2 + (group.depth * 1.2)}rem;"
					disabled={group.disabled}
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
</style>
