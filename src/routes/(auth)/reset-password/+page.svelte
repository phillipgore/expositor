<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';
	import StatusMessage from '$lib/elements/StatusMessage.svelte';

	let token = '';
	let email = '';
	let newPassword = '';
	let confirmPassword = '';
	let isLoading = false;
	let error = '';
	let successMessage = '';
	let isValidatingToken = true;
	let tokenValid = false;
	let formSubmitted = false;

	onMount(async () => {
		token = $page.url.searchParams.get('token') || '';

		if (!token) {
			error = 'No reset token provided';
			isValidatingToken = false;
			return;
		}

		// Validate the token
		try {
			const response = await fetch('/api/auth/validate-reset-token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token })
			});

			const result = await response.json();

			if (result.success) {
				tokenValid = true;
				email = result.email || '';
			} else {
				error = result.error || 'Invalid or expired reset token';
			}
		} catch (err) {
			error = 'An unexpected error occurred';
		} finally {
			isValidatingToken = false;
		}
	});

	async function handleSubmit(event) {
		event.preventDefault();
		formSubmitted = true;
		
		// Check if all fields are filled
		if (!newPassword || !confirmPassword) {
			return;
		}

		if (newPassword.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		if (newPassword !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		isLoading = true;
		error = '';

		try {
			const response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ 
					token,
					newPassword 
				})
			});

			const result = await response.json();

			if (result.success) {
				successMessage = 'Your password has been reset successfully! Redirecting to sign in...';
				setTimeout(() => {
					goto('/signin');
				}, 2000);
			} else {
				error = result.error || 'Failed to reset password.';
			}
		} catch (err) {
			error = 'An unexpected error occurred.';
		} finally {
			isLoading = false;
		}
	}
</script>

{#if !isValidatingToken}
	<Heading heading="h1" classes="h4" hasSub>Reset Password</Heading>
	<Heading heading="h2" classes="h5" isMuted>{email}</Heading>
{/if}

<form on:submit={handleSubmit}>

	{#if isValidatingToken}
		<StatusMessage>
			<p>Validating reset token...</p>
		</StatusMessage>
	{:else if !tokenValid}
		<Alert color="red" look="subtle" message={error} />
		<InstructionText>
			Your reset link may have expired. Please request a new password reset.
		</InstructionText>
		<FormButtonBar>
			<Button 
				label="Password Reset"
				classes="system-gray"
				handleClick={() => goto('/password')}
			/>
		</FormButtonBar>
	{:else if successMessage}
		<Alert color="green" look="subtle" message={successMessage} />
	{:else}
		<Alert color="red" look="subtle" message={error} />

		<InputField
			label="New Password"
			id="newPassword"
			name="newPassword"
			type="password"
			bind:value={newPassword}
			isDisabled={isLoading}
			required={true}
			requiredMode="onError"
			hasError={formSubmitted && !newPassword}
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
		/>

		<FormButtonBar>
			<Button 
				type="submit" 
				label={isLoading ? "Resetting..." : "Reset Password"}
				classes="system-blue"
				isDisabled={isLoading}
			/>
		</FormButtonBar>
	{/if}
</form>

<style>	
	
</style>
