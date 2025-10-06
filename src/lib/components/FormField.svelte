<script>
	import Label from '$lib/elements/Label.svelte';
	import TextInput from '$lib/elements/TextInput.svelte';

	let {
		// Label props
		label,
		forId = undefined,
		labelClasses = '',
		isLabelInline = false,
		isLabelLarge = false,
		// TextInput props
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

<div class="form-field {containerClasses}">
	<Label forId={forId || id} text={label} classes={labelClasses} isInline={isLabelInline} isLarge={isLabelLarge}>
		{label}
	</Label>
	<TextInput 
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
	.form-field {
		margin-bottom: 1.8rem;
	}
</style>
