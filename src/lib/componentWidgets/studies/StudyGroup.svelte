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
		isSelected = false,
		isActive = false,
		isDropTarget = false,
		onToggleCollapse,
		onGroupHeaderClick,
		onStudyMouseDown,
		onStudyClick,
		isStudySelected,
		isStudyActive,
		isStudyBeingDragged,
		isDragging = false,
		formatPassageReference
	} = $props();
</script>

<div 
	class="group-section"
	class:drop-target={isDropTarget}
	data-group-id={group.id}
>
	<div class="group-header" class:selected={isSelected} class:active={isActive}>
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
				onclick={(e) => onGroupHeaderClick?.(e, group)}
				aria-label="Select group {group.name}"
			>
				<Icon iconId={'folder'} classes="folder-icon" />
				<span class="group-name">{group.name}</span>
				<span class="group-count">{group.studies.length}</span>
			</button>
		</div>
	</div>
	
	{#if !group.isCollapsed}
		<ul class="studies-list grouped" transition:slide={{ duration: 200 }}>
			{#each group.studies as study (study.id)}
				<li role="presentation" animate:flip={{ duration: 300 }}>
					<StudyItem
						{study}
						isSelected={isStudySelected(study.id)}
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

<style>
	.group-section {
		display: flex;
		flex-direction: column;
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
		background-color: var(--gray-light);
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
		padding: 1.3rem 0.6rem;
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
		/* background-color: pink; */
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
