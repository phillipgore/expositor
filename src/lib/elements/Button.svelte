<script>
	import MenuRegistratrion from '$lib/components/MenuRegistratrion.svelte';
	import Icon from './Icon.svelte';
	import { v4 as uuidv4 } from 'uuid';

	let {
		id = uuidv4(),
		classes = 'system-blue',
		url,
		handleClick,
		groupedIsActive,
		isActive,
		label,
		underLabel,
		underLabelClasses,
		isSwitch = false,
		isDisabled,
		isFullWidth,
		isRound,
		iconId,
		menuId,
		shortcut,
		children
	} = $props();

	let buttonHeight = $state();
	let menuOffset = $state();
	let iconClasses = $state();

	const buttonClick = () => {
		if (handleClick) {
			handleClick();
		}
		if (menuId) {
			menuOffset = `${(buttonHeight + 3) / 10}rem`;
		}
		if (menuId || isSwitch) {
			isActive = !isActive;
		}
		if (groupedIsActive) {
			groupedIsActive(event.target);
		}
		if (url) {
			window.location.href = url;
		}
	};

	const mouseEvent = (delta) => {
		if (!menuId && !isSwitch && !groupedIsActive) {
			isActive = delta;
		}
	};

	const windowClick = (event) => {
		if (menuId && event.target.id != id) {
			isActive = false;
		}
	};

	const setLabel = (newLabel) => {
		label = newLabel;
	};

	$effect(() => {
		let iconSpace = label ? 'icon-space' : '';
		let blank = iconId === 'blank' ? 'blank' : '';
		iconClasses = `${iconSpace} ${blank}`;
	});
</script>

<svelte:window onclick={windowClick} />

