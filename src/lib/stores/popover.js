import { writable } from 'svelte/store';

/**
 * Transient popover/toast store.
 *
 * Drives a single, app-level message popover (see Popover.svelte) used for
 * brief, self-dismissing notices — e.g. telling the user that a connection or
 * connection quick note they tried to add already exists but is hidden by a
 * toggle. The message centers on screen and clears itself after `duration` ms.
 *
 * @typedef {'notice' | 'error'} PopoverVariant
 *
 * @typedef {Object} PopoverState
 * @property {string} message - The text to display. Empty string hides the popover.
 * @property {number} id - Monotonic id; bumped on every show so the component
 *   can restart its enter transition even when the same message repeats.
 * @property {PopoverVariant} variant - 'notice' is the calm, self-dismissing default.
 *   'error' is styled as a failure, announced assertively, and stays until dismissed.
 */

/** @type {import('svelte/store').Writable<PopoverState>} */
export const popoverStore = writable({ message: '', id: 0, variant: 'notice' });

/** @type {ReturnType<typeof setTimeout> | null} */
let dismissTimer = null;
let nextId = 0;

/**
 * Show a transient popover message that auto-dismisses.
 * Calling again while one is visible replaces the message and resets the timer.
 *
 * @param {string} message - Text to display.
 * @param {number} [duration=3000] - How long (ms) to keep it visible.
 */
export function showPopover(message, duration = 3000) {
	setPopover(message, { variant: 'notice', duration });
}

/**
 * Show a failure.
 *
 * Sticky by default, and deliberately so: this replaced `window.alert()`, which BLOCKED until
 * the user acknowledged it. A three-second toast for "Failed to insert column" would be a
 * quieter surface than the one it replaced, which is the opposite of the intent — the user needs
 * to know the thing they asked for did not happen. Notices stay on their timer; only failures
 * wait to be dismissed.
 *
 * @param {string} message - Text to display.
 * @param {number | null} [duration=null] - ms to keep it visible, or null to wait for a dismissal.
 */
export function showPopoverError(message, duration = null) {
	setPopover(message, { variant: 'error', duration });
}

/**
 * @param {string} message
 * @param {{ variant: PopoverVariant, duration: number | null }} options
 */
function setPopover(message, { variant, duration }) {
	if (dismissTimer) {
		clearTimeout(dismissTimer);
		dismissTimer = null;
	}

	nextId += 1;
	popoverStore.set({ message, id: nextId, variant });

	// `null` means the message waits for `hidePopover()` — either the user's dismiss button or the
	// next call to show something else.
	if (duration === null) return;

	dismissTimer = setTimeout(() => {
		popoverStore.set({ message: '', id: nextId, variant });
		dismissTimer = null;
	}, duration);
}

/**
 * Immediately hide the popover and cancel any pending auto-dismiss.
 */
export function hidePopover() {
	if (dismissTimer) {
		clearTimeout(dismissTimer);
		dismissTimer = null;
	}
	popoverStore.update((state) => ({ ...state, message: '' }));
}
