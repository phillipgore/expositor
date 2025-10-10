<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';
	import { goto } from '$app/navigation';

	let email = '';
	let isLoading = false;
	let error = '';
	let successMessage = '';
	let formSubmitted = false;

	async function handleSubmit(event) {
		event.preventDefault();
		formSubmitted = true;
		
		// Check if email is filled
		if (!email) {
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
				successMessage = "If an account with that email exists, we've sent you a password reset link.";
			} else {
				// Still show success message for security (don't reveal if email exists)
				successMessage = "If an account with that email exists, we've sent you a password reset link.";
			}
		} catch (err) {
			error = 'An unexpected error occurred';
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
		/>

		<FormButtonBar>
			<Button 
				type="submit" 
				label={isLoading ? "Sending..." : "Send Link"}
				classes="system-blue"
				isDisabled={isLoading}
			/>
		</FormButtonBar>
	{/if}
</form>
