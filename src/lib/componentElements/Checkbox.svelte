<script>
	import Label from './Label.svelte';

	/**
	 * # Checkbox Component
	 *
	 * Single checkbox with an associated label. The library previously had no checkbox
	 * element at all, so every call site hand-rolled `<label><input type="checkbox"/>text</label>`
	 * with its own CSS — five copies that had already drifted on `align-items` and
	 * `font-size`, and two of which rendered the *same sentence* under different class
	 * names. This is that markup, once.
	 *
	 * ## Deliberately a native `<input type="checkbox">`
	 * `icons.json` carries `checkbox-checked` / `checkbox-unchecked`, but those exist for
	 * `MenuToggleItem`, which draws fake checkboxes inside menus. A real form control keeps
	 * the real element: it is focusable, it is announced as a checkbox, it participates in
	 * form submission, and it responds to space — none of which an `<svg>` does.
	 *
	 * `accent-color: var(--blue)` matches `RadioButtons`. Without it this rendered in the
	 * OS default colour directly below blue radios on the New Study page.
	 *
	 * ## Features
	 * - Bindable `checked`
	 * - Label as plain text or as a snippet, for interpolated copy
	 * - `alignTop` for labels that wrap to several lines
	 * - Disabled state, greying the label to match `RadioButtons`
	 *
	 * ## Usage Examples
	 *
	 * Plain text label:
	 * ```svelte
	 * <Checkbox id="balance" label="Balance by length" bind:checked={balanceByLength} />
	 * ```
	 *
	 * Interpolated label, via the children snippet:
	 * ```svelte
	 * <Checkbox id="confirm-large" bind:checked={hasConfirmed}>
	 *   Yes, create {parts.length} parts.
	 * </Checkbox>
	 * ```
	 *
	 * Multi-line label:
	 * ```svelte
	 * <Checkbox id="ack" label="Long explanatory sentence…" bind:checked={ack} alignTop />
	 * ```
	 *
	 * @typedef {Object} CheckboxProps
	 * @property {string} id - Input identifier, used to associate the label (required)
	 * @property {string} [name] - Input name for form submission
	 * @property {string} [value] - Value submitted when checked
	 * @property {string} [label=''] - Label text; ignored when `children` is supplied
	 * @property {boolean} [checked=false] - Bindable checked state
	 * @property {boolean} [isDisabled=false] - Disable the checkbox
	 * @property {boolean} [alignTop=false] - Align the box to the first line of a wrapping label
	 * @property {string} [spacingBottom='1.8rem'] - Gap below the checkbox. Matches RadioButtons
	 *   by default. Passed in rather than reached in with `:global`, which is not scoped to the
	 *   calling component and so had three call sites overwriting one another.
	 * @property {string} [classes=''] - Additional CSS classes on the wrapper
	 * @property {string} [ariaDescribedby] - ID of an element describing the checkbox
	 * @property {(event: Event) => void} [handleChange] - Change event handler
	 * @property {import('svelte').Snippet} [children] - Snippet for label content
	 */

	/** @type {CheckboxProps} */
	let {
		id,
		name,
		value,
		label = '',
		checked = $bindable(false),
		isDisabled = false,
		alignTop = false,
		spacingBottom = '1.8rem',
		classes = '',
		ariaDescribedby,
		handleChange,
		children
	} = $props();
</script>

<!--
	Structure mirrors RadioButtons: an outer container carrying the spacing, an inner
	`.button-container` carrying the box-and-label pair. Same nesting, same class names, same
	disabled handling — so a checkbox and a radio group sitting together read as one family.
-->
<div class="checkbox-container {classes}" style="margin-bottom: {spacingBottom};">
	<div class="button-container {alignTop ? 'align-top' : ''} {isDisabled ? 'disabled' : ''}">
		<input
			type="checkbox"
			{id}
			{name}
			{value}
			bind:checked
			disabled={isDisabled}
			aria-describedby={ariaDescribedby}
			onchange={handleChange}
		/>
		<Label forId={id} classes="dark" isInline>
			{#if children}
				{@render children()}
			{:else}
				{label}
			{/if}
		</Label>
	</div>
</div>

<style>
	/* Deliberately identical to RadioButtons: same 0.3rem gap, and no font overrides, so the
	   label inherits Label's own 1.4rem/500 exactly as a radio's does. An earlier pass set
	   `font-size: inherit` and `font-weight: 400` here, which rendered the checkbox label
	   visibly smaller and lighter than the radio labels directly above it. */
	.checkbox-container {
		display: flex;
		flex-direction: column;

		.button-container {
			display: flex;
			align-items: center;
			gap: 0.3rem;

			/* Labels that wrap need the box on the first line, not floating mid-paragraph. */
			&.align-top {
				align-items: flex-start;
			}

			:global(label) {
				margin-bottom: 0rem;
			}

			&.disabled :global(label) {
				color: var(--gray-500);
			}
		}
	}

	input {
		accent-color: var(--blue);
		/* A native checkbox draws marginally smaller than a radio at the same font size, so the
		   box is pinned to match the radios it sits with. */
		width: 1.3rem;
		height: 1.3rem;
		margin: 0rem;
		flex-shrink: 0;
	}

	/* Matches the box to the cap height of the first line under `align-top`. */
	.align-top input {
		margin-top: 0.2rem;
	}
</style>
