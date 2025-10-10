<script>
	import Label from '$lib/elements/Label.svelte';
	import Input from '$lib/elements/Input.svelte';

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
		containerClasses = ''
	} = $props();
</script>

<div class="input-field {containerClasses}">
	<Label forId={forId || id} text={label} classes={labelClasses} isInline={isLabelInline} isLarge={isLabelLarge}>
		{label}
	</Label>
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
</style>
