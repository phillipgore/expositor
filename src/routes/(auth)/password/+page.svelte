<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/buttons/Button.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';
	import { goto } from '$app/navigation';
	import messages from '$lib/data/messages.json';

	let email = '';
	let isLoading = false;
	let error = '';
	let successMessage = '';
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
		
		// Check if email is filled
		if (!email) {
			return;
		}

		// Check for validation warnings
		if (emailWarning) {
			return;
		}

		isLoading = true;
		error = '';

		try {
			const response = await fetch('/api/auth/request-password-reset', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email })
			});

			const result = await response.json();

			if (result.success) {
				successMessage = messages.auth.resetLinkSent;
			} else {
				// Still show success message for security (don't reveal if email exists)
				successMessage = messages.auth.resetLinkSent;
			}
		} catch (err) {
			error = messages.errors.unexpectedError;
		} finally {
			isLoading = false;
		}
	}
</script>

<Heading heading="h1" classes="h4">Password Reset</Heading>

<form on:submit={handleSubmit}>
	
	<Alert color="red" look="subtle" message={error} />
	<Alert color="green" look="subtle" message={successMessage} />

	<InstructionText>
		Enter your email address and we'll send you a link to reset your password.
	</InstructionText>

	
	{#if !successMessage}
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

		<FormButtonBar>
			<Button 
				type="submit" 
				label={isLoading ? "Sending..." : "Send Link"}
				classes="blue"
				isDisabled={isLoading}
			/>
		</FormButtonBar>
	{/if}
</form>
