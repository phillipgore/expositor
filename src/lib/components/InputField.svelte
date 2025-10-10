<script>
	import Label from '$lib/elements/Label.svelte';
	import Input from '$lib/elements/Input.svelte';
	import Badge from '$lib/elements/badge.svelte';

	let {
		// Label props
		label,
		forId = undefined,
		labelClasses = '',
		isLabelInline = false,
		isLabelLarge = false,
		// Input props
		id,
		name,
		type = 'text',
		isFullWidth = true,
		isDisabled = false,
		isLarge = false,
		// Bindable value
		value = $bindable(''),
		// Optional container classes
		containerClasses = '',
		// Required field indicator
		required = false,
		// Required badge display mode: "always" or "onError"
		requiredMode = 'always',
		// Error state for conditional badge display
		hasError = false
	} = $props();

	// Determine if badge should be shown
	const showRequiredBadge = $derived(
		required && (requiredMode === 'always' || (requiredMode === 'onError' && hasError))
	);
</script>

<div class="input-field {containerClasses}">
	<div class="label-wrapper">
		<Label forId={forId || id} text={label} classes={labelClasses} isInline={isLabelInline} isLarge={isLabelLarge}>
			{label}
		</Label>
		{#if showRequiredBadge}
			<Badge color="red" message="Required" size="small" look="subtle"/>
		{/if}
	</div>
	<Input
		{id}
		{name} 
		{type} 
		bind:value 
		{isFullWidth} 
		{isDisabled} 
		{isLarge}
	/>
</div>

<style>
	.input-field {
		margin-bottom: 1.8rem;
	}

	.label-wrapper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.6rem;
	}

	:global(.badge) {
		margin-top: -0.3rem;
	}
</style>
