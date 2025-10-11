<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/buttons/Button.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import { signUp } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import messages from '$lib/data/messages.json';

	let firstName = '';
	let lastName = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let isLoading = false;
	let error = '';
	let formSubmitted = false;

	// Email validation function
	function isValidEmail(emailStr) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(emailStr);
	}

	// Reactive validation messages
	$: emailWarning = email && !isValidEmail(email) ? messages.validation.emailInvalid : '';
	$: passwordWarning = password && password.length < 6 ? messages.validation.passwordTooShort : '';
	$: confirmPasswordWarning = confirmPassword && password !== confirmPassword ? messages.validation.passwordMismatch : '';

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

		isLoading = true;
		error = '';

		// Pass first and last name separately
		const result = await signUp(firstName.trim(), lastName.trim(), email, password);
		
		if (result.success) {
			if (result.requiresVerification) {
				// Redirect to verify-pending page with email parameter
				goto(`/verify-pending?email=${encodeURIComponent(result.email)}`);
			} else {
				// Fallback in case verification is not required
				goto('/new');
			}
		} else {
			error = result.error;
		}
		
		isLoading = false;
	}
</script>

<Heading heading="h1" classes="h4">Sign Up</Heading>

<form on:submit={handleSubmit}>
	<Alert color="red" look="subtle" message={error} />
	
	<div class="name-fields">
		<InputField
			label="First Name"
			id="firstName"
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
			id="lastName"
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
		id="email"
		name="email"
		type="email"
		bind:value={email}
		isDisabled={isLoading}
		required={true}
		requiredMode="onError"
		hasError={formSubmitted && !email}
		warningMessage={emailWarning}
	/>
	<InputField
		label="Password"
		id="password"
		name="password"
		type="password"
		bind:value={password}
		isDisabled={isLoading}
		required={true}
		requiredMode="onError"
		hasError={formSubmitted && !password}
		warningMessage={passwordWarning}
	/>
	<InputField
		label="Confirm Password"
		id="confirmPassword"
		name="confirmPassword"
		type="password"
		bind:value={confirmPassword}
		isDisabled={isLoading}
		required={true}
		requiredMode="onError"
		hasError={formSubmitted && !confirmPassword}
		warningMessage={confirmPasswordWarning}
	/>

	<FormButtonBar>
		<Button 
			type="submit" 
			label={isLoading ? "Signing Up..." : "Sign Up"}
			classes="blue"
			isDisabled={isLoading}
		/>
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
