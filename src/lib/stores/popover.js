import { writable } from 'svelte/store';

/**
 * Transient popover/toast store.
 *
 * Drives a single, app-level message popover (see Popover.svelte) used for
 * brief, self-dismissing notices — e.g. telling the user that a connection or
 * connection quick note they tried to add already exists but is hidden by a
 * toggle. The message centers on screen and clears itself after `duration` ms.
 *
 * @typedef {Object} PopoverState
 * @property {string} message - The text to display. Empty string hides the popover.
 * @property {number} id - Monotonic id; bumped on every show so the component
 *   can restart its enter transition even when the same message repeats.
 */

/** @type {import('svelte/store').Writable<PopoverState>} */
export const popoverStore = writable({ message: '', id: 0 });

/** @type {ReturnType<typeof setTimeout> | null} */
let dismissTimer = null;
let nextId = 0;

/**
 * Show a transient popover message that auto-dismisses.
 * Calling again while one is visible replaces the message and resets the timer.
 * @param {string} message - Text to display.
 * @param {number} [duration=3000] - How long (ms) to keep it visible.
 */
export function showPopover(message, duration = 3000) {
	if (dismissTimer) {
		clearTimeout(dismissTimer);
		dismissTimer = null;
	}

	nextId += 1;
	popoverStore.set({ message, id: nextId });

	dismissTimer = setTimeout(() => {
		popoverStore.set({ message: '', id: nextId });
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
