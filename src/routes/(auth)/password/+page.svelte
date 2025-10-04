<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import { goto } from '$app/navigation';

	let email = '';
	let isLoading = false;
	let error = '';
	let success = false;

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
			success = true;
			isLoading = false;
		}, 1000);
	}
</script>

<div class="wrapper">
	<form on:submit={handleSubmit}>
		<h4>Reset Password</h4>
		
		{#if error}
			<div class="error">{error}</div>
		{/if}
		
		{#if success}
			<div class="success">
				If an account with that email exists, we've sent you a password reset link.
			</div>
		{:else}
			<p class="description">
				Enter your email address and we'll send you a link to reset your password.
			</p>
			
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
					{isLoading ? "Sending..." : "Send Reset Link"}
				</button>
			</div>
		{/if}
		
		<div class="signin-link">
			<p>Remember your password? <a href="/signin">Sign in</a></p>
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

			h4 {
				font-size: 2.4rem;
				margin: 0 0 0.5em;
				color: var(--black);
			}

			.description {
				color: var(--gray-400);
				margin-bottom: 2rem;
				line-height: 1.5;
			}

			.error {
				background-color: #fee;
				color: #c33;
				padding: 1rem;
				border-radius: 0.3rem;
				margin-bottom: 1rem;
				border: 1px solid #fcc;
			}

			.success {
				background-color: #efe;
				color: #363;
				padding: 1rem;
				border-radius: 0.3rem;
				margin-bottom: 1rem;
				border: 1px solid #cfc;
			}

			label {
				display: block;
				margin-bottom: 0.6rem;
				font-size: 1.4rem;
				color: var(--gray-400);
				font-weight: 500;
			}

			.email-container {
				margin-top: 2.7rem;
				margin-bottom: 1.8rem;
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

			.signin-link {
				text-align: center;
				margin-top: 2rem;
				
				p {
					color: var(--gray-400);
					
					a {
						color: var(--system-blue);
						text-decoration: none;
						
						&:hover {
							text-decoration: underline;
						}
					}
				}
			}
		}
	}
</style>
