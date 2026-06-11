<script>
	/**
	 * # ReviewStudyEditModal Component
	 *
	 * Shown when editing a study changes one or more passage verse ranges in a way
	 * that needs the user's input before saving. It surfaces, per passage:
	 *
	 * - **Added verses** (at the start and/or end): where should they go?
	 *   → extend the neighboring segment, or start a new Segment / Section / Column.
	 * - **Removed verses** that contain structure with content (headings, notes,
	 *   commentary, tags) or connections: what to do with that content?
	 *   → Merge it into the adjacent surviving segment, or Delete it.
	 * - **Book/testament change** (full replace): a plain warning that the old
	 *   structure for that passage will be rebuilt fresh.
	 *
	 * The collected decisions are keyed by passage id and returned to the parent,
	 * which submits them alongside the form so the server reconciler can apply them.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object|null} report - { passages: [...], requiresReview } from analyze-edit
	 * @property {Function} onConfirm - (decisions) => void | Promise
	 * @property {Function} onCancel
	 * @property {boolean} isSaving
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';

	let { isOpen = false, report = null, onConfirm, onCancel, isSaving = false } = $props();

	/**
	 * Decisions keyed by passageId. Add placements are scalars; each removal edge
	 * carries ONE choice per entity kind, applied to every orphaned item of that
	 * kind:
	 * {
	 *   [passageId]: {
	 *     addStartPlacement, addEndPlacement,    // 'extend'|'segment'|'section'|'column'
	 *     removeStart: {
	 *       segments:    'merge'|'delete',
	 *       sections:    'merge'|'delete',
	 *       columns:     'merge'|'delete',
	 *       connections: 'reanchor'|'delete'
	 *     },
	 *     removeEnd: { ...same shape... }
	 *   }
	 * }
	 */
	let decisions = $state({});


	// The "extend" option is phrased per edge: prepend at the start, append at
	// the end. The remaining options are identical for both edges.
	const NEW_OPTIONS = [
		{ value: 'segment', label: 'New Segment' },
		{ value: 'section', label: 'New Section' },
		{ value: 'column', label: 'New Column' }
	];
	const ADD_START_OPTIONS = [
		{ value: 'extend', label: 'Prepend to first segment' },
		...NEW_OPTIONS
	];
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
			sections: seedGroup(impact.sections, prior.sections, 'canMerge', 'merge'),
			columns: seedGroup(impact.columns, prior.columns, 'canMerge', 'merge'),
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
	 * @param {'segments'|'sections'|'columns'|'connections'} group
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


	async function handleConfirm() {
		if (onConfirm) await onConfirm(decisions);
	}
</script>

<Modal
	{isOpen}
	title="Review Passage Changes"
	size="large"
	confirmLabel={isSaving ? 'Saving...' : 'Save Changes'}
	confirmClasses="blue"
	confirmDisabled={isSaving}
	cancelLabel="Cancel"
	onConfirm={handleConfirm}
	onCancel={onCancel}
	onClose={onCancel}
	showCloseButton={false}
	closeOnBackdropClick={false}
