<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import Label from '$lib/elements/Label.svelte';
	import { signUp } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';

	let firstName = '';
	let lastName = '';
	let email = '';
	let password = '';
	let isLoading = false;
	let error = '';

	async function handleSubmit(event) {
		event.preventDefault();
		
		if (!firstName || !lastName || !email || !password) {
			error = 'Please fill in all fields';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		isLoading = true;
		error = '';

		// Pass first and last name separately
		const result = await signUp(firstName.trim(), lastName.trim(), email, password);
		
		if (result.success) {
			if (result.requiresVerification) {
				// Redirect to verify-pending page with email parameter
				goto(`/verify-pending?email=${encodeURIComponent(result.email)}`);
			} else {
				// Fallback in case verification is not required
				goto('/new');
			}
		} else {
			error = result.error;
		}
		
		isLoading = false;
	}
</script>

<Heading heading="h1" classes="h4">Sign Up</Heading>

<form on:submit={handleSubmit}>
	<Alert type="error" message={error} />
	
	<div class="input-container columns">
		<div>
			<Label forId="firstName" text="First Name" />
			<TextInput bind:value={firstName} isFullWidth type="text" isDisabled={isLoading} id="firstName" name="firstName" isLarge={false}></TextInput>
		</div>
		<div>
			<Label forId="lastName" text="Last Name" />
			<TextInput bind:value={lastName} isFullWidth type="text" isDisabled={isLoading} id="lastName" name="lastName" isLarge={false}></TextInput>
		</div>
	</div>
	<div class="input-container">
		<Label forId="email" text="Email" />
		<TextInput bind:value={email} isFullWidth type="email" isDisabled={isLoading} id="email" name="email" isLarge={false}></TextInput>
	</div>
	<div class="input-container">
		<Label forId="password" text="Password" />
		<TextInput bind:value={password} isFullWidth type="password" isDisabled={isLoading} id="password" name="password" isLarge={false}></TextInput>
	</div>

	<div class="button-bar">
		<Button 
			type="submit" 
			label={isLoading ? "Signing Up..." : "Sign Up"}
			classes="system-blue"
			isDisabled={isLoading}
		/>
	</div>
</form>

<style>
	.input-container {
		margin-bottom: 1.8rem;

		&.columns {
			display: flex;
			gap: 2.1rem;
			margin-bottom: 1.8rem;
		}
	}

	.button-bar {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}
</style>
