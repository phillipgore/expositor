<script>
	let { classes, forId, text, isInline, isLarge, children } = $props();
</script>

<label for={forId} class="{classes} {isInline ? 'inline' : ''} {isLarge ? 'large' : ''}"
	>{text}</label
>

<style>
	label {
		display: flex;
		font-size: 1.4rem;
		color: var(--gray-400);
		font-weight: 500;
		margin-bottom: 0.6rem;

		&.inline {
			display: inline;
		}

		&.large {
			font-size: 1.8rem;
		}

		&.dark {
			color: var(--black);
		}
	}
</style>
