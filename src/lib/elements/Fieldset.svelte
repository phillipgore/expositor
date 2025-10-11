<script>
	/**
	 * # Fieldset Component
	 * 
	 * Semantic fieldset wrapper for grouping related form controls.
	 * Provides visual border and optional legend text.
	 * 
	 * ## Features
	 * - Semantic HTML fieldset element
	 * - Optional legend text
	 * - Styled border and background
	 * - Rounded corners
	 * - Proper padding for content
	 * 
	 * ## Usage Examples
	 * 
	 * Basic fieldset:
	 * ```svelte
	 * <Fieldset>
	 *   <Input id="name" name="name" />
	 *   <Input id="email" name="email" type="email" />
	 * </Fieldset>
	 * ```
	 * 
	 * With legend:
	 * ```svelte
	 * <Fieldset text="Personal Information">
	 *   <Input id="firstName" name="firstName" />
	 *   <Input id="lastName" name="lastName" />
	 * </Fieldset>
	 * ```
	 * 
	 * With ID for form association:
	 * ```svelte
	 * <Fieldset id="contact-info" text="Contact Details">
	 *   <Input id="phone" name="phone" type="tel" />
	 *   <Input id="email" name="email" type="email" />
	 * </Fieldset>
	 * ```
	 * 
	 * @typedef {Object} FieldsetProps
	 * @property {string} [id] - Fieldset identifier
	 * @property {string} [text] - Legend text (optional)
	 * @property {import('svelte').Snippet} children - Form controls content (required)
	 */

	/** @type {FieldsetProps} */
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
