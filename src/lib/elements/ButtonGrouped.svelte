<script>
	let { isList = false, children } = $props();
</script>

<div class="group-container">
	<div class="group-wrapper {isList ? 'list' : ''}">
		{@render children()}
	</div>
</div>

<style>
	.group-container {
		display: inline-block;
		margin: 0rem 0.3rem;

		.group-wrapper {
			display: flex;
			justify-content: center;
			align-items: center;
			height: auto;

			&.list {
				flex-direction: column;
			}

			&:not(.list) :global(button.grouped) {
				margin-right: 0rem;
				margin-left: 0rem;
				border-radius: 0rem;
				border-left: none;
			}

			&:not(.list) :global(.no-button-container button.grouped:first-child),
			&:not(.list) :global(.button-container:first-child button.grouped) {
				border-radius: 0.3rem 0rem 0rem 0.3rem;
				border-left: none;
				margin-right: 0rem;
			}

			&:not(.list) :global(.no-button-container:not(.list) button.grouped:last-child),
			&:not(.list) :global(.button-container:last-child button.grouped) {
				border-radius: 0rem 0.3rem 0.3rem 0rem;
				border-left: none;
				margin-left: 0rem;
			}
		}
	}
</style>
