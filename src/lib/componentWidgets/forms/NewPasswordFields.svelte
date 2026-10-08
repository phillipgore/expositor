<script>
	/**
	 * # New Password Fields
	 *
	 * "New Password" + "Confirm Password" inputs with the app's standard
	 * validation (minimum length, must match). Not a <form> itself, so it can be
	 * dropped into a page form or a modal.
	 *
	 * Used by the public /reset-password page and the Back Office reset modal.
	 *
	 * ## Props
	 * @property {string} newPassword - Bindable new password value
	 * @property {boolean} isValid - Bindable (read-only): both fields filled and valid
	 * @property {boolean} isLoading - Disables the inputs
	 * @property {boolean} formSubmitted - Show "required" errors on empty fields
	 * @property {string} idPrefix - Prefix for input ids (keeps ids unique per page)
	 */

	import InputField from '$lib/componentWidgets/InputField.svelte';
	import messages from '$lib/data/messages.json';

	export let newPassword = '';
	export let isValid = false;
	export let isLoading = false;
	export let formSubmitted = false;
	export let idPrefix = '';

	let confirmPassword = '';

	/** Clear both fields. */
	export function reset() {
		newPassword = '';
		confirmPassword = '';
	}

	// Reactive validation messages
	$: passwordWarning =
		newPassword && newPassword.length < 6 ? messages.validation.passwordTooShort : '';
	$: confirmPasswordWarning =
		confirmPassword && newPassword !== confirmPassword ? messages.validation.passwordMismatch : '';
	$: isValid = !!newPassword && !!confirmPassword && !passwordWarning && !confirmPasswordWarning;
</script>

<InputField
	label="New Password"
	id="{idPrefix}newPassword"
	name="newPassword"
	type="password"
	bind:value={newPassword}
	isDisabled={isLoading}
	required={true}
	requiredMode="onError"
	hasError={formSubmitted && !newPassword}
	warningMessage={passwordWarning}
/>

<InputField
	label="Confirm Password"
	id="{idPrefix}confirmPassword"
	name="confirmPassword"
	type="password"
	bind:value={confirmPassword}
	isDisabled={isLoading}
	required={true}
	requiredMode="onError"
	hasError={formSubmitted && !confirmPassword}
	warningMessage={confirmPasswordWarning}
/>
