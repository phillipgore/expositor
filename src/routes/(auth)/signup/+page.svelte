<script>
	import Button from '$lib/elements/Button.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Fieldset from '$lib/elements/Fieldset.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Label from '$lib/elements/Label.svelte';
	import TextInput from '$lib/elements/TextInput.svelte';
</script>

<div class="wrapper">
	<form>
		<Heading heading="h4">Sign Up</Heading>
		<div class="name-container">
			<div class="first-container">
				<Label text="First"></Label>
				<TextInput isFullWidth></TextInput>
			</div>
			<div class="last-container">
				<Label text="Last"></Label>
				<TextInput isFullWidth></TextInput>
			</div>
		</div>
		<div class="email-container">
			<Label text="Email"></Label>
			<TextInput isFullWidth type="email"></TextInput>
		</div>
		<div class="password-container">
			<Label text="Password"></Label>
			<TextInput isFullWidth type="password"></TextInput>
		</div>
		<div class="retype-password-container">
			<Label text="Retype Password"></Label>
			<TextInput isFullWidth type="password"></TextInput>
		</div>

		<div class="button-bar">
			<Button label="Sign In" classes="system-blue"></Button>
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

			.name-container {
				display: flex;
				align-content: center;
				gap: 1.8rem;
				margin-top: 2.7rem;
			}

			.name-container,
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
		}
	}
</style>

