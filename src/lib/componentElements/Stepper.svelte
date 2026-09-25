<script>
	import IconButton from './buttons/IconButton.svelte';
	import Input from './Input.svelte';
	import Label from './Label.svelte';
	import Badge from './Badge.svelte';

	/**
	 * # Stepper Component
	 *
	 * A labelled number input flanked by decrement and increment buttons, with an optional
	 * live summary of what the current value produces.
	 *
	 * ## Why this exists
	 * The same control was hand-written twice — in `StudyForm` (three times over, counting
	 * the per-passage steppers) and in `SplitIntoSeriesModal` — and the two copies had
	 * already diverged: the modal used the `Input` element while the form used a bare
	 * `<input type="number">` with its own border and no focus style, so one stepper had a
	 * blue focus glow and the other had nothing. Both drew their buttons as the literal
	 * characters `−` and `+` rather than icons, directly beneath a `PassageSelector` whose
	 * add button is an `IconButton`.
	 *
	 * The buttons use `minus` / `plus`, a matched pair: `plus` is a bar of thickness 8
	 * spanning the full 32 viewBox, and `minus` is exactly its horizontal arm, so the two
	 * carry identical optical weight. `minus-circle` would not have paired — its bar is
	 * thickness 4, inset to 6→26.
	 *
	 * ## Features
	 * - Bindable numeric `value`, clamped by the caller through `min` / `max`
	 * - Buttons disable at the bounds rather than silently refusing
	 * - Distinct `aria-label`s on each button, since an icon-only button has no text
	 * - Optional summary, shown as an `aria-live` pill beside the control
	 * - Label stacked above the control by default, or beside it with `isInline`
	 * - `displayValue` renders a word in place of the field for non-numeric positions
	 *
	 * ## Usage Examples
	 *
	 * Basic stepper:
	 * ```svelte
	 * <Stepper
	 *   id="chapters-per-part"
	 *   label="Chapters per part:"
	 *   bind:value={chaptersPerPart}
	 *   min={1}
	 *   max={maxChaptersPerPart}
	 *   decrementLabel="Fewer chapters per part"
	 *   incrementLabel="More chapters per part"
	 *   summary={`${parts.length} parts · avg ${averageVerses} verses each`}
	 * />
	 * ```
	 *
	 * Read-only display value, for a compact row:
	 * ```svelte
	 * <Stepper
	 *   id="parting-3"
	 *   label="Revelation 1–22"
	 *   displayValue={chapters === 0 ? 'Whole' : `${chapters} ch`}
	 *   onDecrement={stepDown}
	 *   onIncrement={stepUp}
	 *   decrementDisabled={chapters === 0}
	 *   incrementDisabled={chapters >= maxPer}
	 *   summary="4 parts"
	 *   isInline
	 * />
	 * ```
	 *
	 * @typedef {Object} StepperProps
	 * @property {string} id - Input identifier, used to associate the label (required)
	 * @property {string} [name] - Input name for form submission
	 * @property {string} [label=''] - Visible label text
	 * @property {string} [value] - Bindable value. A string, because that is what a number-typed
	 *   `Input` surfaces and what both call sites already hold; `numericValue` below is the
	 *   coerced view used for bound comparisons and arithmetic.
	 * @property {string} [displayValue] - Render this text instead of an editable field
 * @property {string} [unit=''] - Short word shown after the field, e.g. 'Chapters'. For a
 *   caller whose label is carried by a control above the stepper, this is what keeps the
 *   number's meaning on screen. A plain span, never a second `<label for>` — the field
 *   already has one accessible name and a second would compete with it.
 * @property {string} [ariaLabel] - Accessible name for the field, for callers that show no
 *   visible `label`. Forwarded to `Input`, which spreads unknown props onto the element.
	 * @property {number} [min=1] - Minimum value
	 * @property {number} [max] - Maximum value
	 * @property {number} [step=1] - Amount added or removed per press
	 * @property {string} [summary=''] - Live consequence of the current value
	 * @property {'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'aqua' | 'purple' | 'pink' | 'gray'} [summaryColor='blue'] - Colour of the summary badge
	 * @property {string} [decrementLabel='Decrease'] - Accessible name for the minus button
	 * @property {string} [incrementLabel='Increase'] - Accessible name for the plus button
	 * @property {boolean} [decrementDisabled] - Override the derived minus disabled state
	 * @property {boolean} [incrementDisabled] - Override the derived plus disabled state
	 * @property {boolean} [isDisabled=false] - Disable the whole control
	 * @property {boolean} [isInline=false] - Put the label on the same row as the control,
	 *   instead of stacking it above
	 * @property {string} [classes=''] - Additional CSS classes on the wrapper
	 * @property {(value: number) => void} [onDecrement] - Called instead of the default step down
	 * @property {(value: number) => void} [onIncrement] - Called instead of the default step up
	 */

	/** @type {StepperProps} */
	let {
		id,
		name,
		label = '',
		value = $bindable('1'),
		displayValue,
		unit = '',
		ariaLabel = undefined,
		min = 1,
		max = undefined,
		step = 1,
		summary = '',
		summaryColor = 'blue',
		decrementLabel = 'Decrease',
		incrementLabel = 'Increase',
		decrementDisabled = undefined,
		incrementDisabled = undefined,
		isDisabled = false,
		isInline = false,
		classes = '',
		onDecrement,
		onIncrement
	} = $props();

	/**
	 * The value as a number, for bound comparisons. A number-typed field can read back as an
	 * empty string mid-edit, and `'' <= 1` is true by coercion — which would disable the
	 * minus button while the user is retyping. `Number('')` is 0, which falls to the same
	 * min-bound branch deliberately rather than by accident.
	 */
	let numericValue = $derived(Number(value));

	/**
	 * Bounds are derived, but a caller driving the control through `onDecrement` /
	 * `onIncrement` owns its own bounds — hence the explicit overrides taking precedence.
	 */
	let isAtMin = $derived(decrementDisabled ?? numericValue <= min);
	let isAtMax = $derived(incrementDisabled ?? (max !== undefined && numericValue >= max));

	function stepDown() {
		if (onDecrement) {
			onDecrement(numericValue - step);
			return;
		}
		value = String(Math.max(min, numericValue - step));
	}

	function stepUp() {
		if (onIncrement) {
			onIncrement(numericValue + step);
			return;
		}
		const next = numericValue + step;
		value = String(max === undefined ? next : Math.min(max, next));
	}
