<script>
	/**
	 * @color {'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'pink'}
	 */
	export let color = 'red';
	
	/**
	 * @color {string}
	 */
	export let message = '';
</script>

{#if message}
	<div class="badge {color}">
		{message}
	</div>
{/if}

<style>
	.badge {
		padding: 0.6rem 0.9rem;
		border-radius: 999em;
        font-size: 1.2rem;
        font-weight: 500;
	}

	.badge.gray {
		background-color: var(--gray);
		color: var(--white);
	}

	.badge.red {
		background-color: var(--red);
		color: var(--white);
	}

	.badge.orange {
		background-color: var(--orange);
		color: var(--white);
	}

	.badge.yellow {
		background-color: var(--yellow-light);
		color: var(--black);
	}

	.badge.green {
		background-color: var(--green);
		color: var(--white);
	}

	.badge.aqua {
		background-color: var(--aqua);
		color: var(--white);
	}

	.badge.blue {
		background-color: var(--blue);
		color: var(--white);
	}

	.badge.purple {
		background-color: var(--purple);
		color: var(--white);
	}

	.badge.pink {
		background-color: var(--pink);
		color: var(--white);
	}
</style>
