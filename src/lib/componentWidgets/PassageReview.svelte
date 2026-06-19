<script>
	/**
	 * # PassageReview Component
	 *
	 * Full-page review of the structural impact of a study edit. Rendered on the
	 * dedicated review page (reached via the "Next" button on the Edit Study form
	 * when the passage changes need decisions before saving).
	 *
	 * Per passage it surfaces:
	 * - **Added verses** (start and/or end): where should they go?
	 *   → extend the neighboring segment, or start a new Segment / Section / Column.
	 * - **Removed verses** whose structure carries content (segment headings,
	 *   notes, commentary) or connections: Merge into the surviving neighbor, or
	 *   Delete. Radio labels are intentionally terse — the full explanation lives
	 *   in a hover tooltip. (Sections and columns no longer carry their own
	 *   content, so only segments and connections ever need a decision.)
	 * - **Book/testament change** (full replace): a warning that the old structure
	 *   will be rebuilt fresh.
	 *
	 * Decisions are keyed by passageId and exposed via `bind:decisions` so the
	 * page can submit them alongside the form.
	 *
	 * ## Props
	 * @property {Object|null} report - { passages: [...], requiresReview } from analyze-edit
	 * @property {Object} decisions - bindable decisions map keyed by passageId
	 * @property {import('svelte').Snippet} [footer] - optional content (e.g. an
	 *   action button bar) rendered as a full-width row INSIDE the passage grid.
	 *   Because it spans the populated columns, it tracks the actual rendered
	 *   width of the card row — so right-aligned buttons line up with the cards'
	 *   right edge regardless of how many cards (1, 2, 3+) are shown or how they
	 *   wrap, instead of floating to the far edge of a full-width page.
	 *
	 * @component
	 */
	import Label from '$lib/componentElements/Label.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import { tooltip } from '$lib/composables/useTooltip.svelte.js';

	let { report = null, decisions = $bindable({}), footer = undefined } = $props();


	// The "extend" option is phrased per edge: prepend at the start, append at
	// the end. The remaining options are identical for both edges.
	const NEW_OPTIONS = [
		{ value: 'segment', label: 'New Segment' },
		{ value: 'section', label: 'New Section' },
		{ value: 'column', label: 'New Column' }
	];
	const ADD_START_OPTIONS = [{ value: 'extend', label: 'Prepend to first segment' }, ...NEW_OPTIONS];
	const ADD_END_OPTIONS = [{ value: 'extend', label: 'Append to last segment' }, ...NEW_OPTIONS];

	/**
	 * Seed a per-edge bundle of GROUP-level decisions — one choice per entity
	 * kind, applied to every orphaned item of that kind. Defaults to the
	 * non-destructive choice ('merge'/'reanchor') when at least one item of the
	 * kind can honor it, otherwise 'delete'. Preserves a prior choice if present.
	 */
	function seedRemovalBundle(impact, prev) {
		if (!impact) return undefined;
		const prior = prev || {};
		const seedGroup = (items, priorVal, canKey, mergeVal) => {
			if (priorVal) return priorVal;
			const anyCan = (items || []).some((it) => it[canKey]);
			return anyCan ? mergeVal : 'delete';
		};
		return {
			segments: seedGroup(impact.segments, prior.segments, 'canMerge', 'merge'),
			connections: seedGroup(impact.connections, prior.connections, 'canReanchor', 'reanchor')
		};
	}

	// Seed sensible defaults whenever a new report arrives.
	$effect(() => {
		if (!report?.passages) return;
		const seeded = {};
		for (const p of report.passages) {
			const d = decisions[p.passageId] || {};
			seeded[p.passageId] = {
				addStartPlacement: d.addStartPlacement || 'extend',
				addEndPlacement: d.addEndPlacement || 'extend',
				removeStart: seedRemovalBundle(p.removeStart, d.removeStart),
				removeEnd: seedRemovalBundle(p.removeEnd, d.removeEnd)
			};
		}
		decisions = seeded;
	});

	function setDecision(passageId, key, value) {
		decisions = {
			...decisions,
			[passageId]: { ...(decisions[passageId] || {}), [key]: value }
		};
	}

	/**
	 * Set a group-level decision within a removal edge bundle (applies to every
	 * orphaned item of that kind).
	 * @param {string} passageId
	 * @param {'removeStart'|'removeEnd'} edge
	 * @param {'segments'|'connections'} group
	 * @param {string} value
	 */
	function setGroupDecision(passageId, edge, group, value) {
		const passage = decisions[passageId] || {};
		const bundle = passage[edge] || {};
		decisions = {
			...decisions,
			[passageId]: {
				...passage,
				[edge]: { ...bundle, [group]: value }
			}
		};
	}

	/** Read the current group-level decision (for `checked` binding). */
	function groupDecision(passageId, edge, group) {
		return decisions[passageId]?.[edge]?.[group];
	}

	/**
	 * Build the ordered list of non-empty entity groups for a removal edge, each
	 * with its heading, items, and decision choices. Distributing these across
	 * two stacking columns lets each column's first heading top-align while
	 * avoiding the row-height gaps a single grid produces.
	 */
	function buildGroups(impact, neighborWord) {
		const groups = [];
		if (impact.segments?.length) {
			groups.push({
				group: 'segments',
				heading: 'Segments',
				items: impact.segments,
				choices: [
					{
						value: 'merge',
						label: 'Merge',
						tip: `Merge content into the ${neighborWord} segment.`,
						can: impact.segments.some((i) => i.canMerge)
					},
					{ value: 'delete', label: 'Delete', tip: 'Delete this content permanently.', can: true }
				]
			});
		}
		if (impact.connections?.length) {
			groups.push({
				group: 'connections',
				heading: 'Connections',
				items: impact.connections,
				choices: [
					{
						value: 'reanchor',
						label: 'Re-anchor or Merge',
						tip: 'Re-anchor to the surviving item (merge if it already exists).',
						can: impact.connections.some((i) => i.canReanchor)
					},
					{ value: 'delete', label: 'Delete', tip: 'Delete this connection permanently.', can: true }
				]
			});
		}
		return groups;
	}

	/**
	 * Split groups into two columns in reading order: first half on the left,
	 * the remainder on the right. Collapsing to one column preserves top-to-
	 * bottom order. Returns [] for the right column when there's only one group.
	 */
	function splitColumns(groups) {
		const mid = Math.ceil(groups.length / 2);
		return [groups.slice(0, mid), groups.slice(mid)];
	}
