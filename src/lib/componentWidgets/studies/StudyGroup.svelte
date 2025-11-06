<script>
	/**
	 * StudyGroup Component
	 * 
	 * Displays a collapsible group with its studies.
	 * Handles group selection, collapse/expand, and contains StudyItem components.
	 */
	import Icon from '$lib/componentElements/Icon.svelte';
	import StudyItem from './StudyItem.svelte';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';

	let {
		group,
		depth = 0,
		isSelected = false,
		selectionPosition = null,
		isActive = false,
		dropTargetGroupId = null,
		onToggleCollapse,
		onGroupHeaderClick,
		onGroupMouseDown,
		onStudyMouseDown,
		onStudyClick,
		isStudySelected,
		getStudySelectionPosition,
		isStudyActive,
		isStudyBeingDragged,
		isDragging = false,
		formatPassageReference,
		// For nested groups
		isGroupSelected,
		getGroupSelectionPosition,
		isGroupActive
	} = $props();
	
	// Compute if THIS group is the drop target
	let isDropTarget = $derived(dropTargetGroupId === group.id);
	
	// Visual depth indicator (warn if too deep)
	let isVeryDeep = $derived(depth >= 5);
	
	// Calculate total count of child items (studies + subgroups)
	let totalChildCount = $derived.by(() => {
		const studiesCount = group.studies?.length || 0;
		const subgroupsCount = group.subgroups?.length || 0;
		return studiesCount + subgroupsCount;
	});
	
	// Click timing for distinguishing single-click from double-click
	let clickTimeout = $state(null);
	const CLICK_DELAY = 250; // ms to wait before treating as single-click
	
	/**
	 * Handle click with delay to distinguish from double-click
	 */
	function handleClick(event) {
		// Clear any existing timeout
		if (clickTimeout) {
			clearTimeout(clickTimeout);
			clickTimeout = null;
		}
		
		// Set a timeout to handle as single-click
		clickTimeout = setTimeout(() => {
			onGroupHeaderClick?.(event, group);
			clickTimeout = null;
		}, CLICK_DELAY);
	}
	
	/**
	 * Handle double-click - only expand/collapse, don't select
	 */
	function handleDoubleClick(event) {
		event.stopPropagation();
		
		// Cancel any pending single-click selection
		if (clickTimeout) {
			clearTimeout(clickTimeout);
			clickTimeout = null;
		}
		
		// Only toggle collapse state
		onToggleCollapse?.(group.id, group.isCollapsed);
	}
</script>

<div 
	class="group-section"
	class:drop-target={isDropTarget}
	class:very-deep={isVeryDeep}
	data-group-id={group.id}
	data-depth={depth}
