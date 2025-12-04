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
		isActive = false 
	} = $props();

	// Get toolbar configuration
	const toolbarConfig = getPassageToolbarConfig();

	// Create crossfade transitions
	const [send, receive] = crossfade({
		duration: 250,
		easing: quintOut
	});

	// Reset toolbar mode to 'outline' when component becomes inactive
	$effect(() => {
		if (!isActive) {
			toolbarMode = 'outline';
		}
	});
</script>

{#if isActive}
	<div class="controls" transition:fade={{ duration: 150, easing: quintOut }}>
		<ButtonGrouped
			buttons={[
				{ id: 'outline', iconId: 'outline-section', label: '', title: 'View Outline Tools' },
				{ id: 'literary', iconId: 'literary-chiasim', label: '', title: 'View Literary Tools' },
				{ id: 'color', iconId: 'paintbrush', label: '', title: 'View Color Tools' }
			]}
			defaultActive='outline'
			onActiveChange={(buttonId) => { toolbarMode = buttonId; }}
			buttonClasses='passage-toolbar'
			isSquare
			isList
		/>
		<DividerHorizontal width="2.8rem" spacingTop="1.2rem" spacingBottom="1.2rem"/>
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
								/>
							{/each}
						</div>
					{/each}
				</div>
			{:else if toolbarMode === 'literary'}
				<div class="button-container literary" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
					{#each toolbarConfig.literary as button}
						<IconButton 
							iconId={button.iconId}
							classes="passage-toolbar"
							title={button.title}
							isSquare
						/>
					{/each}
				</div>
			{:else if toolbarMode === 'color'}
				<div class="button-container color" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
					{#each toolbarConfig.color as button}
						<IconButton 
							iconId={button.iconId}
							classes="passage-toolbar {button.classes || ''}"
							title={button.title}
							isSquare
						/>
					{/each}
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
		top: 0.6rem;
		min-height: calc(100% - 1.2rem);
		overflow: hidden;
	}

	.controls :global(.group-container) {
		margin: 0.0rem;
	}

	.button-container {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding-left: 0.5rem;
		gap: 0.6rem;
	}

	.button-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
</style>
