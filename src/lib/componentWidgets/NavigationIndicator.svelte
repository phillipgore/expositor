<script>
	/**
	 * # NavigationIndicator
	 *
	 * App-wide navigation feedback driven by SvelteKit's `navigating` store. Because
	 * SvelteKit waits on every server `load` before completing a navigation, this one
	 * component covers ALL slow routes automatically (opening a study, a group, the
	 * edit flow, etc.) — including the heavy `study/[id]` load that hits the DB and,
	 * on a cache miss, the external translation API.
	 *
	 * It shows a single centered, opaque overlay with a quiet "Loading…" text over the
	 * content area only (it is positioned inside the (app) layout's `.content-area`).
	 *
	 * The study routes STREAM their heavy passage data, so `navigating` clears as soon
	 * as the light `load` returns — before the streamed content lands. To present ONE
	 * continuous loader (instead of handing off to a second in-page loader), we OR in
	 * the `studyContentLoading` store: the overlay stays up from navigation start until
	 * the streamed content has actually resolved.
	 *
	 * A short debounce prevents cached/instant navigations from flashing the indicator.
	 * Once shown, the overlay stays up across the navigation → content-loading handoff
	 * without re-debouncing, so there is no flicker between the two phases.
	 */
	import { navigating } from '$app/stores';
	import { studyContentLoading } from '$lib/stores/loading.js';
	import LoadingText from '$lib/componentElements/LoadingText.svelte';

	/**
	 * @typedef {Object} NavigationIndicatorProps
	 * @property {number} [delay=180] - ms a navigation must run before the indicator shows (suppresses flashing on fast/cached loads)
	 */

	/** @type {NavigationIndicatorProps} */
	let { delay = 180 } = $props();

	// Whether enough time has elapsed to show the overlay.
	let showOverlay = $state(false);

	$effect(() => {
		// The overlay is active during a SvelteKit navigation OR while a study page's
		// streamed content is still resolving. ORing these means the single indicator
		// spans the whole process: navigation start → light load → streamed content
		// ready, with no handoff to a separate in-page loader.
		const isLoading = !!$navigating || $studyContentLoading;

		if (!isLoading) {
			showOverlay = false;
			return;
		}

		// Already visible (e.g. the navigation phase showed it and we've now rolled over
		// into the content-loading phase) → keep it up with no re-debounce, so there is
		// no flicker between the two phases.
		if (showOverlay) {
			return;
		}

		// Debounce the initial show so fast/cached loads don't flash the indicator.
		const timer = setTimeout(() => {
			showOverlay = true;
		}, delay);

		return () => {
			clearTimeout(timer);
		};
	});
</script>

{#if showOverlay}
	<div class="nav-overlay">
		<LoadingText />
	</div>
{/if}

<style>
	/* ============================================
	   CENTERED OVERLAY
	   --------------------------------------------
	   Absolutely positioned within the (app) layout's `.content-area`, so it covers
	   only the study/content area — the toolbar and side panels stay visible. Opaque,
	   since there is no longer any surrounding UI it needs to let show through.
	   ============================================ */
	.nav-overlay {
		position: absolute;
		inset: 0;
		z-index: 10;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: var(--white);
		pointer-events: none;
	}
</style>
