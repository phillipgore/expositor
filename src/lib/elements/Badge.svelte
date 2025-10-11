<script>
	/**
	 * @color {'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'pink'}
	 * @size {'small'}
	 * @look {'subtle'}
	 */
	export let color = 'red';
	export let size = '';
	export let look = '';
	
	/**
	 * @color {string}
	 * @size {string}
	 * @look {string}
	 */
	export let message = '';
</script>

{#if message}
	<div class="badge {color} {size} {look}">
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

	.badge.subtle {
		border: 1px solid;
	}

	.badge.small {
		padding: 0.3rem 0.6rem;
        font-size: 1.0rem;
	}

	.badge.gray {
		background-color: var(--gray);
		color: var(--white);
	}

	.badge.gray.subtle {
		background-color: var(--gray-lighter);
		color: var(--gray-darker);
		border-color: var(--gray-light);
	}

	.badge.red {
		background-color: var(--red);
		color: var(--white);
	}

	.badge.red.subtle {
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border-color: var(--red-light);
	}

	.badge.orange {
		background-color: var(--orange);
		color: var(--white);
	}

	.badge.orange.subtle {
		background-color: var(--orange-lighter);
		color: var(--orange-darker);
		border-color: var(--orange-light);
	}

	.badge.yellow {
		background-color: var(--yellow-light);
		color: var(--yellow-darker);
	}

	.badge.yellow.subtle {
		background-color: var(--yellow-lighter);
		color: var(--yellow-darker);
		border-color: var(--yellow-light);
	}

	.badge.green {
		background-color: var(--green);
		color: var(--white);
	}

	.badge.green.subtle {
		background-color: var(--green-lighter);
		color: var(--green-darker);
		border-color: var(--green-light);
	}

	.badge.aqua {
		background-color: var(--aqua);
		color: var(--white);
	}

	.badge.aqua.subtle {
		background-color: var(--aqua-lighter);
		color: var(--aqua-darker);
		border-color: var(--aqua-light);
	}

	.badge.blue {
		background-color: var(--blue);
		color: var(--white);
	}

	.badge.blue.subtle {
		background-color: var(--blue-lighter);
		color: var(--blue-darker);
		border-color: var(--blue-light);
	}

	.badge.purple {
		background-color: var(--purple);
		color: var(--white);
	}

	.badge.purple.subtle {
		background-color: var(--purple-lighter);
		color: var(--purple-darker);
		border-color: var(--purple-light);
	}

	.badge.pink {
		background-color: var(--pink);
		color: var(--white);
	}

	.badge.pink.subtle {
		background-color: var(--pink-lighter);
		color: var(--pink-darker);
		border-color: var(--pink-light);
	}
</style>