</script>


{#if report?.passages}
	<div class="passage-grid">
		{#each report.passages as p (p.passageId)}
			<div class="passage-block">
				<Heading heading="h3">{p.reference || p.label}</Heading>

				<div class="passage-card">
					{#if p.replace}
						<Alert
							color="orange"
							look="subtle"
							message="This passage now points to a different book. Its existing columns, sections, segments, headings, notes, commentary, tags, and connections cannot be carried over and will be replaced with a fresh default layout."
						/>
					{/if}

					{#if p.addStart}
						<div class="change">
							<Label>
								Added {p.addStart.count} verse{p.addStart.count === 1 ? '' : 's'} at the start
							</Label>
							<div class="options">
								{#each ADD_START_OPTIONS as opt}
									<label class="opt">
										<input
											type="radio"
											name={`addStart-${p.passageId}`}
											value={opt.value}
											checked={decisions[p.passageId]?.addStartPlacement === opt.value}
											onchange={() => setDecision(p.passageId, 'addStartPlacement', opt.value)}
										/>
										<span>{opt.label}</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}

					{#if p.addEnd}
						<div class="change">
							<Label>
								Added {p.addEnd.count} verse{p.addEnd.count === 1 ? '' : 's'} at the end
							</Label>
							<div class="options">
								{#each ADD_END_OPTIONS as opt}
									<label class="opt">
										<input
											type="radio"
											name={`addEnd-${p.passageId}`}
											value={opt.value}
											checked={decisions[p.passageId]?.addEndPlacement === opt.value}
											onchange={() => setDecision(p.passageId, 'addEndPlacement', opt.value)}
										/>
										<span>{opt.label}</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}

					{#if p.removeStart && p.removeStart.needsDecision}
						{@render removalEdge('removeStart', p, p.removeStart, 'next')}
					{/if}

					{#if p.removeEnd && p.removeEnd.needsDecision}
						{@render removalEdge('removeEnd', p, p.removeEnd, 'previous')}
					{/if}
				</div>
			</div>
		{/each}

		{#if footer}
			<!-- Spans the populated grid columns (auto-fit collapses empty trailing
			     tracks to zero), so this row is exactly as wide as the current card
			     row — letting right-aligned buttons track the cards' right edge for
			     any card count or wrap. -->
			<div class="grid-footer">{@render footer()}</div>
		{/if}
	</div>
{/if}


{#snippet removalEdge(edge, p, impact, neighborWord)}
	{@const cols = splitColumns(buildGroups(impact, neighborWord))}
	<div class="change">
		<Label>
			Removed {impact.count} verse{impact.count === 1 ? '' : 's'} from the {edge === 'removeStart'
				? 'start'
				: 'end'}
		</Label>

		<!-- Two stacking columns: each column's first heading top-aligns with the
		     other, avoiding the row-height gaps a single grid produces. Collapses
		     to one column when narrow, preserving reading order. -->
		<div class="entity-grid">

			{#each cols as col}
				{#if col.length}
					<div class="entity-col">
						{#each col as g (g.group)}
							{@render groupControl(edge, p, g.group, g.heading, g.items, g.choices)}
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/snippet}


{#snippet groupControl(edge, p, group, heading, items, choices)}
	<div class="entity-group">
		<p class="entity-head">{heading} <span class="entity-count">({items.length})</span></p>

		<!-- Read-only list of the affected items, for context. -->
		<ul class="entity-list">
			{#each items as item (item.id)}

				<li>
					{#if item.label}<span class="entity-ref">{item.label}</span>{/if}
					{#if item.summary}<span class="entity-summary">{item.summary}</span>{/if}
				</li>
			{/each}
		</ul>

		<!-- One decision for the whole group. Terse labels; tooltip explains. -->
		<div class="options">
			{#each choices as choice}
				{#if choice.can}
					<label class="opt" use:tooltip={{ content: choice.tip, placement: 'top', delay: 400 }}>
						<input
							type="radio"
							name={`${edge}-${group}-${p.passageId}`}
							value={choice.value}
							checked={groupDecision(p.passageId, edge, group) === choice.value}
							onchange={() => setGroupDecision(p.passageId, edge, group, choice.value)}
						/>
						<span>{choice.label}</span>
					</label>
				{/if}
			{/each}
		</div>
	</div>
{/snippet}

<style>
	/* Grid of passage blocks — two-column layout that only collapses to one
	   column when the content area is too narrow for two 30rem tracks. */
	.passage-grid {
		display: grid;
		/* Cap each passage box at 50rem (500px) so it never stretches to fill the
		   whole content area; still shrinks to 30rem and wraps on narrow screens.
		   justify-content keeps capped tracks left-aligned instead of spread out. */
		grid-template-columns: repeat(auto-fit, minmax(30rem, 50rem));
		justify-content: start;
		gap: 2.7rem;

		align-items: start;
	}


	.passage-block :global(h3) {
		margin: 0 0 1.2rem;
	}

	/* Full-width grid row for the action buttons. Spanning every column (auto-fit
	   collapses the empty trailing tracks) makes this row exactly as wide as the
	   current row of cards, so right-aligned buttons sit at the cards' right edge
	   for 1, 2, 3+ cards and any wrap — never stranded at the page edge. */
	.grid-footer {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
	}


	/* Clean bordered card; colors unchanged from the prior modal treatment. */
	.passage-card {
		padding: 1.8rem;
		border-radius: 0.6rem;
		border: solid 0.1rem var(--gray-700);
		background-color: var(--gray-lighter);
	}

	/* Roomier spacing between the Segments / Sections / Columns / Connections
	   groups and between change blocks. */
	.change + .change {
		margin-top: 2.7rem;
	}

	/* Two stacking columns. Groups are pre-distributed into .entity-col stacks so
	   each column's first heading top-aligns with the other's (unlike a single
	   grid, where a tall group strands its row-neighbor). align-items:start keeps
	   the columns top-aligned; collapses to one column when the card is narrow. */
	.entity-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1.5rem 2.4rem;
		align-items: start;
		margin-top: 1.5rem;
	}

	.entity-col {
		min-width: 0;
	}

	.entity-group {
		min-width: 0;
	}

	.entity-group + .entity-group {
		margin-top: 2.1rem;
	}




	.entity-head {
		margin: 0 0 0.3rem;
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--black);
	}

	.entity-count {
		font-weight: 400;
		color: var(--gray-300);
	}

	.entity-list {
		margin: 0 0 0.9rem;
		padding-left: 0.9rem;
		list-style: none;
		border-left: 0.2rem solid var(--gray-700);
	}

	.entity-list li {
		font-size: 1.4rem;
		line-height: 1.5;
		color: var(--gray-400);
	}

	.entity-ref {
		font-weight: 500;
		color: var(--black);
		margin-right: 0.5rem;
	}

	.entity-summary {
		color: var(--gray-300);
	}

	/* Radio options matching the RadioButtons element: blue accent, 0.6rem gap. */
	.options {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.opt {
		/* inline-flex + align-self:start so the label shrinks to its content
		   width — keeps the tooltip arrow centered over the visible text rather
		   than over the full grid-cell width. */
		display: inline-flex;
		align-self: flex-start;
		align-items: center;
		gap: 0.3rem;
		font-size: 1.4rem;
		color: var(--black);
		cursor: pointer;
	}


	.opt input {
		margin: 0;
		accent-color: var(--blue);
	}

	.opt input:focus,
	.opt input:focus-visible {
		box-shadow: 0rem 0rem 0rem 0rem;
	}
</style>
