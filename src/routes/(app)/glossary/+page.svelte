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
	import { searchGlossary, groupByCategory } from '$lib/data/glossaryIndex.js';

	let query = $state('');

	// Flat (for counts) + grouped (for display) results — identical helpers to the picker.
	let results = $derived(searchGlossary(query));
	let groups = $derived(groupByCategory(results));

	/**
	 * Smooth-scroll to a category section when its jump-nav link is clicked.
	 * @param {string} categoryId
	 */
	function jumpTo(categoryId) {
		const el = document.getElementById(`category-${categoryId}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<svelte:head>
	<title>Glossary · Expositor</title>
</svelte:head>

<div class="glossary-page">
	<header class="glossary-header">
		<h1 class="glossary-title">Glossary</h1>
	</header>

	<div class="glossary-search">
		<input
			type="search"
			bind:value={query}
			placeholder="Search"
			aria-label="Search glossary terms"
		/>
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

	.glossary-search {
		position: sticky;
		top: 0;
		z-index: 10;
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
		/* Clear the sticky search bar (3.6rem input + 1.2rem top/bottom padding = 6rem) */
		top: 6rem;
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
		scroll-margin-top: 2.4rem;
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
