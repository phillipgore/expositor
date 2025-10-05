<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
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
			goto('/new');
		} else {
			error = result.error;
		}
		
		isLoading = false;
	}
</script>

<div class="wrapper">
	<form on:submit={handleSubmit}>
		<Heading heading="h4">Sign Up</Heading>
		
		<Alert type="error" message={error} />
		
		<div class="name-container">
			<div>
				<label for="firstName">First Name</label>
				<TextInput bind:value={firstName} isFullWidth type="text" isDisabled={isLoading} id="firstName" name="firstName" isLarge={false}></TextInput>
			</div>
			<div>
				<label for="lastName">Last Name</label>
				<TextInput bind:value={lastName} isFullWidth type="text" isDisabled={isLoading} id="lastName" name="lastName" isLarge={false}></TextInput>
			</div>
		</div>
		<div class="email-container">
			<label for="email">Email</label>
			<TextInput bind:value={email} isFullWidth type="email" isDisabled={isLoading} id="email" name="email" isLarge={false}></TextInput>
		</div>
		<div class="password-container">
			<label for="password">Password</label>
			<TextInput bind:value={password} isFullWidth type="password" isDisabled={isLoading} id="password" name="password" isLarge={false}></TextInput>
		</div>

		<div class="button-bar">
			<button 
				type="submit" 
				class="signup-button"
				disabled={isLoading}
			>
				{isLoading ? "Signing Up..." : "Sign Up"}
			</button>
		</div>
	</form>
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		padding-top: 5.4em;

		form {
			display: flex;
			flex-direction: column;
			width: 36rem;
			margin-bottom: 18rem;

			label {
				display: block;
				margin-bottom: 0.6rem;
				font-size: 1.4rem;
				color: var(--gray-400);
				font-weight: 500;
			}

			.name-container {
				display: flex;
				gap: 2.1rem;
				margin-top: 2.7rem;
				margin-bottom: 1.8rem;
			}

			.email-container {
				margin-bottom: 1.8rem;
			}

			.button-bar {
				display: flex;
				justify-content: flex-end;
				gap: 0.6rem;
				margin-top: 2.7rem;
			}
		}
	}
</style>
