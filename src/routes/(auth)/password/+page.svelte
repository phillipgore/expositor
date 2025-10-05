<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import { goto } from '$app/navigation';

	let email = '';
	let isLoading = false;
	let error = '';
	let successMessage = '';
	let description = "Enter your email address and we'll send you a link to reset your password."

	async function handleSubmit(event) {
		event.preventDefault();
		
		if (!email) {
			error = 'Please enter your email address';
			return;
		}

		isLoading = true;
		error = '';

		// For now, just show a success message
		// In a real implementation, you would call a password reset API
		setTimeout(() => {
			successMessage = "If an account with that email exists, we've sent you a password reset link.";
			isLoading = false;
		}, 1000);
	}
</script>

<div class="wrapper">
	<form on:submit={handleSubmit}>
		<Heading heading="h4" description={description}>Reset Password</Heading>
		
		<Alert type="error" message={error} />
		<Alert type="success" message={successMessage} />
		
		{#if !successMessage}
			<div class="email-container">
				<label for="email">Email</label>
				<TextInput bind:value={email} isFullWidth type="email" isDisabled={isLoading} id="email" name="email" isLarge={false}></TextInput>
			</div>

			<div class="button-bar">
				<button 
					type="submit" 
					class="reset-button"
					disabled={isLoading}
				>
					{isLoading ? "Sending..." : "Send Link"}
				</button>
			</div>
		{/if}
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

			.email-container {
				margin-top: 2.7rem;
			}

			.button-bar {
				display: flex;
				justify-content: flex-end;
				gap: 0.6rem;
				margin-top: 2.7rem;
			}

			.reset-button {
				background-color: var(--system-blue);
				color: white;
				border: none;
				border-radius: 0.3rem;
				padding: 0.8rem 1.6rem;
				font-size: 1.2rem;
				font-weight: 500;
				cursor: pointer;
				min-width: 4.8rem;

				&:hover:not(:disabled) {
					background-color: #0056b3;
				}

				&:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}
			}
		}
	}
</style>
