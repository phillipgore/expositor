<script>
	/**
	 * # Edit Study flow layout
	 *
	 * Wraps both the Edit Study form (`/study/[id]/edit`) and its full-page
	 * Review (`/study/[id]/edit/review`). Because this layout stays mounted while
	 * the user moves between those two pages, it's the right place to guard exits
	 * from the whole flow.
	 *
	 * ## Why it exists
	 * In-progress edits live in two places until saved:
	 *   - unsaved form fields (tracked via the `studyEditDirty` store), and
	 *   - the review hand-off payload stashed in sessionStorage once the user
	 *     clicks "Next".
	 * Previously these were only discarded by the explicit Cancel buttons (and on
	 * save). Leaving by ANY other route — viewing a study, the Glossary, Finder,
	 * etc. — silently abandoned the edit while leaving the sessionStorage payload
	 * behind to rehydrate on a later edit.
	 *
	 * This layout intercepts those exits with `beforeNavigate` and asks the user
	 * to confirm via an "Unsaved Changes" modal. Confirming clears both the store
	 * and the stashed payload, then proceeds; staying cancels the navigation.
	 *
	 * Movement WITHIN the flow (edit ↔ review) is always allowed and preserves
	 * the in-progress edit.
	 */
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Modal from '$lib/componentElements/Modal.svelte';
	import { studyEditDirty, clearStudyEditDirty } from '$lib/stores/studyEditDirty.js';
	import { pendingEditKey, armedKey } from '$lib/utils/pendingEdit.js';

	let { children } = $props();

	const studyId = $page.params.id;
	const editRoot = `/study/${studyId}/edit`;

	let showLeaveModal = $state(false);
	// The destination the user attempted to reach; replayed once they confirm.
	let pendingNavUrl = $state(null);
	// Set true after the user confirms leaving, so the replayed navigation passes
	// straight through the guard instead of re-triggering the prompt.
	let confirmedLeave = $state(false);

	/** True when a review hand-off payload is still stashed in sessionStorage. */
	function hasPendingPayload() {
		try {
			return !!sessionStorage.getItem(pendingEditKey(studyId));
		} catch {
			return false;
		}
	}

	/** Discard both the unsaved-changes flag and the stashed review payload. */
	function discardInProgressEdit() {
		clearStudyEditDirty();
		try {
			sessionStorage.removeItem(pendingEditKey(studyId));
			sessionStorage.removeItem(armedKey(studyId));
		} catch {
			// sessionStorage unavailable — nothing to clear.
		}
	}

	beforeNavigate((nav) => {
		const dest = nav.to?.url.pathname ?? '';

		// Staying inside the edit flow (edit ↔ review): always allow, keep edit.
		if (dest === editRoot || dest.startsWith(`${editRoot}/`)) return;

		// The user already confirmed leaving — let the replayed navigation pass.
		if (confirmedLeave) return;

		// Nothing in progress (saved, or never edited) — nothing to warn about.
		// The form's dirty flag covers unsaved fields; the stashed payload covers
		// the review page, where the form is unmounted and the flag is cleared.
		if (!$studyEditDirty && !hasPendingPayload()) return;

		// Otherwise intercept and ask the user to confirm.
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
	showCloseButton={false}
	closeOnBackdropClick={false}
>
	<p class="modal-message">
		You have unsaved changes to this study. If you leave now, your in-progress
		edits will be discarded.
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
