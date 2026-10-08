<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import NewPasswordFields from '$lib/componentWidgets/forms/NewPasswordFields.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import InstructionText from '$lib/componentElements/InstructionText.svelte';
	import StatusMessage from '$lib/componentElements/StatusMessage.svelte';
	import messages from '$lib/data/messages.json';

	let token = '';
	let email = '';
	let newPassword = '';
	let passwordValid = false;
	let isLoading = false;
	let error = '';
	let successMessage = '';
	let isValidatingToken = true;
	let tokenValid = false;
	let formSubmitted = false;

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
		
		// All fields filled and passing validation?
		if (!passwordValid) {
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
	<Heading heading="h1" hasSub>Reset Password</Heading>
	<Heading heading="h2" isMuted>{email}</Heading>
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

		<NewPasswordFields
			bind:newPassword
			bind:isValid={passwordValid}
			{isLoading}
			{formSubmitted}
		/>

		<FormButtonBar>
			<Button type="submit" classes="blue" isDisabled={isLoading}>
				{#if isLoading}
					<Spinner size="sm" inline color="var(--white)" label="Resetting…" showLabel />
				{:else}
					Reset Password
				{/if}
			</Button>
		</FormButtonBar>
	{/if}
</form>

<style>	
	
</style>
