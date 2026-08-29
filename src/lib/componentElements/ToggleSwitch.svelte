<script>
	/**
	 * # ToggleSwitch Component
	 *
	 * Accessible on/off slide switch with a text label. Unlike ToggleButton
	 * (a toolbar icon button), this renders a classic settings-style switch.
	 *
	 * ## Features
	 * - `role="switch"` with `aria-checked` for accessibility
	 * - Keyboard operable (native button semantics)
	 * - Controlled via `checked` prop; notifies parent through `onToggle`
	 * - Optional disabled state
	 *
	 * ## Usage
	 * ```svelte
	 * <ToggleSwitch
	 *   id="signups"
	 *   label="New User Sign Ups"
	 *   checked={signupsEnabled}
	 *   onToggle={(value) => saveSetting(value)}
	 * />
	 * ```
	 *
	 * @component
	 */

	/**
	 * @typedef {Object} ToggleSwitchProps
	 * @property {string} [id] - Unique id for the switch (ties the label to the control)
	 * @property {string} [label] - Visible text label displayed next to the switch
	 * @property {boolean} [checked] - Bindable on/off state
	 * @property {boolean} [isDisabled] - Disable interaction
	 * @property {string} [title] - Tooltip, e.g. the reason the switch is disabled
	 * @property {(checked: boolean) => void} [onToggle] - Called with the NEW state
	 */

	/** @type {ToggleSwitchProps} */
	let {
		id = '',
		label = '',
		checked = $bindable(false),
		isDisabled = false,
		title = undefined,
		onToggle
	} = $props();

	function handleClick() {
		if (isDisabled) return;
		checked = !checked;
		onToggle?.(checked);
	}
</script>

<div class="toggle-switch-field" {title}>
	<button
		{id}
		type="button"
		role="switch"
		class="toggle-switch"
		class:checked
		aria-checked={checked}
		aria-label={label}
		disabled={isDisabled}
		onclick={handleClick}
	>
		<span class="track">
			<span class="thumb"></span>
		</span>
	</button>
	{#if label}
		<label for={id} class:disabled={isDisabled}>{label}</label>
	{/if}
</div>

<style>
	.toggle-switch-field {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	label {
		cursor: pointer;
		user-select: none;
		margin-bottom: 0rem;

		/* Greyed with the switch, matching how RadioButtons and Checkbox treat a disabled
		   label. A switch that is disabled-not-hidden has to look disabled. */
		&.disabled {
			color: var(--gray-500);
			cursor: not-allowed;
		}
	}

	.toggle-switch {
		display: inline-flex;
		align-items: center;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;

		&:disabled {
			cursor: not-allowed;
			opacity: 0.5;
		}

		&:focus-visible .track {
			outline: 2px solid var(--blue);
			outline-offset: 2px;
		}

		.track {
			display: inline-flex;
			align-items: center;
			width: 3.9rem;
			height: 2.2rem;
			padding: 0 0.2rem;
			border-radius: 1.1rem;
			background-color: var(--gray-light);
			transition: background-color 0.15s ease-in-out;
		}

		.thumb {
			width: 1.8rem;
			height: 1.8rem;
			border-radius: 50%;
			background-color: var(--white, #fff);
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
			transition: transform 0.15s ease-in-out;
		}

		&.checked {
			.track {
				background-color: var(--blue);
			}

			.thumb {
				transform: translateX(1.7rem);
			}
		}
	}
</style>
