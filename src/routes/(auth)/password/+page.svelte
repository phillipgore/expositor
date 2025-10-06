<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';
	import { goto } from '$app/navigation';

	let email = '';
	let isLoading = false;
	let error = '';
	let successMessage = '';

	async function handleSubmit(event) {
		event.preventDefault();
		
		if (!email) {
			error = 'Please enter your email address';
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
	
	<Alert type="error" message={error} />
	<Alert type="success" message={successMessage} />

	<InstructionText>
		Enter your email address and we'll send you a link to reset your password.
	</InstructionText>

	
	{#if !successMessage}
		<FormField
			label="Email"
			id="email"
			name="email"
			type="email"
			bind:value={email}
			isDisabled={isLoading}
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
