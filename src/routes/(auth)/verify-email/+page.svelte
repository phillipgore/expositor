<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import InstructionText from '$lib/componentElements/InstructionText.svelte';
	import StatusMessage from '$lib/componentElements/StatusMessage.svelte';
	import messages from '$lib/data/messages.json';

	let isVerifying = true;
	let success = false;
	let error = '';
	let email = '';
	let resendEmail = '';
	let isResending = false;
	let resendSuccess = '';
	let resendError = '';
	let formSubmitted = false;

	onMount(async () => {
		const token = $page.url.searchParams.get('token');

		if (!token) {
			error = messages.errors.tokenRequired;
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
				error = result.error || messages.errors.failedToVerifyEmail;
			}
		} catch (err) {
			error = messages.errors.unexpectedError;
		} finally {
			isVerifying = false;
		}
	});

	function handleContinue() {
		goto('/open');
	}

	async function handleResendVerification(event) {
		event.preventDefault();
		formSubmitted = true;

		// Check if email is filled
		if (!resendEmail) {
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
				resendSuccess = messages.auth.verificationResent;
				resendEmail = ''; // Clear the input
			} else {
				resendError = result.error || messages.errors.failedToSendVerification;
			}
		} catch (err) {
			resendError = messages.errors.unexpectedError;
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
	<Alert color="green" look="subtle" message={messages.auth.emailVerifiedCanSignIn} />
	<FormButtonBar>
		<Button 
			label="Go to App"
			classes="blue"
			handleClick={handleContinue}
		/>
	</FormButtonBar>
{:else}
	<Alert color="red" look="subtle" message={error} />

	{#if resendSuccess}
		<Alert color="green" look="subtle" message={resendSuccess} />
	{:else}
		<InstructionText>
			{messages.auth.verificationExpired}
		</InstructionText>
		
			<form on:submit={handleResendVerification}>
				<Alert color="red" look="subtle" message={resendError} />
				
				<InputField
					label="Email"
					id="resendEmail"
					name="resendEmail"
					type="email"
					bind:value={resendEmail}
					isDisabled={isResending}
					required={true}
					requiredMode="onError"
					hasError={formSubmitted && !resendEmail}
				/>

			<FormButtonBar>
				<Button 
					type="submit"
					label={isResending ? "Sending..." : "Resend"}
					classes="blue"
					isDisabled={isResending}
				/>
			</FormButtonBar>
		</form>
	{/if}
{/if}
