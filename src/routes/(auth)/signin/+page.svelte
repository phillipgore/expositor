<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import Button from '$lib/elements/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
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
			label={isLoading ? "Signing In..." : "Sign In"}
			classes="system-blue"
			isDisabled={isLoading}
		/>
	</FormButtonBar>
</form>
