<script>
	/**
	 * # TextareaField Component
	 * 
	 * Composite form field component that combines a label, textarea element, and optional badges
	 * for validation feedback. Provides a consistent interface for textarea inputs across the application.
	 * 
	 * @typedef {Object} TextareaFieldProps
	 * @property {string} label - Label text to display above the textarea
	 * @property {string} [forId] - HTML 'for' attribute for the label (defaults to id if not provided)
	 * @property {string} [labelClasses=''] - Additional CSS classes for the label
	 * @property {boolean} [isLabelInline=false] - Whether to display label inline
	 * @property {boolean} [isLabelLarge=false] - Whether to use large label styling
	 * @property {string} id - HTML id attribute for the textarea element (required)
	 * @property {string} name - HTML name attribute for the textarea element (required)
	 * @property {boolean} [isDisabled=false] - Whether the textarea is disabled
	 * @property {boolean} [isLarge=false] - Whether to use large textarea styling
	 * @property {string} value - Bindable value of the textarea field
	 * @property {string} [containerClasses=''] - Additional CSS classes for the outer container
	 * @property {boolean} [required=false] - Whether the field is required
	 * @property {'always'|'onError'} [requiredMode='always'] - When to show the required badge
	 * @property {boolean} [hasError=false] - Error state for conditional badge display
	 * @property {string} [infoMessage=''] - Optional informational message to display as badge
	 * @property {number} [rows=4] - Number of visible text lines
	 * @property {string} [placeholder] - Placeholder text
	 * 
	 * @component
	 */

	import Label from '$lib/componentElements/Label.svelte';
	import Textarea from '$lib/componentElements/Textarea.svelte';
	import Badge from '$lib/componentElements/Badge.svelte';
	import messages from '$lib/data/messages.json';

	/** @type {TextareaFieldProps} */
	let {
		// Label props
		label,
		forId = undefined,
		labelClasses = '',
		isLabelInline = false,
		isLabelLarge = false,
		// Textarea props
		id,
		name,
		isDisabled = false,
		isLarge = false,
		rows = 4,
		placeholder = undefined,
		// Bindable value
		value = $bindable(''),
		// Optional container classes
		containerClasses = '',
		// Required field indicator
		required = false,
		// Required badge display mode: "always" or "onError"
		requiredMode = 'always',
		// Error state for conditional badge display
		hasError = false,
		// Info message to display below textarea
		infoMessage = ''
	} = $props();

	/**
	 * Computed property to determine if the required badge should be displayed.
	 */
	const showRequiredBadge = $derived(
		required && (requiredMode === 'always' || (requiredMode === 'onError' && hasError))
	);

	/**
	 * Computed property to determine if the info badge should be displayed.
	 */
	const showInfoBadge = $derived(infoMessage && infoMessage.length > 0);
</script>

<div class="textarea-field {containerClasses}">
	<div class="label-wrapper">
		<Label forId={forId || id} text={label} classes={labelClasses} isInline={isLabelInline} isLarge={isLabelLarge}>
			{label}
		</Label>
		{#if showRequiredBadge && !infoMessage}
			<Badge color="red" message={messages.validation.fieldRequired} size="small" look="subtle"/>
		{/if}
		{#if showInfoBadge}
			<Badge color="blue" message={infoMessage} size="small" look="subtle"/>
		{/if}
	</div>
	<Textarea
		{id}
		{name}
		bind:value 
		{isDisabled} 
		{isLarge}
		{required}
		{rows}
		{placeholder}
	/>
</div>

<style>
	/* ============================================
	   FIELD CONTAINER
	   ============================================ */
	.textarea-field {
		margin-bottom: 1.8rem;
		width: 100%;
	}

	/* ============================================
	   LABEL & BADGE WRAPPER
	   ============================================ */
	.label-wrapper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.6rem;
	}

	/* ============================================
	   GLOBAL OVERRIDES (Scoped Children)
	   ============================================ */
	.label-wrapper :global(.badge) {
		margin-top: -0.3rem;
	}

	.label-wrapper :global(label) {
		margin-bottom: 0rem;
	}
</style>
