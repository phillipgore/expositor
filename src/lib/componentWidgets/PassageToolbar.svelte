<script>
	import ButtonGrouped from '$lib/componentElements/buttons/ButtonGrouped.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { crossfade, fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	let { 
		toolbarMode = $bindable('outline'),
		isActive = false 
	} = $props();

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
				<div class="button-group">
					<IconButton iconId="split" classes="passage-toolbar" title="Split Text" isSquare></IconButton>
					<IconButton iconId="join" classes="passage-toolbar" title="Join Text" isSquare></IconButton>
				</div>
				<div class="button-group">
					<IconButton iconId="heading-one" classes="passage-toolbar" title="Insert Heading One" isSquare></IconButton>
					<IconButton iconId="heading-two" classes="passage-toolbar" title="Insert Heading Two" isSquare></IconButton>
					<IconButton iconId="heading-three" classes="passage-toolbar" title="Insert Heading Three" isSquare></IconButton>
				</div>
				<div class="button-group">
					<IconButton iconId="arrow-up" classes="passage-toolbar" title="Move Text Up" isSquare></IconButton>
					<IconButton iconId="arrow-down" classes="passage-toolbar" title="Move Text Down" isSquare></IconButton>
				</div>
				<div class="button-group">
					<IconButton iconId="outline-disconnect" classes="passage-toolbar" title="Disconnect Segment" isSquare></IconButton>
					<IconButton iconId="outline-connect" classes="passage-toolbar" title="Connect Segment" isSquare></IconButton>
				</div>
				<div class="button-group">
					<IconButton iconId="column-insert" classes="passage-toolbar" title="Insert Column" isSquare></IconButton>
					<IconButton iconId="column-remove" classes="passage-toolbar" title="Remove Column" isSquare></IconButton>
				</div>
			</div>
			{:else if toolbarMode === 'literary'}
			<div class="button-container literary" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
				<IconButton iconId="literary-chiasim" classes="passage-toolbar" title="Chiasim" isSquare></IconButton>
				<IconButton iconId="literary-paralell" classes="passage-toolbar" title="Paralell" isSquare></IconButton>
				<IconButton iconId="literary-repeat" classes="passage-toolbar" title="Repitition" isSquare></IconButton>
				<IconButton iconId="literary-intensify" classes="passage-toolbar" title="Intensification" isSquare></IconButton>
			</div>
			{:else if toolbarMode === 'color'}
			<div class="button-container color" in:receive={{ key: 'toolbar' }} out:send={{ key: 'toolbar' }}>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-red" title="Red" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-orange" title="Orange" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-yellow" title="Yellow" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-green" title="Green" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-aqua" title="Aqua" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-blue" title="Blue" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-purple" title="Purple" isSquare></IconButton>
				<IconButton iconId="circle" classes="passage-toolbar icon-fill-pink" title="Pink" isSquare></IconButton>
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
