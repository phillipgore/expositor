<script>
	import TextInput from '$lib/elements/TextInput.svelte';
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

<div class="wrapper">
	<form on:submit={handleSubmit}>
		<h4>Sign In</h4>
		
		{#if error}
			<div class="error">{error}</div>
		{/if}
		
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
				class="signin-button"
				disabled={isLoading}
			>
				{isLoading ? "Signing In..." : "Sign In"}
			</button>
		</div>
		
		<div class="signup-link">
			<p>Don't have an account? <a href="/signup">Sign up</a></p>
			<p><a href="/password">Forgot your password?</a></p>
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

			.error {
				background-color: #fee;
				color: #c33;
				padding: 1rem;
				border-radius: 0.3rem;
				margin-bottom: 1rem;
				border: 1px solid #fcc;
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

			.signin-button {
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

			.signup-link {
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
