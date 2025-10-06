<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
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
	
	<div class="name-fields">
		<FormField
			label="First Name"
			id="firstName"
			name="firstName"
			type="text"
			bind:value={firstName}
			isDisabled={isLoading}
		/>
		<FormField
			label="Last Name"
			id="lastName"
			name="lastName"
			type="text"
			bind:value={lastName}
			isDisabled={isLoading}
		/>
	</div>
	<FormField
		label="Email"
		id="email"
		name="email"
		type="email"
		bind:value={email}
		isDisabled={isLoading}
	/>
	<FormField
		label="Password"
		id="password"
		name="password"
		type="password"
		bind:value={password}
		isDisabled={isLoading}
	/>

	<FormButtonBar>
		<Button 
			type="submit" 
			label={isLoading ? "Signing Up..." : "Sign Up"}
			classes="system-blue"
			isDisabled={isLoading}
		/>
	</FormButtonBar>
</form>

<style>
	.name-fields {
		display: flex;
		gap: 2.1rem;
		margin-bottom: 1.8rem;
		
		:global(.form-field) {
			margin-bottom: 0;
		}
	}
</style>