>
	{#if report?.passages}
		<p class="intro">
			Your edits change the verses in {report.passages.length} passage{report.passages.length === 1
				? ''
				: 's'}. Choose how to handle each change below. Everything else in your study is preserved.
		</p>

		{#each report.passages as p (p.passageId)}
			<div class="passage-block">
				<h3 class="passage-label">{p.label}</h3>

				{#if p.replace}
					<div class="change warn">
						<p>
							This passage now points to a different book. Its existing columns, sections,
							segments, headings, notes, commentary, tags, and connections cannot be carried over
							and <strong>will be replaced</strong> with a fresh default layout.
						</p>
					</div>
				{/if}

				{#if p.addStart}
					<div class="change">
						<p class="change-title">
							Added {p.addStart.count} verse{p.addStart.count === 1 ? '' : 's'} at the start
							{#if p.addStart.reference}<span class="ref">({p.addStart.reference})</span>{/if}
						</p>
						<p class="change-q">Where should these new verses go?</p>
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
						<p class="change-title">
							Added {p.addEnd.count} verse{p.addEnd.count === 1 ? '' : 's'} at the end
							{#if p.addEnd.reference}<span class="ref">({p.addEnd.reference})</span>{/if}
						</p>
						<p class="change-q">Where should these new verses go?</p>
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
		{/each}
	{/if}
</Modal>

{#snippet removalEdge(edge, p, impact, neighborWord)}
	<div class="change">
		<p class="change-title">
			Removed {impact.count} verse{impact.count === 1 ? '' : 's'} from the {edge === 'removeStart'
				? 'start'
				: 'end'}
			{#if impact.reference}<span class="ref">({impact.reference})</span>{/if}
		</p>
		<p class="change-q">
			Choose what happens to the content anchored to the removed verses. Each choice below
			applies to every affected item of that kind.
		</p>

		{#if impact.segments && impact.segments.length}
			{@render groupControl(edge, p, 'segments', 'Segments', impact.segments, [
				{ value: 'merge', label: `Merge into the ${neighborWord} segment`, can: impact.segments.some((i) => i.canMerge) },
				{ value: 'delete', label: 'Delete permanently', can: true }
			])}
		{/if}

		{#if impact.sections && impact.sections.length}
			{@render groupControl(edge, p, 'sections', 'Sections', impact.sections, [
				{ value: 'merge', label: `Merge commentary into the ${neighborWord} section`, can: impact.sections.some((i) => i.canMerge) },
				{ value: 'delete', label: 'Delete permanently', can: true }
			])}
		{/if}

		{#if impact.columns && impact.columns.length}
			{@render groupControl(edge, p, 'columns', 'Columns', impact.columns, [
				{ value: 'merge', label: `Merge commentary into the ${neighborWord} column`, can: impact.columns.some((i) => i.canMerge) },
				{ value: 'delete', label: 'Delete permanently', can: true }
			])}
		{/if}

		{#if impact.connections && impact.connections.length}
			{@render groupControl(edge, p, 'connections', 'Connections', impact.connections, [
				{ value: 'reanchor', label: 'Re-anchor to the surviving item (merge if it already exists)', can: impact.connections.some((i) => i.canReanchor) },
				{ value: 'delete', label: 'Delete permanently', can: true }
			])}
		{/if}
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

		<!-- One decision for the whole group. -->
		<div class="options">
			{#each choices as choice}
				{#if choice.can}
					<label class="opt">
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
	p.intro {
		margin: 0 0 1.5rem;
		font-size: 1.5rem;
		line-height: 1.6;
		color: var(--gray-400);
	}

	.passage-block {
		border: 0.1rem solid var(--gray-lighter);
		border-radius: 0.5rem;
		padding: 1.2rem 1.5rem;
		margin-bottom: 1.2rem;
	}

	.passage-label {
		margin: 0 0 0.9rem;
		font-size: 1.8rem;
		font-weight: 600;
		color: var(--black);
	}

	.change {
		margin-top: 1.2rem;
		padding-top: 1.2rem;
		border-top: 0.1rem solid var(--gray-lighter);
	}

	.change:first-of-type {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}

	.change.warn p {
		background-color: var(--orange-lighter, #fff4e5);
		color: var(--orange-darker, #8a4b00);
		border: 0.1rem solid var(--orange-light, #ffd9a8);
		border-radius: 0.3rem;
		padding: 0.6rem 0.9rem;
		margin: 0;
		font-size: 1.4rem;
		line-height: 1.6;
	}

	.change-title {
		margin: 0 0 0.4rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--black);
	}

	.change-title .ref {
		font-weight: 400;
		color: var(--gray-300);
	}

	.change-q {
		margin: 0 0 0.6rem;
		font-size: 1.4rem;
		color: var(--gray-400);
	}

	.entity-group {
		margin-top: 0.9rem;
	}

	.entity-head {
		margin: 0 0 0.3rem;
		font-size: 1.3rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05rem;
		color: var(--gray-300);
	}

	.entity-count {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--gray-300);
	}

	.entity-list {
		margin: 0 0 0.5rem;
		padding-left: 0.9rem;
		list-style: none;
		border-left: 0.2rem solid var(--gray-lighter);
	}

	.entity-list li {
		font-size: 1.4rem;
		line-height: 1.5;
		color: var(--gray-400);
	}

	.entity-ref {
		font-weight: 600;
		color: var(--black);
		margin-right: 0.5rem;
	}

	.entity-summary {
		color: var(--gray-300);
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.opt {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.4rem;
		color: var(--gray-400);
		cursor: pointer;
	}

	.opt input {
		margin: 0;
	}
</style>