{#snippet button()}
	<button
		{id}
		class="{classes} {isActive ? 'active' : ''} {isRound ? 'round' : ''} {isFullWidth
			? 'full-width'
			: ''}"
		onclick={() => buttonClick()}
		onmousedown={() => mouseEvent(true)}
		onmouseup={() => mouseEvent(false)}
		bind:offsetHeight={buttonHeight}
		disabled={isDisabled}
	>
		{#if iconId}
			<Icon {iconId} {isActive} classes={iconClasses} />
		{/if}
		{#if label}
			{label}
		{/if}
		{#if !iconId && !label}
			NO LABEL
		{/if}
		{#if menuId}
			<Icon iconId="caret-down" {isActive} classes="menu-caret" />
		{/if}
		<!-- {#if shortcut} <div class="shortcut">{@html shortcut}</div> {/if} -->
	</button>
{/snippet}

{#if underLabel}
	<div class="button-container">
		<div class="button-wrapper">
			{#if menuId}
				<span class="menu-wrapper">
					{@render button()}
					<MenuRegistratrion {menuId} {isActive} {menuOffset} setButtonLabel={setLabel}
					></MenuRegistratrion>
				</span>
			{:else}
				{@render button()}
			{/if}
			<div class="button-under-label {underLabelClasses} {isDisabled ? 'disabled' : ''}">
				{underLabel}
			</div>
		</div>
	</div>
{:else if menuId}
	<span class="menu-wrapper">
		{@render button()}
		<MenuRegistratrion {menuId} {isActive} {menuOffset} setButtonLabel={setLabel}
		></MenuRegistratrion>
	</span>
{:else}
	{@render button()}
{/if}

<style>
	button {
		display: flex;
		justify-content: center;
		align-items: center;
		white-space: nowrap;
		border-radius: 0.3rem;
		height: 2.4rem;
		min-width: 4.8rem;
		padding: 0rem 0.6rem;
		/* margin:  0rem 0.3rem; */
		border: none;
		outline: 0;
		font-size: 1.2rem;
		font-weight: 500;
		color: var(--white);
		background-color: transparent;
		text-decoration: none;

		.shortcut {
			color: var(--gray-500);
			text-align: right;
			margin-left: 1.8rem;
			flex-grow: 1;
		}

		&.round {
			border-radius: 50%;
			min-width: 2.4rem;
			width: 2.4rem;
			padding: 0rem;

			&.large {
				min-width: 3rem;
				width: 3rem;
				height: 3rem;
			}
		}

		&.justify-content-left {
			justify-content: left;
		}

		&.full-width {
			width: 100%;
		}

		&.toolbar-dark {
			border: 0.1rem solid;
			border-color: var(--gray-200);
			background-color: var(--gray-400);
			margin: 0rem 0.2rem;

			&.active:enabled {
				background-color: var(--gray-800);
				color: var(--gray-200);

				:global(.icon path) {
					fill: var(--gray-200);
				}
			}

			:global(.icon path) {
				fill: var(--white);
			}
		}

		&.menu-light:enabled {
			color: var(--black);
			background-color: transparent;
			border: none;
			text-decoration: none;
			height: 2.6rem;
			margin: 0rem;
			justify-content: left;

			:global(.icon path) {
				fill: var(--gray-200);
			}

			&.icon-fill-red :global(.icon path) {
				fill: var(--red);
			}
			&.icon-fill-orange :global(.icon path) {
				fill: var(--orange);
			}
			&.icon-fill-yellow :global(.icon path) {
				fill: var(--yellow);
			}
			&.icon-fill-green :global(.icon path) {
				fill: var(--green);
			}
			&.icon-fill-aqua :global(.icon path) {
				fill: var(--aqua);
			}
			&.icon-fill-blue :global(.icon path) {
				fill: var(--blue);
			}
			&.icon-fill-purple :global(.icon path) {
				fill: var(--purple);
			}
			&.icon-fill-pink :global(.icon path) {
				fill: var(--pink);
			}

			:global(.icon.blank path) {
				fill: transparent;
			}

			&:hover {
				color: var(--white);
				background-color: var(--system-blue);

				.shortcut {
					color: var(--white);
				}

				:global(.icon path) {
					fill: var(--white);
				}

				:global(.icon.blank path) {
					fill: transparent;
				}

				&.icon-fill-red :global(.icon path) {
					fill: var(--red);
				}
				&.icon-fill-orange :global(.icon path) {
					fill: var(--orange);
				}
				&.icon-fill-yellow :global(.icon path) {
					fill: var(--yellow);
				}
				&.icon-fill-green :global(.icon path) {
					fill: var(--green);
				}
				&.icon-fill-aqua :global(.icon path) {
					fill: var(--aqua);
				}
				&.icon-fill-blue :global(.icon path) {
					fill: var(--blue);
				}
				&.icon-fill-purple :global(.icon path) {
					fill: var(--purple);
				}
				&.icon-fill-pink :global(.icon path) {
					fill: var(--pink);
				}
			}
		}

		&.menu-light:disabled {
			color: var(--black);
			opacity: 0.55;
			:global(.icon path) {
				fill: var(--gray-200);
			}
		}

		&.system-blue {
			border-color: var(--system-blue);
			background-color: var(--system-blue);

			:global(.icon path) {
				fill: var(--white);
			}

			&:disabled :global(.icon) {
				opacity: 0.85;
			}
		}

		&.system-gray {
			border-color: var(--system-gray);
			background-color: var(--system-gray);

			:global(.icon path) {
				fill: var(--white);
			}

			&:disabled :global(.icon) {
				opacity: 0.85;
			}
		}

		&.system-red {
			border-color: var(--system-red);
			background-color: var(--system-red);

			:global(.icon path) {
				fill: var(--white);
			}

			&:disabled :global(.icon) {
				opacity: 0.85;
			}
		}

		&:disabled {
			opacity: 0.55;
		}
	}

	.button-container {
		display: inline-block;

		.button-wrapper {
			display: flex;
			flex-direction: column;
			position: relative;
		}

		.button-under-label {
			text-align: center;
			font-size: 1.1rem;
			letter-spacing: 0.04rem;
			cursor: default;
			padding: 0rem 0.4rem;
			z-index: 5;
			display: block;
			margin-top: 0.3rem;
			font-weight: 400;
			color: var(--black);

			&.light {
				color: var(--white);
			}

			&.disabled {
				opacity: 0.65;
			}
		}

		.menu-wrapper {
			display: flex;
			flex-direction: column;
		}
	}
</style>
