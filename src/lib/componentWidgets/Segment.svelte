<script>
	import ToolbarPassage from './ToolbarPassage.svelte';

	let { 
		heading1 = null,
		heading2 = null,
		heading3 = null,
		text = '',
		passageIndex = 0,
		wrapWordsInHtml = null,
		isActive = false,
		toolbarMode = $bindable('outline')
	} = $props();
</script>

<div class="segment" class:active={isActive}>
	<ToolbarPassage bind:toolbarMode {isActive} />
	
	{#if heading1}
		<h4 class="heading-one">{heading1}</h4>
	{/if}
	{#if heading2}
		<h5 class="heading-two">{heading2}</h5>
	{/if}
	{#if heading3}
		<h6 class="heading-three">{heading3}</h6>
	{/if}
	
	<div class="text">
		{#if wrapWordsInHtml}
			{@html wrapWordsInHtml(text, passageIndex)}
		{:else}
			{@html text}
		{/if}
	</div>
</div>

<style>
	.segment {
		position: relative;
	}

	.heading-one {
		font-size: 1.6rem;
		text-align: center;
		padding: 0.9rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: white;
		background-color: var(--split-darker);
		border-color: var(--split-darker);
	}

	.heading-two {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		padding: 0.9rem;
		margin: 0.0rem;
		border-bottom: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		background-color: var(--split-lighter);
		color: var(--split-darker);
		border-color: var(--split-dark);
	}

	.heading-three {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0.0rem;
		padding: 0.9rem 0.9rem 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--split-dark);
	}

	.text {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		line-height: 1.6;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.9rem;
		-webkit-user-select: text;
		user-select: text;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-color: var(--split-dark);
	}

	.segment:last-child,
	.segment:last-child .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}
</style>
