<script>
	import TextInput from '$lib/elements/TextInput.svelte';
	import { signUp } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';

	let name = '';
	let email = '';
	let password = '';
	let isLoading = false;
	let error = '';

	async function handleSubmit(event) {
		event.preventDefault();
		
		if (!name || !email || !password) {
			error = 'Please fill in all fields';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		isLoading = true;
		error = '';

		const result = await signUp(name, email, password);
		
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
		<h4>Sign Up</h4>
		
		{#if error}
			<div class="error">{error}</div>
		{/if}
		
		<div class="name-container">
			<label for="name">Name</label>
			<TextInput bind:value={name} isFullWidth type="text" isDisabled={isLoading} id="name" name="name" isLarge={false}></TextInput>
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
		
		<div class="signin-link">
			<p>Already have an account? <a href="/signin">Sign in</a></p>
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

			.name-container {
				margin-top: 2.7rem;
				margin-bottom: 1.8rem;
			}

			.email-container,
			.password-container {
				margin-bottom: 1.8rem;
			}

			.button-bar {
				display: flex;
				justify-content: flex-end;
				gap: 0.6rem;
				margin-top: 2.7rem;
			}

			.signup-button {
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