>
	<div 
		class="group-header" 
		class:selected={isSelected}
		class:selection-first={isSelected && selectionPosition === 'first'}
		class:selection-middle={isSelected && selectionPosition === 'middle'}
		class:selection-last={isSelected && selectionPosition === 'last'}
		class:selection-isolated={isSelected && selectionPosition === 'isolated'}
		class:active={isActive}
		style:padding-left="{depth ? (depth * 1.4) + 0.6 : 0.6}rem"
	>
		<div class="group-info">
			<button 
				class="chevron-button"
				onclick={(e) => { e.stopPropagation(); onToggleCollapse?.(group.id, group.isCollapsed); }}
				aria-label={group.isCollapsed ? 'Expand group' : 'Collapse group'}
				aria-expanded={!group.isCollapsed}
			>
				<Icon iconId={group.isCollapsed ? 'chevron-right' : 'chevron-down'} classes="chevron-icon" />
			</button>
			<button 
				class="group-select-button"
				onclick={handleClick}
				ondblclick={handleDoubleClick}
				onmousedown={(e) => onGroupMouseDown?.(e, group)}
				aria-label="Select group {group.name}"
			>
				<Icon iconId={'folder'} classes="folder-icon" />
				<span class="group-name">{group.name}</span>
				{#if isVeryDeep}
					<div class="depth-warning" title="This group is nested very deep">
						<Icon iconId={'warning'} classes="warning-icon" />
					</div>
				{/if}
				<span class="group-count">{totalChildCount}</span>
			</button>
		</div>
	</div>
	
	{#if !group.isCollapsed}
		<div class="group-contents" transition:slide={{ duration: 200 }}>
			<!-- Render nested groups FIRST -->
			{#if group.subgroups && group.subgroups.length > 0}
				{#each group.subgroups as subgroup (subgroup.id)}
					<div animate:flip={{ duration: 300 }}>
						<svelte:self
							group={subgroup}
							depth={depth + 1}
							isSelected={isGroupSelected?.(subgroup.id) || false}
							selectionPosition={getGroupSelectionPosition?.(subgroup.id)}
							isActive={isGroupActive?.(subgroup.id) || false}
							{dropTargetGroupId}
							{onToggleCollapse}
							{onGroupHeaderClick}
							{onGroupMouseDown}
							{onStudyMouseDown}
							{onStudyClick}
							{isStudySelected}
							{getStudySelectionPosition}
							{isStudyActive}
							{isStudyBeingDragged}
							{isDragging}
							{formatPassageReference}
							{isGroupSelected}
							{getGroupSelectionPosition}
							{isGroupActive}
						/>
					</div>
				{/each}
			{/if}
			
			<!-- Then render studies -->
			{#if group.studies && group.studies.length > 0}
				<ul class="studies-list grouped">
					{#each group.studies as study (study.id)}
						<li role="presentation" animate:flip={{ duration: 300 }}>
							<StudyItem
								{study}
								depth={depth + 1}
								isSelected={isStudySelected(study.id)}
								selectionPosition={getStudySelectionPosition(study.id)}
								isActive={isStudyActive(study.id)}
								beingDragged={isStudyBeingDragged(study.id)}
								{isDragging}
								{formatPassageReference}
								onMouseDown={onStudyMouseDown}
								onClick={onStudyClick}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
	.group-section {
		display: flex;
		flex-direction: column;
		position: relative;
	}
	
	.group-contents {
		display: flex;
		flex-direction: column;
	}
	
	.very-deep .depth-warning {
		display: flex;
		color: var(--orange);
		font-size: 1.2rem;
		margin-left: 0.4rem;
	}

	.very-deep .depth-warning :global(.warning-icon) {
		height: 1.2rem;
		fill: var(--yellow);
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		padding: 0.0rem 0.0rem 0.0rem 0.6rem;
		background-color: transparent;
		border-radius: 0.3rem;
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.group-header.selected {
		background-color: var(--blue-light);
	}

	/* Multi-selection border-radius styles */
	.group-header.selected.selection-first {
		border-radius: 0.3rem 0.3rem 0 0;
	}

	.group-header.selected.selection-middle {
		border-radius: 0;
	}

	.group-header.selected.selection-last {
		border-radius: 0 0 0.3rem 0.3rem;
	}

	.group-header.selected.selection-isolated {
		border-radius: 0.3rem;
	}

	.group-header.active,
	.group-header.selected.active {
		background-color: var(--blue);
		color: var(--white);
	}

	.group-header.active :global(.folder-icon),
	.group-header.selected.active :global(.folder-icon) {
		fill: var(--white);
	}

	.group-header.active .chevron-button :global(.chevron-icon),
	.group-header.selected.active .chevron-button :global(.chevron-icon) {
		fill: var(--white);
	}

	.group-header.active .group-count,
	.group-header.selected.active .group-count {
		color: var(--white);
	}

	.group-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
	}

	.chevron-button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.3rem 0.0rem;
		width: 2.2rem;
		background-color: transparent;
		border: none;
		border-radius: 0.3rem;
		cursor: pointer;
		margin: -1.3rem -0.6rem -1.3rem -0.6rem;
		flex-shrink: 0;
	}

	.chevron-button:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.chevron-button :global(.chevron-icon) {
		height: 0.9rem;
		fill: var(--gray-200);
	}

	.group-select-button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0;
		background-color: transparent;
		border: none;
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
		cursor: pointer;
		text-align: left;
		flex: 1;
		border-radius: 0.3rem;
		padding: 0.9rem 0.9rem 0.9rem 0.0rem;
		transition: background-color 0.2s;
	}

	.group-select-button:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.group-select-button :global(.folder-icon) {
		fill: var(--gray-300);
		transition: fill 0.2s;
	}

	.group-name {
		flex: 1;
	}

	.group-count {
		font-size: 1.2rem;
		color: var(--gray-400);
	}

	.studies-list.grouped {
		list-style: none;
		padding-left: 0;
		margin: 0;
	}

	.group-section.drop-target {
		background-color: var(--gray-light);
		border-radius: 0.3rem;
	}
</style>
