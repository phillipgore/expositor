<script>
	let { heading, classes, children, alignCenter, alignRight, hasSub, isMuted } = $props();
</script>

{#if heading === 'h1'}
	<h1 class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''}">
		{@render children()}
	</h1>
{/if}
{#if heading === 'h2'}
	<h2 class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''}">
		{@render children()}
	</h2>
{/if}
{#if heading === 'h3'}
	<h3 class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''}">
		{@render children()}
	</h3>
{/if}
{#if heading === 'h4'}
	<h4 class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''}">
		{@render children()}
	</h4>
{/if}
{#if heading === 'h5'}
	<h5 class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''}">
		{@render children()}
	</h5>
{/if}
{#if heading === 'h6'}
	<h6 class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''}">
		{@render children()}
	</h6>
{/if}


<style>

	.align-center {
		text-align: center;
	}

	.align-right {
		text-align: right;
	}
    
	h1,
	.h1,
	h2,
	.h2,
	h3,
	.h3,
	h4,
	.h4,
	h5,
	.h5,
	h6,
	.h6 {
		margin: 0em 0em 0.75em;
		color: var(--black);
	}
	h1,
	.h1 {
		font-size: 4rem;
	}
	h2,
	.h2 {
		font-size: 3.2rem;
	}
	h3,
	.h3 {
		font-size: 2.8rem;
	}
	h4,
	.h4 {
		font-size: 2.4rem;
	}
	h5,
	.h5 {
		font-size: 2rem;
	}
	h6,
	.h6 {
		font-size: 1.6rem;
	}
	.has-sub{
		margin: 0.0rem;
		line-height: 1.5;
	}
	.muted {
		color: var(--gray-500)
	}
</style>
