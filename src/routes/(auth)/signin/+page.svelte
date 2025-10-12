<script>
	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import { signIn } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import messages from '$lib/data/messages.json';

	let email = '';
	let password = '';
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

	async function handleSubmit(event) {
		event.preventDefault();
		formSubmitted = true;
		
		// Check if all fields are filled
		if (!email || !password) {
			return;
		}

		// Check for validation warnings
		if (emailWarning) {
			return;
		}

		isLoading = true;
		error = '';

		const result = await signIn(email, password);
		
		if (result.success) {
			goto('/new');
		} else {
			error = result.error;
		}
		
		isLoading = false;
	}
</script>

<Heading heading="h1" classes="h4">Sign In</Heading>

<form on:submit={handleSubmit}>
	
	<Alert color="red" look="subtle" message={error} />
	
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
	/>

	<FormButtonBar>
		<Button
			type="submit"
			label={isLoading ? "Signing In..." : "Sign In"}
			classes="blue"
			isDisabled={isLoading}
		/>
	</FormButtonBar>
</form>
