<script>
	/**
	 * @type {'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'aqua' | 'purple' | 'pink' | 'gray'}
	 */
	export let color = 'red';
	
	/**
	 * @type {string}
	 */
	export let message = '';
</script>

{#if message}
	<div class="alert {color}">
		{message}
	</div>
{/if}

<style>
	.alert {
		padding: 1rem;
		border-radius: 0.3rem;
		margin-bottom: 1.8rem;
		line-height: 1.5;
	}

	.alert.red {
		background-color: var(--red);
		color: var(--white);
	}

	.alert.green {
		background-color: var(--green);
		color: var(--white);
	}

	.alert.yellow {
		background-color: var(--yellow);
		color: var(--black);
	}

	.alert.blue {
		background-color: var(--blue);
		color: var(--white);
	}

	.alert.orange {
		background-color: var(--orange);
		color: var(--white);
	}

	.alert.aqua {
		background-color: var(--aqua);
		color: var(--white);
	}

	.alert.purple {
		background-color: var(--purple);
		color: var(--white);
	}

	.alert.pink {
		background-color: var(--pink);
		color: var(--white);
	}

	.alert.gray {
		background-color: var(--gray);
		color: var(--white);
	}
</style>
