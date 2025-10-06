<script>
	/**
	 * @type {'error' | 'success' | 'warning' | 'info'}
	 */
	export let type = 'error';
	
	/**
	 * @type {string}
	 */
	export let message = '';
</script>

{#if message}
	<div class="alert {type}">
		{message}
	</div>
{/if}

<style>
	.alert {
		padding: 1rem;
		border-radius: 0.3rem;
		margin-bottom: 1.8rem;
		border: 1px solid;
		line-height: 1.5;
	}

	.alert.error {
		background-color: var(--red-light);
		color: var(--red-dark);
		border-color: var(--red);
	}

	.alert.success {
		background-color: var(--green-light);
		color: var(--green-dark);
		border-color: var(--green);
	}

	.alert.warning {
		background-color: var(--yellow-light);
		color: var(--yellow-dark);
		border-color: var(--yellow);
	}

	.alert.info {
		background-color: var(--blue-light);
		color: var(--blue-dark);
		border-color: var(--blue);
	}
</style>
