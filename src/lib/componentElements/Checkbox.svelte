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
	 *
	 * Any further attributes are spread onto the wrapper, so a caller can position it from
	 * outside — `data-align="start"` is what `FormButtonBar` looks for.
	 */

	/** @type {CheckboxProps & Record<string, any>} */
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
		children,
		...restProps
	} = $props();
</script>

<!--
	Structure mirrors RadioButtons: an outer container carrying the spacing, an inner
	`.button-container` carrying the box-and-label pair. Same nesting, same class names, same
	disabled handling — so a checkbox and a radio group sitting together read as one family.
-->
<div class="checkbox-container {classes}" style="margin-bottom: {spacingBottom};" {...restProps}>
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
	/* Matches RadioButtons in everything that should match: no font overrides, so the label
	   inherits Label's own 1.4rem/500 exactly as a radio's does. An earlier pass set
	   `font-size: inherit` and `font-weight: 400` here, which rendered the checkbox label
	   visibly smaller and lighter than the radio labels directly above it.

	   No `display: flex` on the container: RadioButtons needs it to stack N radios with a gap,
	   but a single checkbox has one child, so a flex context here did nothing except stretch
	   the wrapper to full width. */
	.checkbox-container {
		.button-container {
			display: flex;
			align-items: center;
			/* 0.5rem, NOT the 0.3rem RadioButtons uses. This is the one place copying the radios
			   exactly is wrong: a radio is a circle with optical padding inside its bounding box,
			   while a checkbox is a square filling its box edge to edge. The same declared gap
			   therefore reads as visibly tighter on a checkbox. */
			gap: 0.5rem;

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
		margin: 0rem;
		flex-shrink: 0;

		/* Same focus treatment as RadioButtons, so keyboard focus looks identical across the
		   two controls. */
		&:focus,
		&:focus-visible {
			box-shadow: 0rem 0rem 0rem 0rem;
		}
	}

	/* NO explicit width/height. `html` is `font-size: 62.5%`, so the `1.3rem` a previous pass
	   set here was 13px against a native control's 14px — it shrank the box below the radios
	   it was meant to match, while the comment claimed the opposite. Both controls now render
	   at their native size, which is what actually matches. */

	/* Matches the box to the cap height of the first line under `align-top`. */
	.align-top input {
		margin-top: 0.2rem;
	}
</style>
