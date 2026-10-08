<script>
	/**
	 * # Signup Form
	 *
	 * Reusable sign-up form (first/last name, email, password, confirm).
	 * Handles field state and client-side validation only; the parent decides
	 * what to do with the values via `onSubmit`.
	 *
	 * Used by the public /signup page and the Back Office Users page.
	 */

	import Alert from '$lib/componentElements/Alert.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import messages from '$lib/data/messages.json';

	/** Disables the fields and shows a spinner in the submit button. */
	export let isLoading = false;
	/** Error message to display above the form. */
	export let error = '';
	/** Submit button label. */
	export let submitLabel = 'Sign Up';
	/** Label shown next to the spinner while loading. */
	export let loadingLabel = 'Signing Up…';
	/** Prefix for input ids, so multiple forms can coexist on a page. */
	export let idPrefix = '';
	/**
	 * Called with the validated values when the form is submitted.
	 * @type {(values: { firstName: string, lastName: string, email: string, password: string }) => void | Promise<void>}
	 */
	export let onSubmit = () => {};

	let firstName = '';
	let lastName = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let formSubmitted = false;

	/** Clear all fields and validation state. */
	export function reset() {
		firstName = '';
		lastName = '';
		email = '';
		password = '';
		confirmPassword = '';
		formSubmitted = false;
	}

	// Email validation function
	function isValidEmail(emailStr) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(emailStr);
	}

	// Reactive validation messages
	$: emailWarning = email && !isValidEmail(email) ? messages.validation.emailInvalid : '';
	$: passwordWarning = password && password.length < 6 ? messages.validation.passwordTooShort : '';
	$: confirmPasswordWarning =
		confirmPassword && password !== confirmPassword ? messages.validation.passwordMismatch : '';

	async function handleSubmit(event) {
		event.preventDefault();
		formSubmitted = true;

		// Check if all fields are filled
		if (!firstName || !lastName || !email || !password || !confirmPassword) {
			return;
		}

		// Check for validation warnings
		if (emailWarning || passwordWarning || confirmPasswordWarning) {
			return;
		}

		await onSubmit({
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			email: email.trim(),
			password
		});
	}
</script>

<form on:submit={handleSubmit}>
	<Alert color="red" look="subtle" message={error} />

	<div class="name-fields">
		<InputField
			label="First Name"
			id="{idPrefix}firstName"
			name="firstName"
			type="text"
			bind:value={firstName}
			isDisabled={isLoading}
			required={true}
			requiredMode="onError"
			hasError={formSubmitted && !firstName}
		/>
		<InputField
			label="Last Name"
			id="{idPrefix}lastName"
			name="lastName"
			type="text"
			bind:value={lastName}
			isDisabled={isLoading}
			required={true}
			requiredMode="onError"
			hasError={formSubmitted && !lastName}
		/>
	</div>
	<InputField
		label="Email"
		id="{idPrefix}email"
		name="email"
		type="email"
		bind:value={email}
		isDisabled={isLoading}
		required={true}
		requiredMode="onError"
		hasError={formSubmitted && !email}
		infoMessage={emailWarning}
	/>
	<InputField
		label="Password"
		id="{idPrefix}password"
		name="password"
		type="password"
		bind:value={password}
		isDisabled={isLoading}
		required={true}
		requiredMode="onError"
		hasError={formSubmitted && !password}
		infoMessage={passwordWarning}
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
		infoMessage={confirmPasswordWarning}
	/>

	<FormButtonBar>
		<Button type="submit" classes="blue" isDisabled={isLoading}>
			{#if isLoading}
				<Spinner size="sm" inline color="var(--white)" label={loadingLabel} showLabel />
			{:else}
				{submitLabel}
			{/if}
		</Button>
	</FormButtonBar>
</form>

<style>
	.name-fields {
		display: flex;
		gap: 2.1rem;
		margin-bottom: 1.8rem;

		:global(.input-field) {
			margin-bottom: 0;
		}
	}
</style>
