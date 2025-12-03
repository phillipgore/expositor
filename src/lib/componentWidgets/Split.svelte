<script>
	import Segment from './Segment.svelte';

	let { 
		color = 'green',
		segments = [],
		passageIndex = 0,
		wrapWordsInHtml = null,
		isActive = false,
		toolbarMode = $bindable('outline')
	} = $props();
</script>

<div class="split {color}" class:active={isActive}>
	{#each segments as segment, index}
		<Segment
			heading1={segment.heading1}
			heading2={segment.heading2}
			heading3={segment.heading3}
			text={segment.text}
			{passageIndex}
			{wrapWordsInHtml}
			isActive={isActive && segments.length === 1}
			bind:toolbarMode
		/>
	{/each}
</div>

<style>
	.split {
		position: relative;
		/* CSS Custom Properties for color theming */
		--split-darker: var(--green-darker);
		--split-dark: var(--green-dark);
		--split-light: var(--green-light);
		--split-lighter: var(--green-lighter);
		--split-color: var(--green-dark);
	}

	.split:not(:first-of-type) {
		margin-top: 4.4rem;
	}

	.split :global(.segment:first-child),
	.split :global(.segment:first-child .heading-one) {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	.split:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--split-dark);
	}

	/* Color variant overrides */
	.split.red {
		--split-darker: var(--red-darker);
		--split-dark: var(--red-dark);
		--split-light: var(--red-light);
		--split-lighter: var(--red-lighter);
	}

	.split.orange {
		--split-darker: var(--orange-darker);
		--split-dark: var(--orange-dark);
		--split-light: var(--orange-light);
		--split-lighter: var(--orange-lighter);
	}

	.split.yellow {
		--split-darker: var(--yellow-darker);
		--split-dark: var(--yellow-dark);
		--split-light: var(--yellow-light);
		--split-lighter: var(--yellow-lighter);
	}

	.split.green {
		--split-darker: var(--green-darker);
		--split-dark: var(--green-dark);
		--split-light: var(--green-light);
		--split-lighter: var(--green-lighter);
	}

	.split.aqua {
		--split-darker: var(--aqua-darker);
		--split-dark: var(--aqua-dark);
		--split-light: var(--aqua-light);
		--split-lighter: var(--aqua-lighter);
	}

	.split.blue {
		--split-darker: var(--blue-darker);
		--split-dark: var(--blue-dark);
		--split-light: var(--blue-light);
		--split-lighter: var(--blue-lighter);
	}

	.split.purple {
		--split-darker: var(--purple-darker);
		--split-dark: var(--purple-dark);
		--split-light: var(--purple-light);
		--split-lighter: var(--purple-lighter);
	}

	.split.pink {
		--split-darker: var(--pink-darker);
		--split-dark: var(--pink-dark);
		--split-light: var(--pink-light);
		--split-lighter: var(--pink-lighter);
	}
</style>
