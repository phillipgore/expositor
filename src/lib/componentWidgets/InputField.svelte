<script>
	/**
	 * # InputField Component
	 * 
	 * Composite form field component that combines a label, input element, and optional badges
	 * for validation feedback. Provides a consistent interface for form inputs across the application.
	 * 
	 * ## Features
	 * - Integrated label with customizable styling
	 * - Required field indicator badge with conditional display
	 * - Warning message badge for informational feedback
	 * - Two-way data binding via $bindable
	 * - Full control over label and input appearance
	 * - Flexible container styling
	 * 
	 * ## Badge Display Modes
	 * The `requiredMode` prop controls when the required badge is shown:
	 * - "always": Badge always visible when field is required
	 * - "onError": Badge only visible when field is required AND hasError is true
	 * 
	 * ## Usage Examples
	 * 
	 * Basic usage:
	 * ```svelte
	 * <InputField 
	 *   label="Email" 
	 *   id="email" 
	 *   name="email" 
	 *   type="email"
	 *   bind:value={email}
	 * />
	 * ```
	 * 
	 * With required badge (always shown):
	 * ```svelte
	 * <InputField 
	 *   label="Username" 
	 *   id="username" 
	 *   name="username"
	 *   bind:value={username}
	 *   required={true}
	 * />
	 * ```
	 * 
	 * With conditional required badge (shown only on error):
	 * ```svelte
	 * <InputField 
	 *   label="Password" 
	 *   id="password" 
	 *   name="password"
	 *   type="password"
	 *   bind:value={password}
	 *   required={true}
	 *   requiredMode="onError"
	 *   hasError={passwordError}
	 * />
	 * ```
	 * 
	 * With warning message:
	 * ```svelte
	 * <InputField 
	 *   label="API Key" 
	 *   id="apiKey" 
	 *   name="apiKey"
	 *   bind:value={apiKey}
	 *   warningMessage="Optional but recommended"
	 * />
	 * ```
	 * 
	 * @typedef {Object} InputFieldProps
	 * @property {string} label - Label text to display above the input
	 * @property {string} [forId] - HTML 'for' attribute for the label (defaults to id if not provided)
	 * @property {string} [labelClasses=''] - Additional CSS classes for the label
	 * @property {boolean} [isLabelInline=false] - Whether to display label inline
	 * @property {boolean} [isLabelLarge=false] - Whether to use large label styling
	 * @property {string} id - HTML id attribute for the input element (required)
	 * @property {string} name - HTML name attribute for the input element (required)
	 * @property {string} [type='text'] - Input type (text, email, password, etc.)
	 * @property {boolean} [isDisabled=false] - Whether the input is disabled
	 * @property {boolean} [isLarge=false] - Whether to use large input styling
	 * @property {string} value - Bindable value of the input field
	 * @property {string} [containerClasses=''] - Additional CSS classes for the outer container
	 * @property {boolean} [required=false] - Whether the field is required
	 * @property {'always'|'onError'} [requiredMode='always'] - When to show the required badge
	 * @property {boolean} [hasError=false] - Error state for conditional badge display
	 * @property {string} [warningMessage=''] - Optional warning message to display as badge
	 * @property {(event?: FocusEvent) => void} [onBlur] - Blur event handler for validation
	 * 
	 * @component
	 */

	import Label from '$lib/componentElements/Label.svelte';
	import Input from '$lib/componentElements/Input.svelte';
	import Badge from '$lib/componentElements/Badge.svelte';
	import messages from '$lib/data/messages.json';

	/** @type {InputFieldProps} */
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
		hasError = false,
		// Warning message to display below input
		warningMessage = '',
		// Blur event handler
		onBlur = undefined
	} = $props();

	/**
	 * Computed property to determine if the required badge should be displayed.
	 * Shows badge when field is required AND either:
	 * - requiredMode is "always", OR
	 * - requiredMode is "onError" and hasError is true
	 * 
	 * @type {boolean}
	 */
	const showRequiredBadge = $derived(
		required && (requiredMode === 'always' || (requiredMode === 'onError' && hasError))
	);

	/**
	 * Computed property to determine if the warning badge should be displayed.
	 * Shows badge when warningMessage has content.
	 * 
	 * @type {boolean}
	 */
	const showWarningBadge = $derived(warningMessage && warningMessage.length > 0);
</script>

<div class="input-field {containerClasses}">
	<div class="label-wrapper">
		<Label forId={forId || id} text={label} classes={labelClasses} isInline={isLabelInline} isLarge={isLabelLarge}>
			{label}
		</Label>
		{#if showRequiredBadge}
			<Badge color="red" message={messages.validation.fieldRequired} size="small" look="subtle"/>
		{/if}
		{#if showWarningBadge}
			<Badge color="blue" message={warningMessage} size="small" look="subtle"/>
		{/if}
	</div>
	<Input
		{id}
		{name} 
		{type} 
		bind:value 
		{isDisabled} 
		{isLarge}
		{required}
	/>
</div>

<style>
	/* ============================================
	   FIELD CONTAINER
	   ============================================ */
	.input-field {
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
