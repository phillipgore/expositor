<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import Label from '$lib/elements/Label.svelte';
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

	<p class="instructions">Enter your email address and we'll send you a link to reset your password.</p>

	
	{#if !successMessage}
		<div class="input-container">
			<Label forId="email" text="Email" />
			<TextInput bind:value={email} isFullWidth type="email" isDisabled={isLoading} id="email" name="email" isLarge={false}></TextInput>
		</div>

		<div class="button-bar">
			<Button 
				type="submit" 
				label={isLoading ? "Sending..." : "Send Link"}
				classes="system-blue"
				isDisabled={isLoading}
			/>
		</div>
	{/if}
</form>

<style>
	.instructions {
		color: var(--gray-500);
		line-height: 1.5;
		margin: 0.0rem 0.0rem 1.8rem;
	}

	.input-container {
		margin-bottom: 1.8rem;

		&.columns {
			display: flex;
			gap: 2.1rem;
			margin-top: 2.7rem;
			margin-bottom: 1.8rem;
		}
	}

	.button-bar {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}
</style>
