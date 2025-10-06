<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';
	import StatusMessage from '$lib/elements/StatusMessage.svelte';

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

{#if !isVerifying}
	<Heading heading="h1" classes="h4">Email Verification</Heading>
{/if}

{#if isVerifying}
	<StatusMessage>
		<p>Verifying your email address...</p>
	</StatusMessage>
{:else if success}
	<Alert type="success" message={email? `Your email ${email} has been verified successfully! You can now sign in.` : `Your email has been verified successfully! You can now sign in.`} />
	<FormButtonBar>
		<Button 
			label="Go to App"
			classes="system-blue"
			handleClick={handleContinue}
		/>
	</FormButtonBar>
{:else}
	<Alert type="error" message={error} />
	
	{#if resendSuccess}
		<Alert type="success" message={resendSuccess} />
	{:else}
		<InstructionText>
			Your verification link has expired. Enter your email below to receive a new one.
		</InstructionText>
		
			<form on:submit={handleResendVerification}>
				<Alert type="error" message={resendError} />
				
				<FormField
					label="Email"
					id="resendEmail"
					name="resendEmail"
					type="email"
					bind:value={resendEmail}
					isDisabled={isResending}
				/>

			<FormButtonBar>
				<Button 
					type="submit"
					label={isResending ? "Sending..." : "Resend"}
					classes="system-blue"
					isDisabled={isResending}
				/>
			</FormButtonBar>
		</form>
	{/if}
{/if}