</script>

<div class="stepper-row {classes} {isInline ? 'inline' : ''}">
	{#if label}
		<!--
			A real `<label for>`, rather than `aria-labelledby`. `Input` does spread unknown props
			onto its element — which is how `ariaLabel` above reaches the field — but a visible label
			associated by `for` is still the better instrument when there is one to show. Callers
			with no visible label pass `ariaLabel` instead; passing both would name the field twice.
		-->
		<Label forId={id} text={label} classes="dark stepper-label" isInline />
	{/if}

	<!--
		The control and its summary share a row BENEATH the label, rather than trailing it on one
		line. With everything on a single row the label, the two buttons, the field and the summary
		competed for the same horizontal space, and the summary was pushed far from the control it
		describes. Stacking gives the label the full width it needs and keeps the value adjacent to
		the stepper that changes it.
	-->
	<div class="stepper-controls">
		<div class="stepper">
			<IconButton
				classes="gray"
				iconId="minus"
				isSquare
				handleClick={stepDown}
				isDisabled={isDisabled || isAtMin}
				ariaLabel={decrementLabel}
			/>

			{#if displayValue !== undefined}
				<span class="stepper-value" aria-live="polite">{displayValue}</span>
			{:else}
				<div class="stepper-field">
					<Input
						{id}
						name={name ?? id}
						type="number"
						{min}
						{max}
						{step}
						bind:value
						{isDisabled}
						aria-label={ariaLabel}
					/>
				</div>
			{/if}

			<IconButton
				classes="gray"
				iconId="plus"
				isSquare
				handleClick={stepUp}
				isDisabled={isDisabled || isAtMax}
				ariaLabel={incrementLabel}
			/>

			<!-- AFTER the plus button, not between the field and it: the minus/field/plus triple is
			     one control and a word wedged inside it breaks the pairing the two buttons rely on
			     for their matched optical weight. Still inside `.stepper`, so it travels with the
			     control rather than drifting toward the summary pill at the far end of the row. -->
			{#if unit}
				<span class="stepper-unit">{unit}</span>
			{/if}
		</div>

		{#if summary}
			<!--
				A pill sitting beside the stepper, reading as a consequence of the control next to
				it.

				It was briefly a full-width bar under the control, which spanned the whole form and
				read as a banner about the section rather than a value belonging to the stepper. A
				pill scaled to its own text does not make that claim.
			-->
			<Badge
				classes="stepper-summary"
				color={summaryColor}
				look="subtle"
				ariaLive="polite"
				message={summary}
			/>
		{/if}
	</div>
</div>

<style>
	/* Label stacked above its controls. `inline` restores the original single-row layout for
	   callers whose label is short enough to sit beside the control — the per-passage rows. */
	.stepper-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
		margin-bottom: 1.2rem;

		&.inline {
			flex-direction: row;
			align-items: center;
			gap: 0.8rem;
			flex-wrap: wrap;
		}

		:global(label.stepper-label) {
			margin-bottom: 0rem;
			color: var(--black);
		}
	}

	/* The control and its summary pill, side by side. */
	.stepper-controls {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	/* Stacked layout only: the row takes the full width so the pill has somewhere to travel to.
	   Inline rows stay packed, since there the summary is a short count in a list. */
	.stepper-row:not(.inline) .stepper-controls {
		width: 100%;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	/* `Input` is width: 100%, so the width lives on a wrapper rather than the field. */
	.stepper-field {
		width: 6.4rem;
	}

	/* Matches `.stepper-value`: the two occupy the same visual role beside the control. */
	.stepper-unit {
		font-size: 1.3rem;
		color: var(--black);
	}

	.stepper-value {
		min-width: 4.6rem;
		text-align: center;
		font-size: 1.3rem;
		color: var(--black);
	}

	/* Pushed to the far end of the row, away from the stepper and out over the parts list it
	   summarises. `margin-left: auto` rather than `justify-content: space-between`, so the
	   stepper itself stays put at the left instead of both children being spread.

	   Stacked layout only: an inline row is a compact list line where the count sits directly
	   after the control. `:global` is safe here — it is anchored to this component's own scoped
	   `.stepper-row`, so it cannot escape the way a bare `:global(.stepper-summary)` would. */
	.stepper-row:not(.inline) :global(.badge.stepper-summary) {
		margin-left: auto;
	}
</style>
