<script>
	/**
	 * # Edit Series flow layout
	 *
	 * Wraps the Edit Series form and its full-page Review. Because this layout stays mounted while
	 * the user moves between them, it is the right place to guard exits from the whole flow.
	 *
	 * Mirrors `/study/[id]/edit/+layout.svelte`: in-progress edits live in the form's fields (via
	 * `studyEditDirty`) and, once Next is pressed, in the sessionStorage hand-off payload. Leaving
	 * by any other route would abandon the edit while leaving that payload behind to rehydrate on a
	 * later visit.
	 *
	 * Movement WITHIN the flow (edit ↔ review) is always allowed and preserves the edit.
	 */
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Modal from '$lib/componentElements/Modal.svelte';
	import { studyEditDirty, clearStudyEditDirty } from '$lib/stores/studyEditDirty.js';
	import { pendingEditKey, armedKey } from '$lib/utils/pendingEdit.js';

	let { children } = $props();

	const seriesId = $page.params.id;
	const editRoot = `/series/${seriesId}/edit`;

	let showLeaveModal = $state(false);
	let pendingNavUrl = $state(null);
	let confirmedLeave = $state(false);

	function hasPendingPayload() {
		try {
			return !!sessionStorage.getItem(pendingEditKey(seriesId));
		} catch {
			return false;
		}
	}

	function discardInProgressEdit() {
		clearStudyEditDirty();
		try {
			sessionStorage.removeItem(pendingEditKey(seriesId));
			sessionStorage.removeItem(armedKey(seriesId));
		} catch {
			// sessionStorage unavailable — nothing to clear.
		}
	}

	beforeNavigate((nav) => {
		const dest = nav.to?.url.pathname ?? '';

		// Staying inside the edit flow (edit ↔ review): always allow, keep the edit.
		if (dest === editRoot || dest.startsWith(`${editRoot}/`)) return;

		// The user already confirmed leaving — let the replayed navigation pass.
		if (confirmedLeave) return;

		// Nothing in progress. The dirty flag covers unsaved fields; the stashed payload covers the
		// review page, where the form is unmounted and the flag is cleared.
		if (!$studyEditDirty && !hasPendingPayload()) return;

		nav.cancel();
		pendingNavUrl = nav.to?.url ?? null;
		showLeaveModal = true;
	});

	function confirmLeave() {
		confirmedLeave = true;
		discardInProgressEdit();
		showLeaveModal = false;
		const target = pendingNavUrl;
		pendingNavUrl = null;
		if (target) goto(target);
	}

	function stay() {
		showLeaveModal = false;
		pendingNavUrl = null;
	}
</script>

{@render children()}

<Modal
	isOpen={showLeaveModal}
	title="Unsaved Changes"
	size="small"
	confirmLabel="Leave"
	confirmClasses="red"
	cancelLabel="Stay"
	onConfirm={confirmLeave}
	onCancel={stay}
	onClose={stay}
	closeOnBackdropClick={false}
>
	<p class="modal-message">
		You have unsaved changes to this series. If you leave now, your in-progress edits will be
		discarded.
	</p>
</Modal>

<style>
	p.modal-message {
		margin: 0;
		font-size: 1.6rem;
		line-height: 1.75;
		color: var(--gray-400);
	}
</style>
