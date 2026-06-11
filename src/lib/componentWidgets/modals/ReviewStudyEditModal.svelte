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
	 * Decisions keyed by passageId:
	 * {
	 *   [passageId]: {
	 *     addStartPlacement, addEndPlacement,  // 'extend'|'segment'|'section'|'column'
	 *     removeStartMode, removeEndMode       // 'merge'|'delete'
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

	// Seed sensible defaults whenever a new report arrives.
	$effect(() => {
		if (!report?.passages) return;
		const seeded = {};
		for (const p of report.passages) {
			const d = decisions[p.passageId] || {};
			seeded[p.passageId] = {
				addStartPlacement: d.addStartPlacement || 'extend',
				addEndPlacement: d.addEndPlacement || 'extend',
				// Merge is the safe default whenever merging is possible; otherwise delete.
				removeStartMode:
					d.removeStartMode || (p.removeStart && p.removeStart.canMerge ? 'merge' : 'delete'),
				removeEndMode:
					d.removeEndMode || (p.removeEnd && p.removeEnd.canMerge ? 'merge' : 'delete')
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
	 * Build a short "what will be lost" summary line for a removal impact.
	 */
	function lossSummary(impact) {
		const parts = [];
		if (impact.segmentsWithContent > 0) {
			parts.push(
				`${impact.segmentsWithContent} segment${impact.segmentsWithContent === 1 ? '' : 's'} with content`
			);
		}
		if (impact.sectionsWithContent > 0) {
			parts.push(
				`${impact.sectionsWithContent} section${impact.sectionsWithContent === 1 ? '' : 's'} with commentary`
			);
		}
		if (impact.columnsWithContent > 0) {
			parts.push(
				`${impact.columnsWithContent} column${impact.columnsWithContent === 1 ? '' : 's'} with commentary`
			);
		}
		if (impact.connections > 0) {
			parts.push(`${impact.connections} connection${impact.connections === 1 ? '' : 's'}`);
		}
		return parts.join(', ');
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
					<div class="change">
						<p class="change-title">
							Removed {p.removeStart.count} verse{p.removeStart.count === 1 ? '' : 's'} from the start
							{#if p.removeStart.reference}<span class="ref">({p.removeStart.reference})</span>{/if}
						</p>
						<p class="change-loss">This would remove: {lossSummary(p.removeStart)}.</p>
						<div class="options">
							{#if p.removeStart.canMerge}
								<label class="opt">
									<input
										type="radio"
										name={`removeStart-${p.passageId}`}
										value="merge"
										checked={decisions[p.passageId]?.removeStartMode === 'merge'}
										onchange={() => setDecision(p.passageId, 'removeStartMode', 'merge')}
									/>
									<span>Merge headings, notes &amp; commentary into the next segment (recommended)</span>
								</label>
							{/if}
							<label class="opt">
								<input
									type="radio"
									name={`removeStart-${p.passageId}`}
									value="delete"
									checked={decisions[p.passageId]?.removeStartMode === 'delete'}
									onchange={() => setDecision(p.passageId, 'removeStartMode', 'delete')}
								/>
								<span>Delete it permanently</span>
							</label>
						</div>
						{#if p.removeStart.connections > 0}
							<p class="change-note">
								Note: connections attached to the removed verses can't be reattached and will be
								deleted either way.
							</p>
						{/if}
					</div>
				{/if}

				{#if p.removeEnd && p.removeEnd.needsDecision}
					<div class="change">
						<p class="change-title">
							Removed {p.removeEnd.count} verse{p.removeEnd.count === 1 ? '' : 's'} from the end
							{#if p.removeEnd.reference}<span class="ref">({p.removeEnd.reference})</span>{/if}
						</p>
						<p class="change-loss">This would remove: {lossSummary(p.removeEnd)}.</p>
						<div class="options">
							{#if p.removeEnd.canMerge}
								<label class="opt">
									<input
										type="radio"
										name={`removeEnd-${p.passageId}`}
										value="merge"
										checked={decisions[p.passageId]?.removeEndMode === 'merge'}
										onchange={() => setDecision(p.passageId, 'removeEndMode', 'merge')}
									/>
									<span>Merge headings, notes &amp; commentary into the previous segment (recommended)</span>
								</label>
							{/if}
							<label class="opt">
								<input
									type="radio"
									name={`removeEnd-${p.passageId}`}
									value="delete"
									checked={decisions[p.passageId]?.removeEndMode === 'delete'}
									onchange={() => setDecision(p.passageId, 'removeEndMode', 'delete')}
								/>
								<span>Delete it permanently</span>
							</label>
						</div>
						{#if p.removeEnd.connections > 0}
							<p class="change-note">
								Note: connections attached to the removed verses can't be reattached and will be
								deleted either way.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</Modal>

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

	.change-loss {
		margin: 0 0 0.6rem;
		font-size: 1.4rem;
		color: var(--red-darker, #8a1f1f);
	}

	.change-note {
		margin: 0.6rem 0 0;
		font-size: 1.3rem;
		line-height: 1.5;
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
