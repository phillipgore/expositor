<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TextInput from '$lib/elements/TextInput.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import Label from '$lib/elements/Label.svelte';

	let token = '';
	let email = '';
	let newPassword = '';
	let confirmPassword = '';
	let isLoading = false;
	let error = '';
	let successMessage = '';
	let isValidatingToken = true;
	let tokenValid = false;

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
		
		if (!newPassword || !confirmPassword) {
			error = 'Please fill in all fields';
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
				error = result.error || 'Failed to reset password';
			}
		} catch (err) {
			error = 'An unexpected error occurred';
		} finally {
			isLoading = false;
		}
	}
</script>

<Heading heading="h1" classes="h4">Reset Password</Heading>

<form on:submit={handleSubmit}>

	{#if isValidatingToken}
		<div class="status-message">
			<p>Validating reset token...</p>
		</div>
	{:else if !tokenValid}
		<Alert type="error" message={error} />
		<p class="instructions">Your reset link may have expired. Please request a new password reset.</p>
		<div class="button-bar">
			<Button 
				label="Back to Password Reset"
				classes="system-gray"
				handleClick={() => goto('/password')}
			/>
		</div>
	{:else if successMessage}
		<Alert type="success" message={successMessage} />
	{:else}
		<Alert type="error" message={error} />
		
		<div class="email-info">
			<p><strong>Email:</strong> {email}</p>
		</div>

		<div class="password-container">
			<Label forId="newPassword" text="New Password" />
			<TextInput 
				bind:value={newPassword} 
				isFullWidth 
				type="password" 
				isDisabled={isLoading} 
				id="newPassword" 
				name="newPassword" 
				isLarge={false}
			/>
		</div>

		<div class="password-container">
			<Label forId="confirmPassword" text="Confirm Password" />
			<TextInput 
				bind:value={confirmPassword} 
				isFullWidth 
				type="password" 
				isDisabled={isLoading} 
				id="confirmPassword" 
				name="confirmPassword" 
				isLarge={false}
			/>
		</div>

		<div class="button-bar">
			<Button 
				type="submit" 
				label={isLoading ? "Resetting..." : "Reset Password"}
				classes="system-blue"
				isDisabled={isLoading}
			/>
		</div>
	{/if}
</form>

<style>	
	.status-message {
		margin-top: 2.7rem;
		text-align: center;
		color: var(--gray-400);
	}

	.email-info {
		margin-top: 2.7rem;
		margin-bottom: 1.8rem;
		padding: 1.2rem;
		background-color: var(--gray-50);
		border-radius: 0.3rem;
	}

	.email-info p {
		margin: 0;
		font-size: 1.4rem;
		color: var(--gray-600);
	}

	.password-container {
		margin-bottom: 1.8rem;
	}

	.instructions {
		color: var(--gray-500);
		line-height: 1.5;
		margin: 0.0rem 0.0rem 1.8rem;
	}

	.button-bar {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 2.7rem;
	}
</style>
