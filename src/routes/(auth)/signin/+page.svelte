<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import Label from '$lib/elements/Label.svelte';
	import { signIn } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';

	let email = '';
	let password = '';
	let isLoading = false;
	let error = '';

	async function handleSubmit(event) {
		event.preventDefault();
		
		if (!email || !password) {
			error = 'Please fill in all fields';
			return;
		}

		isLoading = true;
		error = '';

		const result = await signIn(email, password);
		
		if (result.success) {
			goto('/new');
		} else {
			error = result.error;
		}
		
		isLoading = false;
	}
</script>

<Heading heading="h1" classes="h4">Sign In</Heading>

<form on:submit={handleSubmit}>
	
	<Alert type="error" message={error} />
	
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
			label={isLoading ? "Signing In..." : "Sign In"}
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
