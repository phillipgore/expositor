<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/buttons/Button.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';
	import StatusMessage from '$lib/elements/StatusMessage.svelte';
	import messages from '$lib/data/messages.json';

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

	// Reactive validation messages
	$: passwordWarning = newPassword && newPassword.length < 6 ? messages.validation.passwordTooShort : '';
	$: confirmPasswordWarning = confirmPassword && newPassword !== confirmPassword ? messages.validation.passwordMismatch : '';

	onMount(async () => {
		token = $page.url.searchParams.get('token') || '';

		if (!token) {
			error = messages.errors.noResetToken;
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
				error = result.error || messages.errors.tokenInvalid;
			}
		} catch (err) {
			error = messages.errors.unexpectedError;
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

		// Check for validation warnings
		if (passwordWarning || confirmPasswordWarning) {
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
				successMessage = messages.auth.passwordResetSuccess;
				setTimeout(() => {
					goto('/signin');
				}, 2000);
			} else {
				error = result.error || messages.errors.failedToResetPassword;
			}
		} catch (err) {
			error = messages.errors.unexpectedError;
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
			{messages.errors.resetLinkExpired}
		</InstructionText>
		<FormButtonBar>
			<Button 
				label="Password Reset"
				classes="gray"
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
			warningMessage={passwordWarning}
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
			warningMessage={confirmPasswordWarning}
		/>

		<FormButtonBar>
			<Button 
				type="submit" 
				label={isLoading ? "Resetting..." : "Reset Password"}
				classes="blue"
				isDisabled={isLoading}
			/>
		</FormButtonBar>
	{/if}
</form>

<style>	
	
</style>
