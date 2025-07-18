<script>
	import Button from '$lib/elements/Button.svelte';
	import Fieldset from '$lib/elements/Fieldset.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Label from '$lib/elements/Label.svelte';
	import TextInput from '$lib/elements/TextInput.svelte';
</script>

<div class="wrapper">
	<form>
		<Heading heading="h4">Reset Password</Heading>
		
		<div class="email-container">
			<Label text="Email"></Label>
			<TextInput isFullWidth type="email"></TextInput>
		</div>

		<p>Enter the email associated with your account and we will send you a link to reset your password.</p>

		<div class="button-bar">
			<Button label="Send Email" classes="system-blue"></Button>
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

			.email-container {
				margin-top: 2.7rem;
			}

			p {
				color: var(--gray-600);
				font-size: 1.4rem;
				line-height: 1.5;
				margin-bottom: 0.0rem;
				padding: 0.0rem;
			}

			.button-bar {
				display: flex;
				justify-content: flex-end;
				gap: 0.6rem;
				margin-top: 1.8rem;
			}
		}
	}
</style>
