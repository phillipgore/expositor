<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import TextInput from '$lib/elements/TextInput.svelte';
	import Label from '$lib/elements/Label.svelte';

	let isVerifying = true;
	let success = false;
	let error = '';
	let email = '';
	let resendEmail = '';
	let isResending = false;
	let resendSuccess = '';
	let resendError = '';

	onMount(async () => {
		const token = $page.url.searchParams.get('token');

		if (!token) {
			error = 'No verification token provided';
			isVerifying = false;
			return;
		}

		try {
			const response = await fetch('/api/auth/verify-email', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token })
			});

			const result = await response.json();

			if (result.success) {
				success = true;
				email = result.email || '';
			} else {
				error = result.error || 'Verification failed';
			}
		} catch (err) {
			error = 'An unexpected error occurred';
		} finally {
			isVerifying = false;
		}
	});

	function handleContinue() {
		goto('/open');
	}

	async function handleResendVerification(event) {
		event.preventDefault();

		if (!resendEmail) {
			resendError = 'Please enter your email address';
			return;
		}

		isResending = true;
		resendError = '';
		resendSuccess = '';

		try {
			const response = await fetch('/api/auth/send-verification', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email: resendEmail })
			});

			const result = await response.json();

			if (result.success) {
				resendSuccess = `A new verification link has been sent to ${resendEmail}. Please check your inbox.`;
				resendEmail = ''; // Clear the input
			} else {
				resendError = result.error || 'Failed to send verification email';
			}
		} catch (err) {
			resendError = 'An unexpected error occurred';
		} finally {
			isResending = false;
		}
	}
</script>

<Heading heading="h1" classes="h4">Email Verification</Heading>

{#if isVerifying}
	<div class="status-message">
		<p>Verifying your email address...</p>
	</div>
{:else if success}
	<Alert type="success" message={email? `Your email ${email} has been verified successfully! You can now sign in.` : `Your email has been verified successfully! You can now sign in.`} />
	<div class="button-bar">
		<Button 
			label="Continue to App"
			classes="system-blue"
			handleClick={handleContinue}
		/>
	</div>
{:else}
	<Alert type="error" message={error} />
	
	{#if resendSuccess}
		<Alert type="success" message={resendSuccess} />
	{:else}
		<p class="instructions">Your verification link has expired. Enter your email below to receive a new one.</p>
		
		<form on:submit={handleResendVerification}>
			<Alert type="error" message={resendError} />
			
			<div class="input-container">
				<Label forId="resendEmail" text="Email" />
				<TextInput 
					bind:value={resendEmail} 
					isFullWidth 
					type="email" 
					isDisabled={isResending} 
					id="resendEmail" 
					name="resendEmail" 
					isLarge={false}
				/>
			</div>

			<div class="button-bar">
				<Button 
					type="submit"
					label={isResending ? "Sending..." : "Resend"}
					classes="system-blue"
					isDisabled={isResending}
				/>
			</div>
		</form>
	{/if}
{/if}

<style>
	.status-message {
		margin-top: 2.7rem;
		text-align: center;
		color: var(--gray-400);
	}
	
	.instructions {
		color: var(--gray-500);
		line-height: 1.5;
		margin: 0.0rem 0.0rem 1.8rem;
	}

	.input-container {
		margin-bottom: 1.8rem;
	}

	.button-bar {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 2.7rem;
	}
</style>
