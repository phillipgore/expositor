<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import ToolbarAuth from '$lib/components/ToolbarAuth.svelte';
	import Icon from '$lib/elements/Icon.svelte';
</script>

<ToolbarAuth></ToolbarAuth>

<div class="wrapper">
	<div class="branding">
		<Icon iconId="book" isActive={false} classes=""></Icon>
		<h1>Expositor App</h1>
		
		{#if $isAuthenticated}
			<p>Welcome back! <a href="/new">Continue to your work</a></p>
		{:else}
			<p>A powerful tool for biblical exposition and study.</p>
			<div class="auth-links">
				<a href="/signin" class="auth-link">Sign In</a>
				<a href="/signup" class="auth-link">Sign Up</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		justify-content: center;

		.branding {
			display: flex;
			flex-direction: column;
			align-items: center;
			margin-bottom: 12rem;

			h1 {
				font-size: 4rem;
				margin: 0 0 0.5em;
				color: var(--black);
				text-align: center;
			}

			p {
				color: var(--gray-400);
				font-size: 1.4rem;
				text-align: center;
				margin-bottom: 2rem;
				
				a {
					color: var(--system-blue);
					text-decoration: none;
					
					&:hover {
						text-decoration: underline;
					}
				}
			}

			.auth-links {
				display: flex;
				gap: 1.5rem;
				margin-top: 1rem;
			}

			.auth-link {
				background-color: var(--system-blue);
				color: white;
				text-decoration: none;
				padding: 0.8rem 1.6rem;
				border-radius: 0.3rem;
				font-size: 1.2rem;
				font-weight: 500;
				transition: background-color 0.2s;

				&:hover {
					background-color: #0056b3;
				}

				&:first-child {
					background-color: var(--system-gray);
					
					&:hover {
						background-color: #5a5a5a;
					}
				}
			}

			:global(.icon) {
				height: 6rem;
				max-width: initial;
				margin-bottom: 2.1rem;
				fill: var(--blue);
			}
		}
	}
</style>
