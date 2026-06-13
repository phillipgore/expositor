<script>
	/**
	 * Glossary Reference Page
	 *
	 * A full-page, searchable reference for every glossary term, grouped by
	 * category. It reuses the SAME data helpers the inline GlossaryPicker uses
	 * (`searchGlossary` + `groupByCategory`) and the SAME category color system
	 * as GlossaryBadge / GlossaryPicker, so search results, ordering, and colors
	 * stay perfectly in sync across the app.
	 *
	 * Unlike the compact picker popover, this page has room to show each term's
	 * full definition AND its example(s) inline, with a dynamic "Example:" /
	 * "Examples:" label driven by `entry.examplesPlural`.
	 *
	 * The page lives under the (app) group, so it inherits the authenticated app
	 * chrome (toolbar + side panels). The toolbar enters a read-only "reference
	 * mode" here (only Finder, Studies, and Analyze/Document remain usable),
	 * driven by the `/glossary` branch in the toolbar store.
	 */
	import { searchGlossary, groupByCategory, DOMAINS } from '$lib/data/glossaryIndex.js';
	import { tick } from 'svelte';

	let query = $state('');
	// Active domain tab — the page shows one domain's categories at a time.
	let activeDomain = $state(DOMAINS[0].id);

	// Flat (for counts) + grouped (for display) results — identical helpers to the
	// picker, scoped to the active domain.
	let results = $derived(
		searchGlossary(query).filter((entry) => entry.domain === activeDomain)
	);
	let groups = $derived(groupByCategory(results));

	/**
	 * Smooth-scroll to a category section when its jump-nav link is clicked.
	 * @param {string} categoryId
	 */
	function jumpTo(categoryId) {
		const el = document.getElementById(`category-${categoryId}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	/**
	 * Switch the active domain and scroll back to the top, so the user starts at
	 * the first category of the newly selected domain rather than mid-page.
	 *
	 * We await `tick()` so the scroll runs AFTER Svelte swaps in the new domain's
	 * sections. Otherwise the scroll fires against the OLD (often taller/shorter)
	 * content; when the height then changes the browser clamps the smooth-scroll,
	 * which made it work in one direction but not the other.
	 * @param {string} domainId
	 */
	async function selectDomain(domainId) {
		activeDomain = domainId;
		await tick();
		// The page itself scrolls inside the app's content area; walk up from the
		// page root to whichever ancestor is actually scrollable and reset it.
		const scroller = pageEl?.closest('.content-wrapper') ?? null;
		if (scroller) {
			scroller.scrollTo({ top: 0, behavior: 'smooth' });
		} else {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	// Bound to the page root so we can find the scrollable ancestor on tab switch.
	let pageEl = $state(null);
</script>

<div class="glossary-page" bind:this={pageEl}>
	<header class="glossary-header">
		<h1 class="glossary-title">Glossary</h1>
	</header>

	<!-- Domain tabs + search stick together so jumping to a category never
	     scrolls the domain switcher out of view. -->
	<div class="glossary-sticky">
		<div class="glossary-domains" role="tablist" aria-label="Glossary domain">
			{#each DOMAINS as domain (domain.id)}
				<button
					type="button"
					role="tab"
					aria-selected={activeDomain === domain.id}
					class="glossary-domain-tab"
					class:active={activeDomain === domain.id}
					onclick={() => selectDomain(domain.id)}
				>
					{domain.label}
				</button>
			{/each}
		</div>

		<div class="glossary-search">
			<input
				type="search"
				bind:value={query}
				placeholder="Search"
				aria-label="Search glossary terms"
			/>
		</div>
	</div>


	{#if results.length === 0}
		<p class="glossary-empty">No terms match “{query}”.</p>
	{:else}
		<div class="glossary-body">
			<!-- Sticky category jump-nav -->
			<nav class="glossary-nav" aria-label="Glossary categories">
				<ul>
					{#each groups as group (group.categoryId)}
						<li>
							<button type="button" class="nav-link {group.color}" onclick={() => jumpTo(group.categoryId)}>
								<span class="nav-dot {group.color}"></span>
								{group.category}
							</button>
						</li>
					{/each}
				</ul>
			</nav>

			<!-- Category sections -->
			<div class="glossary-sections">
				{#each groups as group (group.categoryId)}
					<section id="category-{group.categoryId}" class="glossary-section">
						<h2 class="section-title {group.color}">
							<span class="section-dot {group.color}"></span>
							{group.category}
						</h2>

						<div class="term-grid">
							{#each group.entries as entry (entry._id)}
								<article class="term-card {entry.color}">
									<h3 class="term-name">{entry.term}</h3>
									<p class="term-def">{entry.definition}</p>
									{#if entry.examples.length}
										<div class="term-example">
											<span class="term-example-label">
												{entry.examplesPlural ? 'Examples:' : 'Example:'}
											</span>
											<em>{entry.examples.join('; ')}</em>
										</div>
									{/if}
									{#if entry.notes.length}
										<div class="term-example">
											<span class="term-example-label">
												{entry.notesPlural ? 'Notes:' : 'Note:'}
											</span>
											<em>{entry.notes.join('; ')}</em>
										</div>
									{/if}
								</article>

							{/each}
						</div>
					</section>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.glossary-page {
		/* width:100% prevents this flex item (inside .content-wrapper, a flex
		   column) from shrink-wrapping to its content. Without it, auto side
		   margins disable stretch and the whole page — including the fixed-width
		   nav column — narrows as search hides longer terms. */
		width: 100%;
		max-width: 100rem;
		margin: 0 auto;
		padding: 2.4rem 2.4rem 6rem;
	}


	/* ============================================
	   HEADER + SEARCH
	   ============================================ */
	.glossary-header {
		margin-bottom: 2.4rem;
	}

	.glossary-title {
		margin: 0 0 0.6rem;
		font-size: 2.8rem;
		font-weight: 600;
		color: var(--black);
	}

	/* The domain tabs + search bar stick to the top together as one unit, so
	   jumping to a category never scrolls the domain switcher out of view. */
	.glossary-sticky {
		position: sticky;
		top: 0;
		z-index: 10;
		padding-top: 0.4rem;
		background-color: var(--white);
	}

	.glossary-domains {
		display: flex;
		gap: 0.8rem;
		margin-bottom: 0.4rem;
	}

	.glossary-domain-tab {
		padding: 0.7rem 1.4rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.4rem;
		background-color: var(--white);
		font-family: inherit;
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--gray-400);
		cursor: pointer;
		transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}

	.glossary-domain-tab:hover {
		color: var(--black);
		border-color: var(--gray-400);
	}

	.glossary-domain-tab.active {
		color: var(--blue-darker);
		border-color: var(--blue);
		background-color: var(--blue-lighter);
	}

	.glossary-domain-tab:focus-visible {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0 0 0.6rem var(--blue-alpha);
	}

	.glossary-search {
		padding: 1.2rem 0;
		background-color: var(--white);
	}

	.glossary-search input {
		appearance: none;
		width: 100%;
		height: 3.6rem;
		padding: 0 1.2rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 2.5vh;
		font-size: 1.5rem;
		font-family: inherit;
		color: var(--black);
		background-color: var(--white);
	}

	.glossary-search input:focus {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0 0 0.6rem var(--blue-alpha);
	}

	.glossary-empty {
		padding: 4rem 0;
		text-align: center;
		font-size: 1.5rem;
		color: var(--gray-400);
	}

	/* ============================================
	   BODY LAYOUT (nav + sections)
	   ============================================ */
	.glossary-body {
		display: grid;
		grid-template-columns: 20rem 1fr;
		gap: 3.2rem;
		align-items: start;
	}

	.glossary-nav {
		position: sticky;
		/* Clear the sticky header (domain tabs ~3.4rem + search 6rem ≈ 9.4rem). */
		top: 10rem;
	}

	.glossary-nav ul {

		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		width: 100%;
		padding: 0.6rem 0.8rem;
		border: none;
		border-radius: 0.4rem;
		background: transparent;
		text-align: left;
		font-family: inherit;
		font-size: 1.3rem;
		font-weight: 500;
		color: var(--gray-darker);
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.nav-link:hover {
		background-color: var(--gray-lighter);
	}

	.nav-dot,
	.section-dot {
		display: inline-block;
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		border-radius: 999em;
	}

	/* ============================================
	   SECTIONS + TERM CARDS
	   ============================================ */
	.glossary-sections {
		display: flex;
		flex-direction: column;
		gap: 3.2rem;
		min-width: 0;
	}

	.glossary-section {
		/* Offset the scroll target so a jumped-to section lands BELOW the sticky
		   header (domain tabs + search) instead of underneath it. */
		scroll-margin-top: 10rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin: 0 0 1.2rem;
		padding-bottom: 0.6rem;
		border-bottom: 0.1rem solid var(--gray-700);
		font-size: 1.8rem;
		font-weight: 600;
	}

	.term-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
		gap: 1.2rem;
	}

	.term-card {
		padding: 1.2rem 1.4rem;
		border-radius: 0.6rem;
	}

	.term-name {
		margin: 0 0 0.5rem;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.term-def {
		margin: 0;
		font-size: 1.3rem;
		line-height: 1.5;
		color: var(--gray-darker);
	}

	.term-example {
		margin-top: 0.8rem;
		padding-top: 0.8rem;
		border-top: 0.1rem solid var(--black-alpha);
		font-size: 1.25rem;
		line-height: 1.5;
		color: var(--gray-darker);
	}

	.term-example-label {
		font-weight: 600;
		margin-right: 0.3rem;
	}

	/* ============================================
	   CATEGORY COLORS
	   Mirrors GlossaryBadge / GlossaryPicker: lighter background,
	   darker text for the title/term, colored dot.
	   ============================================ */
	.term-card.gray { background-color: var(--gray-lighter); }
	.term-card.red { background-color: var(--red-lighter); }
	.term-card.orange { background-color: var(--orange-lighter); }
	.term-card.yellow { background-color: var(--yellow-lighter); }
	.term-card.green { background-color: var(--green-lighter); }
	.term-card.aqua { background-color: var(--aqua-lighter); }
	.term-card.blue { background-color: var(--blue-lighter); }
	.term-card.purple { background-color: var(--purple-lighter); }
	.term-card.pink { background-color: var(--pink-lighter); }

	.term-card.gray .term-name { color: var(--gray-darker); }
	.term-card.red .term-name { color: var(--red-darker); }
	.term-card.orange .term-name { color: var(--orange-darker); }
	.term-card.yellow .term-name { color: var(--yellow-darker); }
	.term-card.green .term-name { color: var(--green-darker); }
	.term-card.aqua .term-name { color: var(--aqua-darker); }
	.term-card.blue .term-name { color: var(--blue-darker); }
	.term-card.purple .term-name { color: var(--purple-darker); }
	.term-card.pink .term-name { color: var(--pink-darker); }

	.section-title.gray { color: var(--gray-darker); }
	.section-title.red { color: var(--red-darker); }
	.section-title.orange { color: var(--orange-darker); }
	.section-title.yellow { color: var(--yellow-darker); }
	.section-title.green { color: var(--green-darker); }
	.section-title.aqua { color: var(--aqua-darker); }
	.section-title.blue { color: var(--blue-darker); }
	.section-title.purple { color: var(--purple-darker); }
	.section-title.pink { color: var(--pink-darker); }

	.nav-dot.gray, .section-dot.gray { background-color: var(--gray); }
	.nav-dot.red, .section-dot.red { background-color: var(--red); }
	.nav-dot.orange, .section-dot.orange { background-color: var(--orange); }
	.nav-dot.yellow, .section-dot.yellow { background-color: var(--yellow); }
	.nav-dot.green, .section-dot.green { background-color: var(--green); }
	.nav-dot.aqua, .section-dot.aqua { background-color: var(--aqua); }
	.nav-dot.blue, .section-dot.blue { background-color: var(--blue); }
	.nav-dot.purple, .section-dot.purple { background-color: var(--purple); }
	.nav-dot.pink, .section-dot.pink { background-color: var(--pink); }

	/* ============================================
	   RESPONSIVE: collapse the jump-nav on narrow viewports
	   ============================================ */
	@media (max-width: 720px) {
		.glossary-body {
			grid-template-columns: 1fr;
		}
		.glossary-nav {
			display: none;
		}
	}
</style>
