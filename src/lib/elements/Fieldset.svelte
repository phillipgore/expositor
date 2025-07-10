<script>
	import { v4 as uuidv4 } from 'uuid';

	let { id, text, children } = $props();
</script>

<fieldset {id}>
	{#if text}
		<legend>{text}</legend>
	{/if}
	{@render children()}
</fieldset>

<style>
	fieldset {
		outline: none;
		padding: 1.4rem;
		margin: 0rem;
		min-width: 0rem;
		border-radius: 0.6rem;
		border: solid 0.1rem var(--gray-700);
		background-color: var(--gray-950);
		position: relative;
	}

	legend {
		padding: 0.4rem 0.9rem;
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.6rem;
		background-color: var(--gray-950);
	}
</style>
