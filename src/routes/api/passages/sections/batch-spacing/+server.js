import { passageSection } from '$lib/server/db/schema.js';
import { createBatchOffsetHandler } from '$lib/server/db/linkGroups.js';

/**
 * PATCH /api/passages/sections/batch-spacing — write per-section topOffset values at once.
 * Body: { offsets: Record<sectionId, number | null> }. See $lib/server/db/linkGroups.js.
 */
export const PATCH = createBatchOffsetHandler(passageSection, 'topOffset', 'section spacing');
