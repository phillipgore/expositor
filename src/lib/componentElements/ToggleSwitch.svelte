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

	/** Unique id for the switch (ties the label to the control). */
	export let id = '';

	/** Visible text label displayed next to the switch. */
	export let label = '';

	/** Current on/off state (controlled by the parent). */
	export let checked = false;

	/** Disable interaction (e.g. while saving). */
	export let isDisabled = false;

	/** Callback invoked with the NEW state when the user toggles. */
	export let onToggle = /** @type {(checked: boolean) => void} */ (() => {});

	function handleClick() {
		if (isDisabled) return;
		onToggle(!checked);
	}
</script>

<div class="toggle-switch-field">
	<button
		{id}
		type="button"
		role="switch"
		class="toggle-switch"
		class:checked
		aria-checked={checked}
		aria-label={label}
		disabled={isDisabled}
		on:click={handleClick}
	>
		<span class="track">
			<span class="thumb"></span>
		</span>
	</button>
	{#if label}
		<label for={id}>{label}</label>
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
