<script>
	import ButtonGrouped from '$lib/componentElements/buttons/ButtonGrouped.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { crossfade, fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { getPassageToolbarConfig } from '$lib/utils/toolbarConfig.js';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { 
		toolbarMode = $bindable('outline'),
		isActive = false,
		onInsertColumn = () => {}
	} = $props();

	// Get toolbar configuration
	const toolbarConfig = getPassageToolbarConfig();

	// Button click handlers
	function handleButtonClick(button) {
		if (button.iconId === 'column-insert') {
			onInsertColumn();
		}
		// Add other button handlers as needed
	}

	// Create crossfade transitions
	const [send, receive] = crossfade({
		duration: 250,
		easing: quintOut
	});

	// Calculate inverse scale to keep toolbar at fixed size when page zooms
	let inverseScale = $derived.by(() => {
		const zoomLevel = $toolbarState.zoomLevel || 100;
		return 100 / zoomLevel;
	});

	// Calculate scaled position offsets to maintain correct positioning at different zoom levels
	// Use inverse scale: when zoomed in (larger), toolbar should be closer; when zoomed out (smaller), farther
	let scaledRight = $derived.by(() => {
		return -3.4 * inverseScale;
	});

	let scaledTop = $derived.by(() => {
		return -1.4 * inverseScale;
	});

	// Reset toolbar mode to 'outline' when component becomes inactive
	$effect(() => {
		if (!isActive) {
			toolbarMode = 'outline';
		}
	});
</script>

{#if isActive}
	<div class="controls" style="transform: scale({inverseScale}); transform-origin: top right; right: {scaledRight}rem; top: {scaledTop}rem;" transition:fade={{ duration: 150, easing: quintOut }}>
		<IconButton
			iconId="circle"
			classes="passage-toolbar"
			title="Section Select"
			isSquare
			isActive={toolbarMode === 'color'}
			handleClick={() => {
				toolbarMode = toolbarMode === 'color' ? 'outline' : 'color';
			}}
		/>
		{#if toolbarMode !== 'color'}
			<ButtonGrouped
				buttons={[
					{ id: 'outline', iconId: 'outline-section', label: '', title: 'View Outline Tools' },
					{ id: 'literary', iconId: 'literary-chiasim', label: '', title: 'View Literary Tools' }
				]}
				activeButton={toolbarMode !== 'color' ? toolbarMode : null}
				onActiveChange={(buttonId) => { toolbarMode = buttonId; }}
				buttonClasses='passage-toolbar'
				isSquare
				isList
			/>
		{/if}
		<DividerHorizontal width="2.8rem"/>
		{#key toolbarMode}
			{#if toolbarMode === 'outline'}
				<div class="button-container outline" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
					{#each toolbarConfig.outline as group}
						<div class="button-group">
							{#each group.buttons as button}
								<IconButton 
									iconId={button.iconId}
									classes="passage-toolbar"
									title={button.title}
									isSquare
									isDisabled={button.disabledCheck ? button.disabledCheck($toolbarState) : false}
									handleClick={() => handleButtonClick(button)}
								/>
							{/each}
						</div>
					{/each}
				</div>
			{:else if toolbarMode === 'literary'}
				<div class="button-container literary" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
					<div class="button-group">
						{#each toolbarConfig.literary as button}
							<IconButton 
								iconId={button.iconId}
								classes="passage-toolbar"
								title={button.title}
								isSquare
							/>
						{/each}
					</div>
				</div>
			{:else if toolbarMode === 'color'}
				<div class="button-container color" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
					<div class="button-group">
						{#each toolbarConfig.color as button}
							<IconButton 
								iconId={button.iconId}
								classes="passage-toolbar {button.classes || ''}"
								title={button.title}
								isSquare
							/>
						{/each}
					</div>
				</div>
			{/if}
		{/key}
	</div>
{/if}

<style>
	.controls {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		content: " ";
		width: 3.4rem;
		position: absolute;
		right: -3.4rem;
		top: -1.4rem;
		min-height: calc(100% - 1.2rem);
		overflow: hidden;
		gap: 0.6rem;
	}

	.controls :global(.group-container) {
		margin: 0.0rem;
	}

	.button-container {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding-left: 0.5rem;
		gap: 0.9rem;
	}

	.button-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
</style>
